import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentType, Prisma } from '@wir/db';
import { z } from 'zod';
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

/** Reaktionen 👍 👎 ❤️ 🎉 (Chat, News, Social – ADR-048) */
export const REACTIONS = ['THUMBS_UP', 'THUMBS_DOWN', 'HEART', 'CELEBRATE'] as const;
export type ReactionKind = (typeof REACTIONS)[number];

/** Zusammenfassung je Art: Anzahl, ob selbst reagiert, wer (nur für Berechtigte des Inhalts). */
export function summarizeReactions(rows: Array<{ type: string; userId: string; user: { displayName: string } }>, me: string) {
  return REACTIONS.map((type) => { const r = rows.filter((x) => x.type === type); return { type, count: r.length, mine: r.some((x) => x.userId === me), names: r.map((x) => x.user.displayName) }; }).filter((r) => r.count);
}

/** Was Detailseiten und Listen (Lesezeichen) zu einem Inhalt brauchen. */
export const ITEM_INCLUDE = {
  post: true, handover: { include: { group: true } }, idea: true, task: true, survey: true, document: true, checklistRun: true,
  knowledgeArticle: { include: { versions: { where: { status: 'PUBLISHED' as const }, take: 1, select: { title: true } } } },
  author: { select: { id: true, displayName: true, employeeProfile: { select: { jobTitle: true } } } },
} satisfies Prisma.ContentItemInclude;

/** Abstimmung in News/Übergaben (ADR-050) */
export const PollInput = z.object({
  question: z.string().trim().min(3).max(200),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  multiple: z.boolean().default(false),
  anonymous: z.boolean().default(false),
  closesAt: z.iso.datetime({ offset: true }).nullish(),
});
export type PollInput = z.infer<typeof PollInput>;
export function createPoll(tx: Prisma.TransactionClient, id: string, p: PollInput | null | undefined) {
  if (!p) return;
  return tx.poll.create({ data: { id, question: p.question, multiple: p.multiple, anonymous: p.anonymous, closesAt: p.closesAt ? new Date(p.closesAt) : null, options: { create: p.options.map((label, sortOrder) => ({ label, sortOrder })) } } });
}

/** Veröffentlichen planen: Zeitpunkt in der Zukunft, höchstens 90 Tage (ADR-050). */
export const PublishAt = z.iso.datetime({ offset: true }).nullish()
  .refine((v) => !v || (new Date(v).getTime() > Date.now() && new Date(v).getTime() < Date.now() + 90 * 864e5), 'Der Zeitpunkt muss in der Zukunft liegen (höchstens 90 Tage).');

export interface CreateContentInput {
  type: ContentType;
  companyId: string | null;
  /** null = vom System angelegt (z. B. wiederkehrende Checkliste) */
  authorId: string | null;
  importance?: 'NORMAL' | 'IMPORTANT';
  commentsEnabled?: boolean;
  requiresAcknowledgement?: boolean;
  /** DRAFT = zur Prüfung eingereicht (nur Autor:in und Prüfende sehen es) */
  status?: 'DRAFT' | 'PUBLISHED';
  /** geplant: erst zu diesem Zeitpunkt sichtbar (Job veröffentlicht und benachrichtigt) */
  publishAt?: string | null;
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

  /** Wie visibleWhere, dazu die eigenen geplanten Beiträge (nur für Listen und Detail von News/Übergaben). */
  visibleOrScheduled(userId: string): Prisma.ContentItemWhereInput {
    return { OR: [this.visibleWhere(userId), { authorId: userId, status: 'SCHEDULED', deletedAt: null }] };
  }

