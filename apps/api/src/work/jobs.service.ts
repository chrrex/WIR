import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { createRun } from './checklists.controller';
import { nextOccurrence } from './recurrence';

const H = 3600_000;

/**
 * Hintergrund-Aufgaben alle 5 Minuten (ADR-043). Jede Erinnerung hat einen festen dedupeKey –
 * dadurch kommt sie je Person und Anlass höchstens einmal, egal wie oft der Job läuft.
 */
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly notifications: NotificationService) {}

  onModuleInit() {
    if (process.env.JOBS === 'off' || process.env.NODE_ENV === 'test') return;
    const run = () => this.run().catch((e) => console.error('Jobs:', e.message));
    setTimeout(run, 30_000).unref();
    this.timer = setInterval(run, 5 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async run(now = new Date()) {
    return { published: await this.content.publishDue(now), started: await this.recurringChecklists(now), overdue: await this.overdueRuns(now), tasks: await this.tasksDue(now), acks: await this.openAcks(now), surveys: await this.surveysClosing(now) };
  }

  /** Wiederkehrende Checklisten starten (z. B. HACCP täglich 06:00), fällig nach 4 Stunden. */
  private async recurringChecklists(now: Date) {
    const db = this.prisma.db;
    const due = await db.checklist.findMany({ where: { isActive: true, recurrenceRule: { not: null }, nextRunAt: { lte: now }, groupId: { not: null } }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } });
    for (const t of due) {
      // erst den nächsten Termin setzen – so startet ein Lauf nie doppelt, auch wenn zwei Server laufen
      const claimed = await db.checklist.updateMany({ where: { id: t.id, nextRunAt: t.nextRunAt }, data: { nextRunAt: nextOccurrence(t.recurrenceRule!, now, t.recurrenceTz) } });
      if (!claimed.count) continue;
      const { item, recipientIds } = await createRun(this.content, t, null, new Date(now.getTime() + 4 * H));
      await this.notifications.notify({ recipientIds, eventType: 'checklist.due', title: `Checkliste fällig: ${t.title}`, body: 'Bitte in den nächsten 4 Stunden erledigen.', linkPath: `/checklisten/${item.id}`, contentItemId: item.id, dedupeKey: `run:${item.id}` });
    }
    return due.length;
  }

  /** Überfällige Läufe markieren und der Teamleitung melden. */
  private async overdueRuns(now: Date) {
    const db = this.prisma.db;
    const runs = await db.checklistRun.findMany({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] }, dueAt: { lt: now } }, include: { checklist: { select: { groupId: true } } } });
    for (const r of runs) {
      await db.checklistRun.update({ where: { id: r.id }, data: { status: 'OVERDUE' } });
      const leads = r.checklist.groupId ? await db.groupMembership.findMany({ where: { groupId: r.checklist.groupId, isLead: true }, select: { userId: true } }) : [];
      await this.notifications.notify({ recipientIds: leads.map((l) => l.userId), eventType: 'checklist.overdue', importance: 'IMPORTANT', title: `Überfällig: ${r.title}`, body: 'Die Checkliste wurde nicht rechtzeitig abgeschlossen.', linkPath: `/checklisten/${r.id}`, contentItemId: r.id, dedupeKey: `overdue:${r.id}` });
    }
    return runs.length;
  }

  /** Aufgaben, die in den nächsten 24 Stunden fällig sind. */
  private async tasksDue(now: Date) {
    const tasks = await this.prisma.db.task.findMany({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { gt: new Date(now.getTime() - 24 * H), lte: new Date(now.getTime() + 24 * H) }, contentItem: { status: 'PUBLISHED', deletedAt: null } },
      include: { contentItem: { select: { recipients: { where: { removedAt: null }, select: { userId: true } }, authorId: true } } } });
    for (const t of tasks) {
      const ids = t.contentItem.recipients.map((r) => r.userId).filter((u) => u !== t.contentItem.authorId);
      await this.notifications.notify({ recipientIds: ids, eventType: 'task.due', title: t.dueAt! < now ? `Überfällig: ${t.title}` : `Bald fällig: ${t.title}`, linkPath: `/aufgaben/${t.id}`, contentItemId: t.id, dedupeKey: `task-due:${t.id}` });
    }
    return tasks.length;
  }

  /** „Gelesen und verstanden“ nach 3 Tagen noch offen → einmal je Version erinnern. */
  private async openAcks(now: Date) {
    const db = this.prisma.db;
    const items = await db.contentItem.findMany({ where: { requiresAcknowledgement: true, status: 'PUBLISHED', deletedAt: null, knowledgeArticle: { versions: { some: { status: 'PUBLISHED', publishedAt: { lte: new Date(now.getTime() - 72 * H) } } } } },
      include: { recipients: { where: { removedAt: null }, select: { userId: true } }, readReceipts: { select: { userId: true, acknowledgedVersion: true } }, knowledgeArticle: { include: { versions: { where: { status: 'PUBLISHED' }, select: { title: true } } } } } });
    let n = 0;
    for (const i of items) {
      const done = new Set(i.readReceipts.filter((r) => r.acknowledgedVersion === i.currentVersion).map((r) => r.userId));
      const open = i.recipients.map((r) => r.userId).filter((u) => !done.has(u) && u !== i.authorId);
      n += await this.notifications.notify({ recipientIds: open, eventType: 'reminder', title: `Bitte bestätigen: ${i.knowledgeArticle!.versions[0]?.title ?? 'Arbeitsanweisung'}`, body: '„Gelesen und verstanden“ ist noch offen.', linkPath: `/wissen/${i.id}`, contentItemId: i.id, dedupeKey: `ack:${i.id}:${i.currentVersion}` });
    }
    return n;
  }

  /** Umfrage endet in 24 Stunden → wer noch nicht teilgenommen hat, wird einmal erinnert. */
  private async surveysClosing(now: Date) {
    const surveys = await this.prisma.db.survey.findMany({ where: { closesAt: { gt: now, lte: new Date(now.getTime() + 24 * H) } },
      include: { participations: { select: { userId: true } }, contentItem: { select: { authorId: true, recipients: { where: { removedAt: null }, select: { userId: true } } } } } });
    for (const s of surveys) {
      const done = new Set(s.participations.map((p) => p.userId));
      const open = s.contentItem.recipients.map((r) => r.userId).filter((u) => !done.has(u) && u !== s.contentItem.authorId);
      await this.notifications.notify({ recipientIds: open, eventType: 'reminder', title: `Umfrage endet morgen: ${s.title}`, linkPath: `/umfragen/${s.id}`, contentItemId: s.id, dedupeKey: `survey-closing:${s.id}` });
    }
    return surveys.length;
  }
}
