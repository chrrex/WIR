import { indexContent } from '@wir/db';
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { FeatureService } from '../common/feature.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceService, AudienceTarget } from '../content/audience.service';
import { ContentService, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';

const CreateNews = z.object({
  title: z.string().trim().min(3).max(160),
  text: z.string().trim().min(1).max(10_000),
  targets: z.array(z.string().max(60)).min(1).max(20),
  important: z.boolean().default(false),
  readTracking: z.boolean().default(false),
  pinned: z.boolean().default(false),
  images: z.array(z.object({ fileId: z.uuid(), altText: z.string().max(200).nullish() })).max(6).default([]),
});

function parseTarget(key: string): AudienceTarget {
  if (key === 'ALL') return { type: 'ALL' };
  const [kind, id] = key.split(':');
  if (kind === 'C' && id) return { type: 'COMPANY', companyId: id };
  if (kind === 'G' && id) return { type: 'GROUP', groupId: id };
  throw new BadRequestException('Unbekannte Zielgruppe.');
}

@Controller('news')
export class NewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly audiences: AudienceService,
    private readonly policy: PolicyService,
    private readonly features: FeatureService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('news.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('filter') filter?: string) {
    const items = await this.prisma.db.contentItem.findMany({
      where: {
        type: 'POST', post: { kind: 'NEWS' }, ...this.content.visibleWhere(me.id),
        ...(filter === 'important' ? { importance: 'IMPORTANT' } : {}),
        ...(filter === 'unread' ? { readReceipts: { none: { userId: me.id } }, authorId: { not: me.id } } : {}),
      },
      include: { post: true, author: { select: { displayName: true } } },
      orderBy: [{ publishedAt: 'desc' }],
      take: 60,
    });
    const deco = await this.content.decorate(me.id, items.map((i) => i.id));
    const now = Date.now();
    const rows = items.map((i) => ({
      id: i.id, title: i.post!.title, excerpt: i.post!.bodyText.slice(0, 180), important: i.importance === 'IMPORTANT',
      pinned: !!i.post!.isPinned && (!i.post!.pinnedUntil || i.post!.pinnedUntil.getTime() > now),
      author: i.author?.displayName ?? '–', publishedAt: i.publishedAt, mine: i.authorId === me.id, ...deco(i.id),
    }));
    rows.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return rows;
  }

  @RequirePermission('news.publish')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    return {
      audiences: (await this.audiences.newsOptions(ctx)).map((o) => ({ key: o.key, label: o.label, wide: o.wide })),
      canImportant: can(ctx, 'news.mark_important'),
      canReadTracking: (await this.features.readTracking()) && can(ctx, 'news.require_read'),
      readTrackingFeature: await this.features.readTracking(),
      canPin: can(ctx, 'news.pin'),
    };
  }

  @RequirePermission('news.publish')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(CreateNews)) body: z.infer<typeof CreateNews>) {
    const ctx = await this.policy.loadContext(me.id);
    const targets = body.targets.map(parseTarget);
    await this.audiences.assertNewsTargets(ctx, targets);
    // Leitplanken (ADR-037): „Wichtig“, Lesestatus und Anheften nur mit eigenem Recht
    if (body.important && !can(ctx, 'news.mark_important')) throw new ForbiddenException('„Wichtig“ setzen nur Leitungen.');
    if (body.pinned && !can(ctx, 'news.pin')) throw new ForbiddenException('Anheften dürfen nur Leitungen.');
    const tracking = body.readTracking && (await this.features.readTracking()) && can(ctx, 'news.require_read');
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: me.id }, include: { employeeProfile: true } });
    const companyId = targets.find((t) => t.type === 'COMPANY') ? (targets.find((t) => t.type === 'COMPANY') as { companyId: string }).companyId
      : user.employeeProfile?.companyId ?? ctx.companyIds[0] ?? null;

    const { item, recipientIds } = await this.content.create({
      type: 'POST', companyId, authorId: me.id, importance: body.important ? 'IMPORTANT' : 'NORMAL', readTrackingEnabled: tracking,
      targets, attachmentFileIds: body.images.map((i) => ({ fileId: i.fileId, altText: i.altText ?? null })),
      createSubtype: (tx, id) => tx.post.create({ data: { id, title: body.title, body: toBody(body.text), bodyText: body.text, kind: 'NEWS', isPinned: body.pinned } }),
    });
    if (body.important) {
      await this.notifications.notify({
        recipientIds, actorId: me.id, eventType: 'news.important', importance: 'IMPORTANT',
        title: `Wichtig: ${body.title}`, body: `von ${user.displayName}`, linkPath: `/news/${item.id}`, contentItemId: item.id, dedupeKey: `news:${item.id}`,
      });
    }
    await this.audit.log({ actorId: me.id, companyId, action: 'news.published', entityType: 'content_item', entityId: item.id, metadata: { recipients: recipientIds.length, important: body.important } });
    await indexContent(this.prisma.db, item.id, 1, body.title, body.text);
    return { id: item.id, recipients: recipientIds.length };
  }

  @RequirePermission('news.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.post || item.post.kind !== 'NEWS') throw new BadRequestException('Das ist keine News.');
    const ctx = await this.policy.loadContext(me.id);
    const deco = (await this.content.decorate(me.id, [id]))(id);
    return {
      id, title: item.post.title, text: item.post.bodyText, important: item.importance === 'IMPORTANT', pinned: item.post.isPinned,
      publishedAt: item.publishedAt, author: { id: item.author?.id ?? null, name: item.author?.displayName ?? '–', job: item.author?.employeeProfile?.jobTitle ?? null },
      audiences: await this.audiences.describe(id), commentsEnabled: item.commentsEnabled, readTracking: item.readTrackingEnabled,
      mine: item.authorId === me.id,
      canDelete: item.authorId === me.id || can(ctx, 'news.delete_any', { companyId: item.companyId }),
      ...deco,
    };
  }

  @Delete(':id')
  async remove(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const ctx = await this.policy.loadContext(me.id);
    if (item.authorId !== me.id && !can(ctx, 'news.delete_any', { companyId: item.companyId })) throw new ForbiddenException('Löschen dürfen Autor:in und Moderation.');
    await this.prisma.db.contentItem.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } });
    await this.audit.log({ actorId: me.id, companyId: item.companyId, action: 'news.deleted', entityType: 'content_item', entityId: id });
    return { ok: true };
  }
}
