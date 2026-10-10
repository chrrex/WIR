import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { indexContent } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { ContentService, dateOnly, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { AudienceKeys, primaryCompany, slug, toTargets } from './common';

const TYPES = ['WIKI', 'SOP', 'POLICY', 'BRAND_STANDARD', 'HACCP', 'PROCESS', 'MANUAL', 'TEMPLATE_FORM'] as const;
const Version = z.object({
  title: z.string().trim().min(3).max(160),
  text: z.string().trim().min(1).max(40000),
  plainText: z.string().trim().max(10000).nullish(),
  changeSummary: z.string().trim().max(300).nullish(),
});
const Create = Version.extend({ categoryId: z.uuid(), articleType: z.enum(TYPES), requiresAck: z.boolean().default(false), audience: AudienceKeys });
const Update = Version.extend({ notify: z.boolean().default(false) });

/** Wissen & SOPs: jede Änderung ist eine neue Version; „Kenntnis genommen“ gilt je Version. */
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audiences: AudienceService,
    private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  @RequirePermission('knowledge.read')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const items = await db.contentItem.findMany({
      where: { type: 'KNOWLEDGE_ARTICLE', ...this.content.visibleWhere(me.id) },
      include: { knowledgeArticle: { include: { versions: { where: { status: 'PUBLISHED' }, take: 1 } } }, readReceipts: { where: { userId: me.id } } },
    });
    const cats = await db.knowledgeCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return {
      canCreate: can(await this.policy.loadContext(me.id), 'knowledge.create'),
      categories: cats.map((c) => ({
        id: c.id, name: c.name,
        articles: items.filter((i) => i.knowledgeArticle?.categoryId === c.id).map((i) => {
          const r = i.readReceipts[0];
          return {
            id: i.id, title: i.knowledgeArticle!.versions[0]?.title ?? '–', type: i.knowledgeArticle!.articleType, version: i.currentVersion, updatedAt: i.updatedAt,
            requiresAck: i.requiresAcknowledgement, acknowledged: r?.acknowledgedVersion === i.currentVersion,
          };
        }).sort((a, b) => a.title.localeCompare(b.title, 'de')),
      })).filter((c) => c.articles.length),
    };
  }

  @RequirePermission('knowledge.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const cats = await this.prisma.db.knowledgeCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return { categories: cats.map((c) => ({ id: c.id, name: c.name })), types: TYPES, audiences: await this.audiences.newsOptions(await this.policy.loadContext(me.id)) };
  }

  @RequirePermission('knowledge.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const db = this.prisma.db;
    const a = await db.knowledgeArticle.findUnique({ where: { id }, include: { category: true, versions: { orderBy: { versionNumber: 'desc' }, include: { author: { select: { displayName: true } } } } } });
    if (!a) throw new BadRequestException('Das ist kein Wissensartikel.');
    const cur = a.versions.find((v) => v.status === 'PUBLISHED')!;
    const ctx = await this.policy.loadContext(me.id);
    const receipt = await db.readReceipt.findUnique({ where: { contentItemId_userId: { contentItemId: id, userId: me.id } } });
    const mayEdit = can(ctx, 'knowledge.update', { companyId: item.companyId });
    const acks = mayEdit && item.requiresAcknowledgement
      ? { done: await db.readReceipt.count({ where: { contentItemId: id, acknowledgedVersion: item.currentVersion, userId: { not: item.authorId ?? undefined } } }),
          total: await db.contentRecipient.count({ where: { contentItemId: id, removedAt: null, userId: { not: item.authorId ?? undefined } } }) }
      : null;
    return {
      id, title: cur.title, text: cur.bodyText, plainText: cur.plainLanguageText, type: a.articleType, category: a.category.name, version: cur.versionNumber,
      publishedAt: cur.publishedAt, author: cur.author?.displayName ?? '–', requiresAck: item.requiresAcknowledgement,
      acknowledged: receipt?.acknowledgedVersion === item.currentVersion, acks, canEdit: mayEdit, audience: await this.audiences.describe(id),
      history: a.versions.map((v) => ({ n: v.versionNumber, title: v.title, changeSummary: v.changeSummary, publishedAt: v.publishedAt, author: v.author?.displayName ?? '–' })),
    };
  }

  @RequirePermission('knowledge.read')
  @Get(':id/versions/:n')
  async version(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number) {
    await this.content.getVisible(me.id, id);
    const v = await this.prisma.db.knowledgeVersion.findUniqueOrThrow({ where: { articleId_versionNumber: { articleId: id, versionNumber: n } } });
    return { n, title: v.title, text: v.bodyText, changeSummary: v.changeSummary, publishedAt: v.publishedAt };
  }

  @RequirePermission('knowledge.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const targets = toTargets(b.audience);
    const ctx = await this.policy.loadContext(me.id);
    await this.audiences.assertNewsTargets(ctx, targets);
    if (b.requiresAck && !can(ctx, 'knowledge.require_acknowledgement')) throw new ForbiddenException('„Kenntnis nehmen“ verlangen darfst du nicht.');
    const { item, recipientIds } = await this.content.create({
      type: 'KNOWLEDGE_ARTICLE', companyId: await primaryCompany(this.prisma, me.id), authorId: me.id, targets, requiresAcknowledgement: b.requiresAck,
      createSubtype: async (tx, id) => {
        await tx.knowledgeArticle.create({ data: { id, categoryId: b.categoryId, articleType: b.articleType, slug: `${slug(b.title)}-${id.slice(0, 6)}`, ownerId: me.id } });
        await tx.knowledgeVersion.create({ data: this.versionData(id, 1, b, me.id) });
      },
    });
    await indexContent(this.prisma.db, item.id, 1, b.title, `${b.text}\n\n${b.plainText ?? ''}`);
    await this.notifications.notify({ recipientIds, actorId: me.id, eventType: 'knowledge.new', title: `Neu im Wissen: ${b.title}`, body: b.requiresAck ? 'Bitte lesen und bestätigen.' : '', linkPath: `/wissen/${item.id}`, contentItemId: item.id });
    return { id: item.id };
  }

  @RequirePermission('knowledge.update')
  @Put(':id')
  async update(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Update)) b: z.infer<typeof Update>) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.knowledgeArticle || !can(await this.policy.loadContext(me.id), 'knowledge.update', { companyId: item.companyId })) throw new ForbiddenException('Diesen Artikel darfst du nicht ändern.');
    const n = item.currentVersion + 1;
    const db = this.prisma.db;
    await db.$transaction([
      db.knowledgeVersion.updateMany({ where: { articleId: id, status: 'PUBLISHED' }, data: { status: 'SUPERSEDED' } }),
      db.knowledgeVersion.create({ data: this.versionData(id, n, b, me.id) }),
      db.contentItem.update({ where: { id }, data: { currentVersion: n } }),
    ]);
    await indexContent(db, id, n, b.title, `${b.text}\n\n${b.plainText ?? ''}`);
    if (b.notify || item.requiresAcknowledgement) {
      const rec = await db.contentRecipient.findMany({ where: { contentItemId: id, removedAt: null, userId: { not: me.id } }, select: { userId: true } });
      await this.notifications.notify({ recipientIds: rec.map((r) => r.userId), actorId: me.id, eventType: 'knowledge.updated', title: `Aktualisiert: ${b.title}`,
        body: b.changeSummary ?? (item.requiresAcknowledgement ? 'Bitte die neue Version lesen und bestätigen.' : ''), linkPath: `/wissen/${id}`, contentItemId: id, dedupeKey: `kn:${id}:${n}` });
    }
    return { id, version: n };
  }

  @RequirePermission('knowledge.read')
  @Post(':id/ack')
  @HttpCode(200)
  async ack(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.requiresAcknowledgement) throw new BadRequestException('Hier ist keine Bestätigung nötig.');
    const now = dateOnly(); // nur Datum (ADR-012)
    await this.prisma.db.readReceipt.upsert({
      where: { contentItemId_userId: { contentItemId: id, userId: me.id } },
      create: { contentItemId: id, userId: me.id, firstSeenAt: now, openedAt: now, acknowledgedAt: now, acknowledgedVersion: item.currentVersion },
      update: { acknowledgedAt: now, acknowledgedVersion: item.currentVersion },
    });
    return { acknowledged: true, version: item.currentVersion };
  }

  private versionData(articleId: string, n: number, b: z.infer<typeof Version>, authorId: string) {
    return { articleId, versionNumber: n, status: 'PUBLISHED' as const, title: b.title, body: toBody(b.text), bodyText: b.text,
      plainLanguageText: b.plainText || null, changeSummary: b.changeSummary || (n === 1 ? 'Erste Fassung' : null), authorId, publishedAt: new Date() };
  }
}