  /** Benachrichtigungen beim Erscheinen – sofort oder später durch den Job (geplante Beiträge). */
  async announce(id: string) {
    const db = this.prisma.db;
    const i = await db.contentItem.findUniqueOrThrow({ where: { id }, include: { post: true, handover: { include: { group: true } }, author: { select: { displayName: true } },
      recipients: { where: { removedAt: null }, select: { userId: true } }, mentions: { where: { commentId: null }, select: { mentionedUserId: true } } } });
    const to = i.recipients.map((r) => r.userId).filter((u) => u !== i.authorId);
    const by = i.author?.displayName ?? 'WIR';
    if (i.post?.kind === 'NEWS' && i.importance === 'IMPORTANT') {
      await this.notifications.notify({ recipientIds: to, actorId: i.authorId ?? undefined, eventType: 'news.important', importance: 'IMPORTANT', title: `Wichtig: ${i.post.title}`, body: `von ${by}`, linkPath: `/news/${id}`, contentItemId: id, dedupeKey: `news:${id}` });
    }
    if (i.handover) {
      const h = i.handover;
      const mentioned = new Set(i.mentions.map((m) => m.mentionedUserId));
      await this.notifications.notify({ recipientIds: to.filter((u) => !mentioned.has(u)), actorId: i.authorId ?? undefined, eventType: 'handover.new', title: `Neue Übergabe ${h.shiftLabel ?? ''}${h.group ? ` · ${h.group.name}` : ''}`, body: h.subject, linkPath: `/uebergaben/${id}`, contentItemId: id, dedupeKey: `handover:${id}` });
      await this.notifications.notify({ recipientIds: [...mentioned], actorId: i.authorId ?? undefined, eventType: 'mention', title: `${by} hat dich in einer Übergabe erwähnt`, body: h.subject, linkPath: `/uebergaben/${id}`, contentItemId: id, dedupeKey: `handover-mention:${id}` });
    }
  }

  /** Fällige geplante Beiträge veröffentlichen (Job, alle 5 Minuten). */
  async publishDue(now = new Date()) {
    const due = await this.prisma.db.contentItem.findMany({ where: { status: 'SCHEDULED', deletedAt: null, publishAt: { lte: now } }, select: { id: true } });
    let n = 0;
    for (const { id } of due) {
      const claimed = await this.prisma.db.contentItem.updateMany({ where: { id, status: 'SCHEDULED' }, data: { status: 'PUBLISHED', publishedAt: now } });
      if (claimed.count) { n++; await this.announce(id); }
    }
    return n;
  }

  // ---- Abstimmungen ---------------------------------------------------------

  async poll(userId: string, id: string) {
    const p = await this.prisma.db.poll.findUnique({ where: { id }, include: { options: { orderBy: { sortOrder: 'asc' }, include: { votes: { include: { user: { select: { displayName: true } } } } } } } });
    if (!p) return null;
    const voters = new Set(p.options.flatMap((o) => o.votes.map((v) => v.userId)));
    return {
      question: p.question, multiple: p.multiple, anonymous: p.anonymous, closesAt: p.closesAt, closed: !!p.closesAt && p.closesAt < new Date(), voters: voters.size, voted: voters.has(userId),
      options: p.options.map((o) => ({ id: o.id, label: o.label, count: o.votes.length, mine: o.votes.some((v) => v.userId === userId), names: p.anonymous ? [] : o.votes.map((v) => v.user.displayName) })),
    };
  }

  /** Stimme abgeben oder ändern (leere Auswahl = Stimme zurückziehen). */
  async vote(userId: string, id: string, optionIds: string[]) {
    const item = await this.getVisible(userId, id);
    if (item.status !== 'PUBLISHED') throw new BadRequestException('Abstimmen geht erst nach dem Veröffentlichen.');
    const p = await this.prisma.db.poll.findUnique({ where: { id }, include: { options: { select: { id: true } } } });
    if (!p) throw new NotFoundException('Hier gibt es keine Abstimmung.');
    if (p.closesAt && p.closesAt < new Date()) throw new BadRequestException('Die Abstimmung ist beendet.');
    const ids = [...new Set(optionIds)];
    if (ids.some((o) => !p.options.some((x) => x.id === o))) throw new BadRequestException('Unbekannte Antwort.');
    if (!p.multiple && ids.length > 1) throw new BadRequestException('Hier ist nur eine Antwort möglich.');
    await this.prisma.db.$transaction([
      this.prisma.db.pollVote.deleteMany({ where: { userId, option: { pollId: id } } }),
      this.prisma.db.pollVote.createMany({ data: ids.map((optionId) => ({ optionId, userId })) }),
    ]);
    return this.poll(userId, id);
  }

  // ---- Lesezeichen ----------------------------------------------------------

  async toggleBookmark(userId: string, id: string) {
    await this.getVisible(userId, id);
    const key = { userId_contentItemId: { userId, contentItemId: id } };
    const had = await this.prisma.db.bookmark.findUnique({ where: key });
    if (had) await this.prisma.db.bookmark.delete({ where: key });
    else await this.prisma.db.bookmark.create({ data: { userId, contentItemId: id } });
    return { bookmarked: !had };
  }

