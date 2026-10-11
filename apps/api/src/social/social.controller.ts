import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceTarget } from '../content/audience.service';
import { ContentService, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';

const CATEGORIES = ['GREETINGS', 'MARKETPLACE', 'CONGRATULATIONS', 'LEISURE', 'OTHER', 'THANKS'] as const;
/** Motive der Danke-Karten (ADR-051) */
export const MOTIFS = { HOST: 'Gastgeberschaft', TEAM: 'Teamgeist', HELP: 'Hilfsbereitschaft', GREEN: 'Nachhaltigkeit', WIR: 'Weil Wir Wirkt', GUEST: 'Gästelob' } as const;
const CreateThanks = z.object({
  userIds: z.array(z.uuid()).max(10).default([]),
  groupId: z.uuid().nullish(),
  motif: z.enum(Object.keys(MOTIFS) as [keyof typeof MOTIFS]),
  text: z.string().trim().min(3).max(300),
  private: z.boolean().default(false),
  /** nur Gästelob: woher das Lob stammt */
  source: z.string().trim().max(120).nullish(),
}).refine((b) => b.userIds.length || b.groupId, 'Bitte wähle mindestens eine Person oder ein Team.');
const Reminder = z.object({ groupId: z.uuid().nullish(), occasion: z.string().trim().min(3).max(120), dueOn: z.iso.date() });
const CreateSocial = z.object({
  title: z.string().trim().min(2).max(120),
  text: z.string().trim().max(4000).default(''),
  category: z.enum(CATEGORIES).exclude(['THANKS']),
  visibility: z.string().max(60), // ALL | COMPANY | G:<groupId>
  intent: z.enum(['OFFER', 'SEARCH']).nullish(),
  price: z.string().trim().max(60).nullish(),
  images: z.array(z.object({ fileId: z.uuid(), altText: z.string().max(200).nullish() })).max(6).default([]),
});

const MARKET_DAYS = 30;

/** Social: Privates unter Kolleg:innen – ohne Lesestatus, nie „wichtig“ (ADR-031). */
@Controller('social')
export class SocialController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly audit: AuditService, private readonly notifications: NotificationService) {}

  /** Danke-Karten-Angaben (Motiv, bedankte Personen und Team) für mehrere Beiträge. */
  private async kudos(ids: string[], me: string) {
    const [posts, mentions, signs, mine] = await Promise.all([
      this.prisma.db.post.findMany({ where: { id: { in: ids }, socialCategory: 'THANKS' }, select: { id: true, kudosMotif: true, kudosSource: true, kudosGroupId: true, kudosGroup: { select: { name: true } }, contentItem: { select: { audiences: { select: { targetType: true } } } } } }),
      this.prisma.db.mention.findMany({ where: { contentItemId: { in: ids }, commentId: null }, include: { mentionedUser: { select: { id: true, displayName: true } } } }),
      this.prisma.db.reaction.findMany({ where: { contentItemId: { in: ids }, type: 'SIGN' }, include: { user: { select: { id: true, displayName: true } } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.db.groupMembership.findMany({ where: { userId: me }, select: { groupId: true } }),
    ]);
    const myGroups = new Set(mine.map((g) => g.groupId));
    return new Map(posts.map((p) => {
      const to = mentions.filter((m) => m.contentItemId === p.id).map((m) => ({ id: m.mentionedUser.id, name: m.mentionedUser.displayName }));
      const signers = signs.filter((x) => x.contentItemId === p.id).map((x) => ({ id: x.user.id, name: x.user.displayName }));
      return [p.id, { motif: p.kudosMotif, source: p.kudosSource, team: p.kudosGroup?.name ?? null, private: !p.contentItem.audiences.some((a) => a.targetType === 'ALL_USERS'), to, signers,
        signed: signers.some((x) => x.id === me), forMe: to.some((t) => t.id === me) || (!!p.kudosGroupId && myGroups.has(p.kudosGroupId)) }];
    }));
  }

  /** Leitung = Teamleitung einer Gruppe oder Recht für hausweite News. */
  private async isLeader(userId: string) {
    if (await this.prisma.db.groupMembership.count({ where: { userId, isLead: true } })) return true;
    return can(await this.policy.loadContext(userId), 'news.publish_wide');
  }

  @RequirePermission('social.post')
  @Get('thanks/options')
  async thanksOptions(@CurrentUser() me: SessionUser) {
    const leader = await this.isLeader(me.id);
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true, parentGroupId: null }, include: { company: { select: { name: true } } }, orderBy: { name: 'asc' } });
    return { motifs: leader ? MOTIFS : Object.fromEntries(Object.entries(MOTIFS).filter(([k]) => k !== 'GUEST')), leader, groups: groups.map((g) => ({ id: g.id, name: g.company ? `${g.name} · ${g.company.name}` : g.name })) };
  }

  /** Danke sagen: öffentlich für alle (stiftungsweit) oder nur an die Bedankten. */
  @RequirePermission('social.post')
  @Post('thanks')
  async thank(@CurrentUser() me: SessionUser, @Body(new ZodPipe(CreateThanks)) b: z.infer<typeof CreateThanks>) {
    const db = this.prisma.db;
    if (b.motif === 'GUEST' && !(await this.isLeader(me.id))) throw new ForbiddenException('Gästelob geben Leitungen weiter.');
    const users = await db.user.findMany({ where: { id: { in: b.userIds.filter((u) => u !== me.id) }, status: 'ACTIVE' }, select: { id: true, displayName: true } });
    const group = b.groupId ? await db.group.findFirst({ where: { id: b.groupId, isActive: true } }) : null;
    if (!users.length && !group) throw new BadRequestException('Bitte wähle mindestens eine Person oder ein Team.');
    const targets: AudienceTarget[] = b.private ? [...users.map((u) => ({ type: 'USER' as const, userId: u.id })), ...(group ? [{ type: 'GROUP' as const, groupId: group.id }] : [])] : [{ type: 'ALL' }];
    const names = [...users.map((u) => u.displayName), ...(group ? [`Team ${group.name}`] : [])];
    const title = `Danke, ${names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0]}!`;
    const profile = await db.employeeProfile.findUnique({ where: { userId: me.id } });
    const { item, recipientIds } = await this.content.create({
      type: 'POST', companyId: profile?.companyId ?? null, authorId: me.id, targets,
      createSubtype: async (tx, id) => {
        await tx.post.create({ data: { id, title, body: toBody(b.text), bodyText: b.text, kind: 'SOCIAL', socialCategory: 'THANKS', kudosMotif: b.motif, kudosGroupId: group?.id ?? null, kudosSource: b.motif === 'GUEST' ? b.source ?? null : null } });
        await tx.mention.createMany({ data: users.map((u) => ({ mentionedUserId: u.id, contentItemId: id })) });
      },
    });
    const thanked = group ? (await db.groupMembership.findMany({ where: { groupId: group.id }, select: { userId: true } })).map((m) => m.userId) : [];
    const author = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { displayName: true } });
    await this.notifications.notify({ recipientIds: [...new Set([...users.map((u) => u.id), ...thanked])].filter((u) => u !== me.id && (b.private || recipientIds.includes(u))), actorId: me.id, eventType: 'thanks',
      title: b.motif === 'GUEST' ? `Gästelob für dich ⭐ – weitergegeben von ${author.displayName}` : `${author.displayName} sagt Danke 💚`, body: MOTIFS[b.motif], linkPath: `/social/${item.id}`, contentItemId: item.id, dedupeKey: `thanks:${item.id}` });
    return { id: item.id };
  }

  /** Meine Danke-Karten: an mich oder an eines meiner Teams. */
  @RequirePermission('social.read')
  @Get('thanks/mine')
  async myThanks(@CurrentUser() me: SessionUser) {
    const groups = (await this.prisma.db.groupMembership.findMany({ where: { userId: me.id }, select: { groupId: true } })).map((g) => g.groupId);
    const items = await this.prisma.db.contentItem.findMany({
      where: { type: 'POST', ...this.content.visibleWhere(me.id), post: { socialCategory: 'THANKS', OR: [{ kudosGroupId: { in: groups } }, { contentItem: { mentions: { some: { mentionedUserId: me.id, commentId: null } } } }] } },
      include: { post: true, author: { select: { id: true, displayName: true } } }, orderBy: { publishedAt: 'desc' }, take: 100,
    });
    const k = await this.kudos(items.map((i) => i.id), me.id);
    return items.map((i) => ({ id: i.id, text: i.post!.bodyText, author: i.author?.displayName ?? '–', publishedAt: i.publishedAt, ...k.get(i.id)! }));
  }

  /** Danke-Karte mitunterschreiben (an/aus) – nicht die eigene und nicht als Bedankte:r. */
  @RequirePermission('reactions.create')
  @Post('thanks/:id/sign')
  @HttpCode(200)
  async sign(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (item.post?.socialCategory !== 'THANKS' || item.status !== 'PUBLISHED') throw new BadRequestException('Das ist keine Danke-Karte.');
    const k = (await this.kudos([id], me.id)).get(id)!;
    if (item.authorId === me.id || k.forMe) throw new BadRequestException('Die eigene Karte kannst du nicht mitunterschreiben.');
    const where = { contentItemId: id, userId: me.id, type: 'SIGN' as const };
    const had = await this.prisma.db.reaction.findFirst({ where });
    if (had) await this.prisma.db.reaction.delete({ where: { id: had.id } });
    else await this.prisma.db.reaction.create({ data: where });
    return (await this.kudos([id], me.id)).get(id);
  }

  /** Erinnerungen „nach der Veranstaltung Danke sagen“ – nur für Leitungen, nur die eigenen. */
  @RequirePermission('social.post')
  @Get('thanks/reminders')
  async reminders(@CurrentUser() me: SessionUser) {
    const rows = await this.prisma.db.thanksReminder.findMany({ where: { userId: me.id, sentAt: null }, include: { group: { select: { name: true } } }, orderBy: { dueOn: 'asc' } });
    return rows.map((r) => ({ id: r.id, occasion: r.occasion, dueOn: r.dueOn, team: r.group?.name ?? null }));
  }

  @RequirePermission('social.post')
  @Post('thanks/reminders')
  async addReminder(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Reminder)) b: z.infer<typeof Reminder>) {
    if (!(await this.isLeader(me.id))) throw new ForbiddenException('Erinnerungen gibt es für Leitungen.');
    if (b.dueOn < new Date().toISOString().slice(0, 10)) throw new BadRequestException('Das Datum liegt in der Vergangenheit.');
    await this.prisma.db.thanksReminder.create({ data: { userId: me.id, groupId: b.groupId ?? null, occasion: b.occasion, dueOn: new Date(b.dueOn) } });
    return this.reminders(me);
  }

  @Delete('thanks/reminders/:id')
  async removeReminder(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.db.thanksReminder.deleteMany({ where: { id, userId: me.id } });
    return this.reminders(me);
  }

  @RequirePermission('social.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('category') category?: string) {
    const now = new Date();
    const items = await this.prisma.db.contentItem.findMany({
      where: {
        type: 'POST', ...this.content.visibleWhere(me.id),
        post: { kind: 'SOCIAL', ...(category && (CATEGORIES as readonly string[]).includes(category) ? { socialCategory: category as (typeof CATEGORIES)[number] } : {}) },
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }, { authorId: me.id }] }],
      },
      include: { post: true, author: { select: { id: true, displayName: true } } },
      orderBy: { publishedAt: 'desc' },
      take: 60,
    });
    const deco = await this.content.decorate(me.id, items.map((i) => i.id));
    const k = await this.kudos(items.map((i) => i.id), me.id);
    return items.map((i) => this.view(i, me.id, { ...deco(i.id), kudos: k.get(i.id) ?? null }));
  }

  private view(i: { id: string; authorId: string | null; publishedAt: Date | null; expiresAt: Date | null; post: { title: string; bodyText: string; socialCategory: string | null; marketplaceIntent: string | null; priceLabel: string | null; listingClosedAt: Date | null } | null; author: { id: string; displayName: string } | null }, me: string, extra: object) {
    return {
      id: i.id, title: i.post!.title, text: i.post!.bodyText, category: i.post!.socialCategory, intent: i.post!.marketplaceIntent,
      price: i.post!.priceLabel, closed: !!i.post!.listingClosedAt, expiresAt: i.expiresAt,
      author: { id: i.author?.id ?? null, name: i.author?.displayName ?? '–' }, publishedAt: i.publishedAt, mine: i.authorId === me, ...extra,
    };
  }

  @RequirePermission('social.post')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const groups = await this.prisma.db.groupMembership.findMany({ where: { userId: me.id }, include: { group: true } });
    const profile = await this.prisma.db.employeeProfile.findUnique({ where: { userId: me.id }, include: { company: true } });
    return [
      { key: 'ALL', label: 'Alle Kolleg:innen' },
      ...(profile ? [{ key: 'COMPANY', label: `Nur ${profile.company.name}` }] : []),
      ...groups.map((m) => ({ key: `G:${m.groupId}`, label: `Nur mein Team: ${m.group.name}` })),
    ];
  }

  @RequirePermission('social.post')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(CreateSocial)) body: z.infer<typeof CreateSocial>) {
    const profile = await this.prisma.db.employeeProfile.findUnique({ where: { userId: me.id } });
    let target: AudienceTarget;
    if (body.visibility === 'ALL') target = { type: 'ALL' };
    else if (body.visibility === 'COMPANY') {
      if (!profile) throw new BadRequestException('Keine Gesellschaft zugeordnet.');
      target = { type: 'COMPANY', companyId: profile.companyId };
    } else if (body.visibility.startsWith('G:')) {
      const groupId = body.visibility.slice(2);
      const member = await this.prisma.db.groupMembership.findFirst({ where: { userId: me.id, groupId } });
      if (!member) throw new ForbiddenException('Nur für eigene Teams.');
      target = { type: 'GROUP', groupId };
    } else throw new BadRequestException('Unbekannte Sichtbarkeit.');

    const market = body.category === 'MARKETPLACE';
    if (!market && (body.intent || body.price)) throw new BadRequestException('Preis und „Biete/Suche“ gibt es nur bei Biete & Suche.');
    const { item } = await this.content.create({
      type: 'POST', companyId: profile?.companyId ?? null, authorId: me.id, importance: 'NORMAL',
      expiresAt: market ? new Date(Date.now() + MARKET_DAYS * 864e5) : null, targets: [target],
      attachmentFileIds: body.images.map((i) => ({ fileId: i.fileId, altText: i.altText ?? null })),
      createSubtype: (tx, id) => tx.post.create({
        data: {
          id, title: body.title, body: toBody(body.text), bodyText: body.text, kind: 'SOCIAL', socialCategory: body.category,
          marketplaceIntent: market ? body.intent ?? 'OFFER' : null, priceLabel: market ? body.price ?? null : null,
        },
      }),
    });
    return { id: item.id };
  }

  @RequirePermission('social.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (item.post?.kind !== 'SOCIAL') throw new BadRequestException('Das ist kein Social-Beitrag.');
    const ctx = await this.policy.loadContext(me.id);
    const deco = (await this.content.decorate(me.id, [id]))(id);
    return { ...this.view(item, me.id, { ...deco, kudos: (await this.kudos([id], me.id)).get(id) ?? null }), canDelete: item.authorId === me.id || can(ctx, 'social.moderate') };
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (item.authorId !== me.id || item.post?.socialCategory !== 'MARKETPLACE') throw new ForbiddenException('Nur eigene Angebote.');
    await this.prisma.db.post.update({ where: { id }, data: { listingClosedAt: new Date() } });
    return { ok: true };
  }

  @Delete(':id')
  async remove(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const ctx = await this.policy.loadContext(me.id);
    const mod = can(ctx, 'social.moderate');
    if (item.authorId !== me.id && !mod) throw new ForbiddenException('Nur eigene Beiträge.');
    await this.prisma.db.contentItem.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
    if (item.authorId !== me.id) await this.audit.log({ actorId: me.id, action: 'social.removed_by_moderation', entityType: 'content_item', entityId: id });
    return { ok: true };
  }
}
