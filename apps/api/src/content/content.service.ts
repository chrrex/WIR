import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentType, Prisma } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { FeatureService } from '../common/feature.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { can, PolicyContext } from '../policy/engine';
import { AudienceService, AudienceTarget } from './audience.service';

export const LIVE_STATUS = ['ACTIVE', 'INVITED'] as const;

/** Lesezeitpunkte nur als Datum speichern (ADR-012, Datensparsamkeit). */
export function dateOnly(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Text in das gespeicherte Body-Format (Phase 2: Absätze als Klartext). */
export function toBody(text: string) {
  return { type: 'text', paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) };
}

export interface CreateContentInput {
  type: ContentType;
  companyId: string | null;
  /** null = vom System angelegt (z. B. wiederkehrende Checkliste) */
  authorId: string | null;
  importance?: 'NORMAL' | 'IMPORTANT';
  commentsEnabled?: boolean;
  requiresAcknowledgement?: boolean;
  reactionsEnabled?: boolean;
  expiresAt?: Date | null;
  targets: AudienceTarget[];
  attachmentFileIds?: Array<{ fileId: string; altText?: string | null }>;
  /** Subtyp anlegen (posts / handovers) mit der ID des Inhalts */
  createSubtype: (tx: Prisma.TransactionClient, id: string) => Promise<unknown>;
}