  /** Sprache, in der die Person schreibt (für die Übersetzung, ADR-054). */
  async localeOf(userId: string | null) {
    return userId ? (await this.prisma.db.userSettings.findUnique({ where: { userId }, select: { locale: true } }))?.locale ?? 'de' : 'de';
  }

  async create(input: CreateContentInput) {
    const sourceLocale = await this.localeOf(input.authorId);
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
          sourceLocale,
          status: input.publishAt ? 'SCHEDULED' : input.status ?? 'PUBLISHED',
          publishAt: input.publishAt ? new Date(input.publishAt) : null,
          publishedAt: input.status === 'DRAFT' || input.publishAt ? null : new Date(),
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
    const item = await this.prisma.db.contentItem.findFirst({ where: { id, ...this.visibleOrScheduled(userId) }, include: ITEM_INCLUDE });
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
    const [receipts, likes, myLikes, comments, attachments, polls, sched] = await Promise.all([
      db.readReceipt.findMany({ where: { userId, contentItemId: { in: ids } }, select: { contentItemId: true } }),
      db.reaction.groupBy({ by: ['contentItemId'], where: { contentItemId: { in: ids }, type: 'LIKE' }, _count: true }),
      db.reaction.findMany({ where: { contentItemId: { in: ids } }, select: { contentItemId: true, type: true, userId: true, user: { select: { displayName: true } } } }),
      db.comment.groupBy({ by: ['contentItemId'], where: { contentItemId: { in: ids }, deletedAt: null }, _count: true }),
      this.attachmentsFor(ids),
      db.poll.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      db.contentItem.findMany({ where: { id: { in: ids }, status: 'SCHEDULED' }, select: { id: true, publishAt: true } }),
    ]);
    const pollSet = new Set(polls.map((p) => p.id));
    const scheduled = new Map(sched.map((x) => [x.id, x.publishAt]));
    const read = new Set(receipts.map((r) => r.contentItemId));
    const liked = new Set(myLikes.filter((r) => r.userId === userId && r.type === 'LIKE').map((r) => r.contentItemId));
    const likeCount = new Map(likes.map((l) => [l.contentItemId, l._count]));
    const commentCount = new Map(comments.map((c) => [c.contentItemId, c._count]));
    return (id: string) => ({
      read: read.has(id),
      liked: liked.has(id),
      likes: likeCount.get(id) ?? 0,
      comments: commentCount.get(id) ?? 0,
      images: attachments.get(id) ?? [],
      reactions: summarizeReactions(myLikes.filter((r) => r.contentItemId === id && r.type !== 'LIKE'), userId),
      hasPoll: pollSet.has(id),
      scheduledFor: scheduled.get(id) ?? null,
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

  async toggleReaction(userId: string, id: string, type: ReactionKind) {
    const item = await this.getVisible(userId, id);
    if (!item.reactionsEnabled) throw new BadRequestException('Reaktionen sind hier ausgeschaltet.');
    const db = this.prisma.db;
    const existing = await db.reaction.findFirst({ where: { userId, contentItemId: id, type } });
    if (existing) await db.reaction.delete({ where: { id: existing.id } });
    else await db.reaction.create({ data: { userId, contentItemId: id, type } });
    const rows = await db.reaction.findMany({ where: { contentItemId: id, type: { not: 'LIKE' } }, select: { type: true, userId: true, user: { select: { displayName: true } } } });
    return { reactions: summarizeReactions(rows, userId) };
  }

  async toggleLike(userId: string, id: string) {
    const item = await this.getVisible(userId, id);
    if (!item.reactionsEnabled) throw new BadRequestException('Reaktionen sind hier ausgeschaltet.');
    const db = this.prisma.db;
    const existing = await db.reaction.findFirst({ where: { userId, contentItemId: id, type: 'LIKE' } });
    if (existing) await db.reaction.delete({ where: { id: existing.id } });
    else await db.reaction.create({ data: { userId, contentItemId: id, type: 'LIKE' } });
    const likes = await db.reaction.count({ where: { contentItemId: id, type: 'LIKE' } });
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
        contentItemId: id, authorId: actorId, body: toBody(clean), bodyText: clean, sourceLocale: await this.localeOf(actorId),
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
