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

const CATEGORIES = ['GREETINGS', 'MARKETPLACE', 'CONGRATULATIONS', 'LEISURE', 'OTHER'] as const;
const CreateSocial = z.object({
  title: z.string().trim().min(2).max(120),
  text: z.string().trim().max(4000).default(''),
  category: z.enum(CATEGORIES),
  visibility: z.string().max(60), // ALL | COMPANY | G:<groupId>
  intent: z.enum(['OFFER', 'SEARCH']).nullish(),
  price: z.string().trim().max(60).nullish(),
  images: z.array(z.object({ fileId: z.uuid(), altText: z.string().max(200).nullish() })).max(6).default([]),
});

const MARKET_DAYS = 30;

/** Social: Privates unter Kolleg:innen – ohne Lesestatus, nie „wichtig“ (ADR-031). */
@Controller('social')
export class SocialController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly audit: AuditService) {}

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
    return items.map((i) => this.view(i, me.id, deco(i.id)));
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
    return { ...this.view(item, me.id, deco), canDelete: item.authorId === me.id || can(ctx, 'social.moderate') };
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