/**
 * Gemeinsame Logik aller „Push-Inhalte“ (News, Social, Übergaben):
 * Zielgruppen → Empfänger:innen (content_recipients), Sichtbarkeit, Kommentare,
 * Reaktionen, Erwähnungen, Lesestatus, Meldungen. Siehe docs/RBAC.md §5.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audiences: AudienceService,
    private readonly notifications: NotificationService,
    private readonly features: FeatureService,
    private readonly audit: AuditService,
  ) {}

  /** Prisma-Filter: veröffentlicht und für die Person sichtbar (Empfänger:in oder Autor:in). */
  visibleWhere(userId: string): Prisma.ContentItemWhereInput {
    return {
      deletedAt: null,
      OR: [
        { status: 'PUBLISHED', recipients: { some: { userId, removedAt: null } } },
        { authorId: userId, status: { in: ['PUBLISHED', 'DRAFT'] } },
      ],
    };
  }

  async create(input: CreateContentInput) {
    const recipientIds = await this.audiences.resolve(input.targets);
    const db = this.prisma.db;
    const files = input.attachmentFileIds ?? [];
    if (files.length) {
      const owned = await db.fileObject.count({ where: { id: { in: files.map((f) => f.fileId) }, uploadedById: input.authorId, deletedAt: null } });
      if (owned !== files.length) throw new BadRequestException('Mindestens ein Bild gehört nicht zu dir oder fehlt.');
      const used = await db.attachment.count({ where: { fileObjectId: { in: files.map((f) => f.fileId) } } });
      if (used) throw new BadRequestException('Ein Bild ist bereits an einem anderen Beitrag.');
    }
    const item = await db.$transaction(async (tx) => {
      const ci = await tx.contentItem.create({
        data: {
          type: input.type,
          companyId: input.companyId,
          authorId: input.authorId,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          importance: input.importance ?? 'NORMAL',
          commentsEnabled: input.commentsEnabled ?? true,
          reactionsEnabled: input.reactionsEnabled ?? true,
          requiresAcknowledgement: input.requiresAcknowledgement ?? false,
          expiresAt: input.expiresAt ?? null,
        },
      });
      await input.createSubtype(tx, ci.id);
      await tx.contentAudience.createMany({
        data: input.targets.map((t) => ({
          contentItemId: ci.id,
          targetType: t.type === 'ALL' ? 'ALL_USERS' : t.type,
          companyId: t.type === 'COMPANY' ? t.companyId : null,
          groupId: t.type === 'GROUP' ? t.groupId : null,
          userId: t.type === 'USER' ? t.userId : null,
        })),
      });
      await tx.contentRecipient.createMany({
        data: [...new Set([...recipientIds, ...(input.authorId ? [input.authorId] : [])])].map((userId) => ({ contentItemId: ci.id, userId })),
        skipDuplicates: true,
      });
      if (files.length) {
        await tx.attachment.createMany({
          data: files.map((f, i) => ({ fileObjectId: f.fileId, contentItemId: ci.id, kind: 'IMAGE', altText: f.altText ?? null, sortOrder: i })),
        });
      }
      return ci;
    });
    return { item, recipientIds: recipientIds.filter((id) => id !== input.authorId) };
  }

  /** Lädt einen Inhalt, wenn die Person ihn sehen darf – sonst 404 (kein Hinweis auf Existenz). */
  async getVisible(userId: string, id: string) {
    const item = await this.prisma.db.contentItem.findFirst({
      where: { id, ...this.visibleWhere(userId) },
      include: {
        post: true, handover: { include: { group: true } }, idea: true, task: true, survey: true, document: true, checklistRun: true,
        knowledgeArticle: { include: { versions: { where: { status: 'PUBLISHED' }, take: 1, select: { title: true } } } },
        author: { select: { id: true, displayName: true, employeeProfile: { select: { jobTitle: true } } } } },
    });
    if (!item) throw new NotFoundException('Diesen Beitrag gibt es nicht oder er ist nicht für dich bestimmt.');
    return item;
  }

  /** Anzeigetitel eines Inhalts – egal welcher Typ. */
  titleOf(item: Awaited<ReturnType<ContentService['getVisible']>>) {
    return item.post?.title ?? item.handover?.subject ?? item.idea?.title ?? item.task?.title ?? item.survey?.title ?? item.document?.title
      ?? item.checklistRun?.title ?? item.knowledgeArticle?.versions[0]?.title ?? 'Beitrag';
  }

  /** Neue Kolleg:innen bekommen laufende Inhalte ihrer Zielgruppen (include_late_joiners). */
  async addLateJoiner(userId: string) {
    const db = this.prisma.db;
    const since = new Date(Date.now() - 60 * 864e5);
    const audiences = await db.contentAudience.findMany({
      where: { includeLateJoiners: true, targetType: { in: ['ALL_USERS', 'COMPANY', 'GROUP'] }, contentItem: { status: 'PUBLISHED', deletedAt: null, publishedAt: { gte: since } } },
    });
    const items = new Set<string>();
    for (const a of audiences) {
      const t: AudienceTarget = a.targetType === 'ALL_USERS' ? { type: 'ALL' } : a.targetType === 'COMPANY' ? { type: 'COMPANY', companyId: a.companyId! } : { type: 'GROUP', groupId: a.groupId! };
      if ((await this.audiences.resolve([t])).includes(userId)) items.add(a.contentItemId);
    }
    if (items.size) {
      await db.contentRecipient.createMany({ data: [...items].map((contentItemId) => ({ contentItemId, userId, reason: 'LATE_JOIN' as const })), skipDuplicates: true });
    }
    return items.size;
  }

  async attachmentsFor(contentItemIds: string[]) {
    const rows = await this.prisma.db.attachment.findMany({ where: { contentItemId: { in: contentItemIds } }, orderBy: { sortOrder: 'asc' } });
    const map = new Map<string, Array<{ fileId: string; altText: string | null }>>();
    for (const r of rows) {
      const list = map.get(r.contentItemId!) ?? [];
      list.push({ fileId: r.fileObjectId, altText: r.altText });
      map.set(r.contentItemId!, list);
    }
    return map;
  }

  /** Gemeinsame Zusatzinfos für Listen: gelesen, Likes, Kommentare, Bilder. */
  async decorate(userId: string, ids: string[]) {
    const db = this.prisma.db;
    const [receipts, likes, myLikes, comments, attachments] = await Promise.all([
      db.readReceipt.findMany({ where: { userId, contentItemId: { in: ids } }, select: { contentItemId: true } }),
      db.reaction.groupBy({ by: ['contentItemId'], where: { contentItemId: { in: ids } }, _count: true }),
      db.reaction.findMany({ where: { userId, contentItemId: { in: ids } }, select: { contentItemId: true } }),
      db.comment.groupBy({ by: ['contentItemId'], where: { contentItemId: { in: ids }, deletedAt: null }, _count: true }),
      this.attachmentsFor(ids),
    ]);
    const read = new Set(receipts.map((r) => r.contentItemId));
    const liked = new Set(myLikes.map((r) => r.contentItemId));
    const likeCount = new Map(likes.map((l) => [l.contentItemId, l._count]));
    const commentCount = new Map(comments.map((c) => [c.contentItemId, c._count]));
    return (id: string) => ({
      read: read.has(id),
      liked: liked.has(id),
      likes: likeCount.get(id) ?? 0,
      comments: commentCount.get(id) ?? 0,
      images: attachments.get(id) ?? [],
    });
  }

  async markSeen(userId: string, id: string) {
    await this.getVisible(userId, id);
    const day = dateOnly();
    await this.prisma.db.readReceipt.upsert({
      where: { contentItemId_userId: { contentItemId: id, userId } },
      create: { contentItemId: id, userId, firstSeenAt: day, openedAt: day },
      update: {},
    });
    await this.prisma.db.notification.updateMany({ where: { recipientId: userId, contentItemId: id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  async toggleLike(userId: string, id: string) {
    const item = await this.getVisible(userId, id);
    if (!item.reactionsEnabled) throw new BadRequestException('Reaktionen sind hier ausgeschaltet.');
    const db = this.prisma.db;
    const existing = await db.reaction.findFirst({ where: { userId, contentItemId: id } });
    if (existing) await db.reaction.delete({ where: { id: existing.id } });
    else await db.reaction.create({ data: { userId, contentItemId: id, type: 'LIKE' } });
    const likes = await db.reaction.count({ where: { contentItemId: id } });
    return { liked: !existing, likes };
  }

  // ---- Kommentare ------------------------------------------------------------

  async listComments(userId: string, id: string, ctx: PolicyContext) {
    await this.getVisible(userId, id);
    const rows = await this.prisma.db.comment.findMany({
      where: { contentItemId: id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, displayName: true } }, mentions: { include: { mentionedUser: { select: { id: true, displayName: true } } } } },
      take: 300,
    });
    return rows.map((c) => ({
      id: c.id, text: c.bodyText, createdAt: c.createdAt, editedAt: c.editedAt,
      author: c.author ? { id: c.author.id, name: c.author.displayName } : null,
      mentions: c.mentions.map((m) => ({ id: m.mentionedUser.id, name: m.mentionedUser.displayName })),
      canDelete: c.authorId === userId || can(ctx, 'comments.moderate'),
    }));
  }

  async addComment(actorId: string, actorName: string, id: string, text: string, mentionIds: string[], linkPath: string) {
    const item = await this.getVisible(actorId, id);
    if (!item.commentsEnabled) throw new BadRequestException('Kommentare sind hier ausgeschaltet.');
    const clean = text.trim();
    if (!clean) throw new BadRequestException('Bitte schreib etwas.');
    const db = this.prisma.db;
    // Erwähnen nur, wer den Inhalt auch sehen darf – sonst kein Hinweis an Dritte
    const allowed = mentionIds.length
      ? (await db.contentRecipient.findMany({ where: { contentItemId: id, userId: { in: mentionIds }, removedAt: null }, select: { userId: true } })).map((r) => r.userId)
      : [];
    const comment = await db.comment.create({
      data: {
        contentItemId: id, authorId: actorId, body: toBody(clean), bodyText: clean,
        mentions: { create: allowed.map((u) => ({ mentionedUserId: u })) },
      },
    });
    const title = this.titleOf(item);
    await this.notifications.notify({
      recipientIds: allowed, actorId, eventType: 'mention', title: `${actorName} hat dich erwähnt`, body: `in „${title}“: ${clean.slice(0, 120)}`,
      linkPath, contentItemId: id, dedupeKey: `mention:${comment.id}`,
    });
    // Autor:in informieren – bei Social nur mit Opt-in (ADR-031)
    if (item.authorId && item.authorId !== actorId && !allowed.includes(item.authorId)) {
      const isSocial = item.post?.kind === 'SOCIAL';
      const optIn = isSocial ? (await db.userSettings.findUnique({ where: { userId: item.authorId } }))?.socialNotifications : true;
      if (optIn) {
        await this.notifications.notify({
          recipientIds: [item.authorId], actorId, eventType: 'comment', title: `${actorName} hat kommentiert`, body: `„${title}“: ${clean.slice(0, 120)}`,
          linkPath, contentItemId: id, dedupeKey: `comment:${comment.id}`,
        });
      }
    }
    return { id: comment.id };
  }

  async deleteComment(ctx: PolicyContext, userId: string, commentId: string) {
    const c = await this.prisma.db.comment.findUnique({ where: { id: commentId } });
    if (!c || c.deletedAt) throw new NotFoundException('Kommentar nicht gefunden.');
    await this.getVisible(userId, c.contentItemId);
    const mod = can(ctx, 'comments.moderate');
    if (c.authorId !== userId && !mod) throw new ForbiddenException('Du kannst nur eigene Kommentare löschen.');
    await this.prisma.db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date(), bodyText: '', body: {} } });
    if (c.authorId !== userId) await this.audit.log({ actorId: userId, action: 'comment.removed_by_moderation', entityType: 'comment', entityId: commentId });
    return { ok: true };
  }

  // ---- Meldungen ---------------------------------------------------------------

  async report(userId: string, actorName: string, target: { contentItemId?: string; commentId?: string }, reason: string) {
    const db = this.prisma.db;
    let contentItemId = target.contentItemId;
    if (target.commentId) {
      const c = await db.comment.findUnique({ where: { id: target.commentId } });
      if (!c) throw new NotFoundException();
      contentItemId = c.contentItemId;
    }
    const item = await this.getVisible(userId, contentItemId!);
    const open = await db.contentReport.findFirst({ where: { reporterId: userId, status: 'OPEN', contentItemId: target.commentId ? undefined : contentItemId, commentId: target.commentId ?? null } });
    if (open) return { ok: true, already: true };
    await db.contentReport.create({ data: { contentItemId: target.commentId ? null : contentItemId, commentId: target.commentId ?? null, reporterId: userId, reason: reason.slice(0, 500) } });
    const moderators = await db.user.findMany({
      where: { status: 'ACTIVE', userRoles: { some: { role: { permissions: { some: { permission: { key: 'social.moderate' } } } } } } },
      select: { id: true },
    });
    await this.notifications.notify({
      recipientIds: moderators.map((m) => m.id), eventType: 'report.created', title: 'Neue Meldung zur Prüfung',
      body: `Gemeldet: „${this.titleOf(item)}“`, linkPath: '/verwaltung?tab=meldungen',
    });
    void actorName;
    return { ok: true };
  }

  // ---- Lesestatus & Erinnerungen (nur mit Schalter, ADR-012) --------------------

  async readStatus(ctx: PolicyContext, userId: string, id: string, details: boolean) {
    const item = await this.getVisible(userId, id);
    if (!(await this.tracked(item))) return { enabled: false as const };
    const isAuthor = item.authorId === userId;
    const company = item.companyId ? await this.prisma.db.company.findUnique({ where: { id: item.companyId } }) : null;
    const allRecipients = company?.readListVisibility === 'ALL_RECIPIENTS';
    const lead = await this.leadCheck(ctx, item);
    const mayView = isAuthor || lead('read_status.view_summary');
    if (!mayView && !allRecipients) return { enabled: true as const, visible: false as const };
    const db = this.prisma.db;
    const recipients = await db.contentRecipient.findMany({
      where: { contentItemId: id, removedAt: null, userId: { not: item.authorId ?? undefined } },
      include: { user: { select: { id: true, displayName: true, groupMemberships: { include: { group: { select: { name: true } } } } } } },
    });
    const readMap = await this.readMap(item);
    const read = recipients.filter((r) => readMap.has(r.userId)).length;
    const mayDetails = details && (isAuthor || allRecipients || lead('read_status.view_details'));
    return {
      enabled: true as const, visible: true as const, read, total: recipients.length,
      canRemind: isAuthor ? can(ctx, 'reminders.send_manual') : lead('reminders.send_manual'),
      people: mayDetails
        ? recipients.map((r) => ({
            id: r.userId, name: r.user.displayName, group: r.user.groupMemberships.map((m) => m.group.name).join(', '),
            readOn: readMap.get(r.userId) ?? null,
          }))
        : null,
    };
  }

  /**
   * Lesestatus für Listen: „gelesen / gesamt“ je Eintrag – nur für Einträge, bei denen die Person
   * Autor:in oder Leitung ist (dieselben Regeln wie auf der Detailseite). Andere Einträge fehlen in der Antwort.
   */
  async readSummaries(ctx: PolicyContext, userId: string, ids: string[]) {
    if (!ids.length || !(await this.features.readTracking())) return {};
    const db = this.prisma.db;
    const items = await db.contentItem.findMany({ where: { id: { in: ids }, ...this.visibleWhere(userId) }, select: { id: true, authorId: true, companyId: true, post: { select: { kind: true } }, audiences: { select: { groupId: true } } } });
    const allowed = items.filter((i) => i.post?.kind !== 'SOCIAL' && (i.authorId === userId || can(ctx, 'read_status.view_summary', { companyId: i.companyId })
      || i.audiences.some((a) => a.groupId && can(ctx, 'read_status.view_summary', { groupId: a.groupId, companyId: i.companyId }))));
    if (!allowed.length) return {};
    const rows = await db.$queryRawUnsafe<Array<{ id: string; total: bigint; read: bigint }>>(`
      SELECT r.content_item_id::text AS id, count(*) AS total,
        count(CASE WHEN ci.type = 'SURVEY' THEN sp.user_id ELSE rr.user_id END) AS read
      FROM content_recipients r
      JOIN content_items ci ON ci.id = r.content_item_id
      LEFT JOIN read_receipts rr ON rr.content_item_id = r.content_item_id AND rr.user_id = r.user_id
      LEFT JOIN survey_participations sp ON sp.survey_id = r.content_item_id AND sp.user_id = r.user_id
      WHERE r.content_item_id = ANY($1::uuid[]) AND r.removed_at IS NULL AND r.user_id IS DISTINCT FROM ci.author_id
      GROUP BY r.content_item_id`, allowed.map((i) => i.id));
    return Object.fromEntries(rows.map((r) => [r.id, { read: Number(r.read), total: Number(r.total) }]));
  }

  /** Leitungsrecht für einen Eintrag: Gesellschaft oder eine Zielgruppe (z. B. Teamleitung → Übergaben ihres Teams). */
  private async leadCheck(ctx: PolicyContext, item: { id: string; companyId: string | null }) {
    const groups = (await this.prisma.db.contentAudience.findMany({ where: { contentItemId: item.id, groupId: { not: null } }, select: { groupId: true } })).map((a) => a.groupId!);
    return (perm: string) => can(ctx, perm, { companyId: item.companyId }) || groups.some((groupId) => can(ctx, perm, { groupId, companyId: item.companyId }));
  }

  /** Lesestatus gilt für alle dienstlichen Inhalte, solange der Schalter an ist – nie für Social (ADR-031, ADR-042). */
  private async tracked(item: { type: string; post: { kind: string } | null }) {
    return (await this.features.readTracking()) && item.post?.kind !== 'SOCIAL';
  }

  /** Wer hat gelesen (Datum)? Bei Umfragen zählt die Teilnahme – Antworten bleiben anonym (ADR-013). */
  private async readMap(item: { id: string; type: string }) {
    const rows = item.type === 'SURVEY'
      ? (await this.prisma.db.surveyParticipation.findMany({ where: { surveyId: item.id } })).map((p) => ({ userId: p.userId, on: p.submittedOn }))
      : (await this.prisma.db.readReceipt.findMany({ where: { contentItemId: item.id }, select: { userId: true, openedAt: true } })).map((r) => ({ userId: r.userId, on: r.openedAt }));
    return new Map(rows.map((r) => [r.userId, r.on]));
  }

  async remind(ctx: PolicyContext, userId: string, actorName: string, id: string, linkPath: string) {
    const item = await this.getVisible(userId, id);
    if (!(await this.tracked(item))) throw new BadRequestException('Lesestatus ist für diesen Beitrag nicht aktiv.');
    const allowed = item.authorId === userId ? can(ctx, 'reminders.send_manual') : (await this.leadCheck(ctx, item))('reminders.send_manual');
    if (!allowed) throw new ForbiddenException('Erinnern dürfen Autor:innen und Leitungen.');
    const db = this.prisma.db;
    const recipients = await db.contentRecipient.findMany({ where: { contentItemId: id, removedAt: null }, select: { userId: true } });
    const read = await this.readMap(item);
    const open = recipients.map((r) => r.userId).filter((u) => !read.has(u) && u !== item.authorId);
    const sent: string[] = [];
    for (const u of open) {
      const count = await db.reminder.count({ where: { contentItemId: id, recipientId: u } });
      if (count >= item.maxReminders) continue;
      await db.reminder.create({ data: { contentItemId: id, recipientId: u, triggeredById: userId, trigger: 'MANUAL', channel: 'IN_APP', sequenceNo: count + 1, status: 'SENT', scheduledAt: new Date(), sentAt: new Date() } });
      sent.push(u);
    }
    await this.notifications.notify({
      recipientIds: sent, actorId: userId, eventType: 'reminder', importance: item.importance,
      title: `Erinnerung: „${this.titleOf(item)}“`, body: item.type === 'SURVEY' ? `${actorName} bittet dich, an der Umfrage teilzunehmen.` : `${actorName} bittet dich, den Beitrag zu lesen.`, linkPath, contentItemId: id,
    });
    await this.audit.log({ actorId: userId, companyId: item.companyId, action: 'reminder.manual_sent', entityType: 'content_item', entityId: id, metadata: { count: sent.length } });
    return { reminded: sent.length, skipped: open.length - sent.length };
  }
}
