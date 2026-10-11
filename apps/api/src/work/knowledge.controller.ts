import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { indexContent } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can, PolicyContext } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { ContentService, dateOnly, toBody } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { AuditService } from '../audit/audit.service';
import { AudienceKeys, primaryCompany, slug, toTargets } from './common';
import { categoryTree } from './categories';

const TYPES = ['WIKI', 'SOP', 'POLICY', 'BRAND_STANDARD', 'HACCP', 'PROCESS', 'MANUAL', 'TEMPLATE_FORM'] as const;
const Version = z.object({
  title: z.string().trim().min(3).max(160),
  text: z.string().trim().min(1).max(40000),
  plainText: z.string().trim().max(10000).nullish(),
  changeSummary: z.string().trim().max(300).nullish(),
  categoryId: z.uuid().optional(),
});
const Create = Version.extend({ categoryId: z.uuid(), articleType: z.enum(TYPES), requiresAck: z.boolean().default(false), audience: AudienceKeys });
const Update = Version.extend({ notify: z.boolean().default(false) });
const Category = z.object({ name: z.string().trim().min(2).max(80), parentId: z.uuid().nullish() });
const CategoryUpdate = z.object({ name: z.string().trim().min(2).max(80).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() });

type Item = { id: string; authorId: string | null; companyId: string | null };

/**
 * Wissen & SOPs (ADR-045): alle Mitarbeitenden schreiben Einträge; die Teamleitung der Autor:in
 * (oder Abteilungsleitung/Redaktion) prüft, korrigiert, gibt frei oder lehnt mit Begründung ab.
 * Wer selbst freigeben darf, veröffentlicht direkt. Jede Änderung danach ist eine neue Version.
 */
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audiences: AudienceService,
    private readonly policy: PolicyService, private readonly notifications: NotificationService, private readonly audit: AuditService) {}

  /** Darf die Person Einträge dieser Autor:in freigeben? Teamleitung einer Gruppe der Autor:in oder Recht für die Gesellschaft. */
  private async mayReview(ctx: PolicyContext, item: Item) {
    if (can(ctx, 'knowledge.publish', { companyId: item.companyId })) return true;
    if (!item.authorId) return false;
    const groups = await this.prisma.db.groupMembership.findMany({ where: { userId: item.authorId }, select: { groupId: true } });
    return groups.some((g) => can(ctx, 'knowledge.publish', { groupId: g.groupId, companyId: item.companyId }));
  }

  private categories() {
    return this.prisma.db.knowledgeCategory.findMany({ where: { isActive: true } }).then(categoryTree);
  }

  @RequirePermission('knowledge.read')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const ctx = await this.policy.loadContext(me.id);
    const include = { knowledgeArticle: { include: { versions: { orderBy: { versionNumber: 'desc' as const }, take: 1 } } }, readReceipts: { where: { userId: me.id } }, author: { select: { displayName: true } } };
    const [items, drafts] = await Promise.all([
      db.contentItem.findMany({ where: { type: 'KNOWLEDGE_ARTICLE', status: 'PUBLISHED', ...this.content.visibleWhere(me.id) }, include }),
      db.contentItem.findMany({ where: { type: 'KNOWLEDGE_ARTICLE', status: { in: ['DRAFT', 'ARCHIVED'] }, deletedAt: null }, include, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    const review = [];
    for (const d of drafts.filter((x) => x.status === 'DRAFT' && x.authorId !== me.id)) if (await this.mayReview(ctx, d)) review.push(d);
    const row = (i: (typeof items)[number]) => ({
      id: i.id, title: i.knowledgeArticle!.versions[0]?.title ?? '–', type: i.knowledgeArticle!.articleType, categoryId: i.knowledgeArticle!.categoryId, version: i.currentVersion,
      updatedAt: i.updatedAt, author: i.author?.displayName ?? '–', status: i.status, requiresAck: i.requiresAcknowledgement, acknowledged: i.readReceipts[0]?.acknowledgedVersion === i.currentVersion,
    });
    return {
      canCreate: can(ctx, 'knowledge.create'), canManage: can(ctx, 'knowledge.manage_categories'), categories: await this.categories(),
      articles: items.map(row).sort((a, b) => a.title.localeCompare(b.title, 'de')),
      mine: drafts.filter((d) => d.authorId === me.id).map(row), review: review.map(row),
    };
  }

  @RequirePermission('knowledge.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    return { categories: (await this.categories()).map((c) => ({ id: c.id, name: c.path })), types: TYPES, audiences: await this.audiences.newsOptions(ctx, true),
      publishesDirectly: can(ctx, 'knowledge.publish', { companyId: ctx.companyIds[0] }) || ctx.groupIds.some((g) => can(ctx, 'knowledge.publish', { groupId: g })) };
  }

  @RequirePermission('knowledge.manage_categories')
  @Post('categories')
  async createCategory(@Body(new ZodPipe(Category)) b: z.infer<typeof Category>) {
    const c = await this.prisma.db.knowledgeCategory.create({ data: { name: b.name, slug: slug(b.name), parentId: b.parentId ?? null } })
      .catch(() => { throw new BadRequestException('Diese Kategorie gibt es an dieser Stelle schon.'); });
    return { id: c.id };
  }

  @RequirePermission('knowledge.manage_categories')
  @Patch('categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CategoryUpdate)) b: z.infer<typeof CategoryUpdate>) {
    if (b.isActive === false && await this.prisma.db.knowledgeArticle.count({ where: { categoryId: id, contentItem: { deletedAt: null, status: { not: 'ARCHIVED' } } } })) throw new BadRequestException('Erst die Artikel verschieben, dann die Kategorie ausblenden.');
    await this.prisma.db.knowledgeCategory.update({ where: { id }, data: { ...b, ...(b.name ? { slug: slug(b.name) } : {}) } });
    return { id };
  }

  /** Artikel laden: sichtbar für Empfänger:innen, Autor:in (auch Entwurf/abgelehnt) und Prüfende. */
  private async load(me: string, id: string) {
    const db = this.prisma.db;
    const item = await db.contentItem.findFirst({ where: { id, type: 'KNOWLEDGE_ARTICLE', deletedAt: null } });
    if (!item) throw new NotFoundException('Diesen Artikel gibt es nicht oder er ist nicht für dich bestimmt.');
    const ctx = await this.policy.loadContext(me);
    const visible = item.status === 'PUBLISHED' ? await db.contentRecipient.count({ where: { contentItemId: id, userId: me, removedAt: null } }) > 0 || item.authorId === me : item.authorId === me;
    const reviewer = item.status !== 'PUBLISHED' && await this.mayReview(ctx, item);
    if (!visible && !reviewer) throw new NotFoundException('Diesen Artikel gibt es nicht oder er ist nicht für dich bestimmt.');
    return { item, ctx, reviewer };
  }

  @RequirePermission('knowledge.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const { item, ctx, reviewer } = await this.load(me.id, id);
    const db = this.prisma.db;
    const a = await db.knowledgeArticle.findUniqueOrThrow({ where: { id }, include: { category: true, versions: { orderBy: { versionNumber: 'desc' }, include: { author: { select: { displayName: true } } } } } });
    const cur = a.versions.find((v) => v.status === 'PUBLISHED') ?? a.versions[0];
    const receipt = await db.readReceipt.findUnique({ where: { contentItemId_userId: { contentItemId: id, userId: me.id } } });
    const mayEdit = item.status === 'PUBLISHED' && can(ctx, 'knowledge.update', { companyId: item.companyId });
    const acks = mayEdit && item.requiresAcknowledgement
      ? { done: await db.readReceipt.count({ where: { contentItemId: id, acknowledgedVersion: item.currentVersion, userId: { not: item.authorId ?? undefined } } }),
          total: await db.contentRecipient.count({ where: { contentItemId: id, removedAt: null, userId: { not: item.authorId ?? undefined } } }) }
      : null;
    const rejection = item.status === 'ARCHIVED' ? await db.auditLog.findFirst({ where: { entityId: id, action: 'knowledge.rejected' }, orderBy: { occurredAt: 'desc' } }) : null;
    const categoryPath = (await this.categories()).find((c) => c.id === a.categoryId)?.path ?? a.category.name;
    return {
      id, title: cur.title, text: cur.bodyText, plainText: cur.plainLanguageText, type: a.articleType, category: categoryPath, categoryId: a.categoryId, version: cur.versionNumber,
      publishedAt: cur.publishedAt, author: cur.author?.displayName ?? '–', status: item.status, requiresAck: item.requiresAcknowledgement,
      acknowledged: receipt?.acknowledgedVersion === item.currentVersion, acks, canEdit: mayEdit, canReview: reviewer && item.status === 'DRAFT',
      rejectedReason: (rejection?.metadata as { reason?: string } | null)?.reason ?? null, audience: await this.audiences.describe(id),
      history: a.versions.filter((v) => v.status !== 'DRAFT').map((v) => ({ n: v.versionNumber, title: v.title, changeSummary: v.changeSummary, publishedAt: v.publishedAt, author: v.author?.displayName ?? '–' })),
    };
  }

  @RequirePermission('knowledge.read')
  @Get(':id/versions/:n')
  async version(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('n', ParseIntPipe) n: number) {
    await this.load(me.id, id);
    const v = await this.prisma.db.knowledgeVersion.findUniqueOrThrow({ where: { articleId_versionNumber: { articleId: id, versionNumber: n } } });
    return { n, title: v.title, text: v.bodyText, changeSummary: v.changeSummary, publishedAt: v.publishedAt };
  }

  @RequirePermission('knowledge.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const targets = toTargets(b.audience);
    const ctx = await this.policy.loadContext(me.id);
    await this.audiences.assertNewsTargets(ctx, targets, true);
    if (b.requiresAck && !can(ctx, 'knowledge.require_acknowledgement')) throw new ForbiddenException('„Kenntnis nehmen“ verlangen darfst du nicht.');
    if (!(await this.categories()).some((c) => c.id === b.categoryId)) throw new BadRequestException('Diese Kategorie gibt es nicht.');
    const companyId = await primaryCompany(this.prisma, me.id);
    const direct = await this.mayReview(ctx, { id: '', authorId: me.id, companyId });
    const { item, recipientIds } = await this.content.create({
      type: 'KNOWLEDGE_ARTICLE', companyId, authorId: me.id, targets, requiresAcknowledgement: b.requiresAck, status: direct ? 'PUBLISHED' : 'DRAFT',
      createSubtype: async (tx, id) => {
        await tx.knowledgeArticle.create({ data: { id, categoryId: b.categoryId, articleType: b.articleType, slug: `${slug(b.title)}-${id.slice(0, 6)}`, ownerId: me.id } });
        await tx.knowledgeVersion.create({ data: this.versionData(id, 1, b, me.id, direct) });
      },
    });
    if (direct) await this.published(item.id, me.id, recipientIds, b.title, b.requiresAck);
    else await this.askForReview(me.id, item.id, b.title);
    return { id: item.id, status: direct ? 'PUBLISHED' : 'DRAFT' };
  }

  /** Teamleitungen der Autor:in um Prüfung bitten. */
  private async askForReview(authorId: string, id: string, title: string) {
    const db = this.prisma.db;
    const groups = (await db.groupMembership.findMany({ where: { userId: authorId }, select: { groupId: true } })).map((g) => g.groupId);
    const leads = await db.groupMembership.findMany({ where: { groupId: { in: groups }, isLead: true, userId: { not: authorId } }, select: { userId: true } });
    const name = (await db.user.findUnique({ where: { id: authorId } }))?.displayName ?? 'Jemand';
    await this.notifications.notify({ recipientIds: leads.map((l) => l.userId), actorId: authorId, eventType: 'knowledge.review', title: `Bitte prüfen: ${title}`, body: `Neuer Wissenseintrag von ${name}`, linkPath: `/wissen/${id}`, dedupeKey: `kn-review:${id}:${Date.now()}` });
  }

  private async published(id: string, actorId: string, recipientIds: string[], title: string, ack: boolean) {
    const v = await this.prisma.db.knowledgeVersion.findFirstOrThrow({ where: { articleId: id, status: 'PUBLISHED' }, orderBy: { versionNumber: 'desc' } });
    await indexContent(this.prisma.db, id, v.versionNumber, v.title, `${v.bodyText}\n\n${v.plainLanguageText ?? ''}`);
    await this.notifications.notify({ recipientIds, actorId, eventType: 'knowledge.new', title: `Neu im Wissen: ${title}`, body: ack ? 'Bitte lesen und bestätigen.' : '', linkPath: `/wissen/${id}`, contentItemId: id, dedupeKey: `kn-new:${id}` });
  }

  /** Prüfen: Entwurf korrigieren (optional) und freigeben – oder mit Begründung ablehnen. */
  @RequirePermission('knowledge.read')
  @Post(':id/review')
  @HttpCode(200)
  async review(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(z.object({ approve: z.boolean(), reason: z.string().trim().max(500).nullish(), correction: Version.partial().optional() }))) b: { approve: boolean; reason?: string | null; correction?: Partial<z.infer<typeof Version>> }) {
    const { item, reviewer } = await this.load(me.id, id);
    if (item.status !== 'DRAFT' || !reviewer) throw new ForbiddenException('Freigeben darf die Teamleitung der Person, die den Eintrag geschrieben hat.');
    if (item.authorId === me.id) throw new ForbiddenException('Eigene Einträge gibt jemand anderes frei.');
    const db = this.prisma.db;
    const v = await db.knowledgeVersion.findFirstOrThrow({ where: { articleId: id }, orderBy: { versionNumber: 'desc' } });
    const title = b.correction?.title ?? v.title;
    if (!b.approve) {
      if (!b.reason) throw new BadRequestException('Bitte schreib kurz, warum der Eintrag nicht passt.');
      await db.contentItem.update({ where: { id }, data: { status: 'ARCHIVED' } });
      await this.audit.log({ actorId: me.id, companyId: item.companyId, action: 'knowledge.rejected', entityType: 'content_item', entityId: id, metadata: { reason: b.reason } });
      await this.notifications.notify({ recipientIds: [item.authorId!], actorId: me.id, eventType: 'knowledge.rejected', title: `Nicht freigegeben: ${title}`, body: b.reason, linkPath: `/wissen/${id}`, dedupeKey: `kn-rej:${id}:${Date.now()}` });
      return { status: 'ARCHIVED' };
    }
    const c = b.correction ?? {};
    await db.$transaction([
      db.knowledgeVersion.update({ where: { id: v.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), title, ...(c.text ? { bodyText: c.text, body: toBody(c.text) } : {}),
        ...(c.plainText !== undefined ? { plainLanguageText: c.plainText || null } : {}), changeSummary: c.text || c.title ? `Erste Fassung (korrigiert von der Teamleitung)` : v.changeSummary } }),
      db.contentItem.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }),
      ...(c.categoryId ? [db.knowledgeArticle.update({ where: { id }, data: { categoryId: c.categoryId } })] : []),
    ]);
    await this.audit.log({ actorId: me.id, companyId: item.companyId, action: 'knowledge.approved', entityType: 'content_item', entityId: id, metadata: { corrected: !!(c.text || c.title) } });
    const rec = (await db.contentRecipient.findMany({ where: { contentItemId: id, removedAt: null }, select: { userId: true } })).map((r) => r.userId).filter((u) => u !== item.authorId);
    await this.published(id, me.id, rec, title, item.requiresAcknowledgement);
    await this.notifications.notify({ recipientIds: [item.authorId!], actorId: me.id, eventType: 'knowledge.approved', title: `Freigegeben: ${title}`, body: c.text || c.title ? 'Mit kleinen Korrekturen der Teamleitung.' : 'Danke für deinen Beitrag!', linkPath: `/wissen/${id}`, dedupeKey: `kn-ok:${id}` });
    return { status: 'PUBLISHED' };
  }

  /** Abgelehnten Eintrag überarbeiten und erneut einreichen (nur Autor:in). */
  @RequirePermission('knowledge.create')
  @Post(':id/resubmit')
  @HttpCode(200)
  async resubmit(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Version)) b: z.infer<typeof Version>) {
    const { item } = await this.load(me.id, id);
    if (item.authorId !== me.id || item.status === 'PUBLISHED') throw new ForbiddenException('Nur eigene, noch nicht freigegebene Einträge.');
    const db = this.prisma.db;
    const v = await db.knowledgeVersion.findFirstOrThrow({ where: { articleId: id }, orderBy: { versionNumber: 'desc' } });
    await db.$transaction([
      db.knowledgeVersion.update({ where: { id: v.id }, data: { title: b.title, bodyText: b.text, body: toBody(b.text), plainLanguageText: b.plainText || null } }),
      db.contentItem.update({ where: { id }, data: { status: 'DRAFT' } }),
      ...(b.categoryId ? [db.knowledgeArticle.update({ where: { id }, data: { categoryId: b.categoryId } })] : []),
    ]);
    await this.askForReview(me.id, id, b.title);
    return { status: 'DRAFT' };
  }

  @RequirePermission('knowledge.update')
  @Put(':id')
  async update(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Update)) b: z.infer<typeof Update>) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.knowledgeArticle || item.status !== 'PUBLISHED' || !can(await this.policy.loadContext(me.id), 'knowledge.update', { companyId: item.companyId })) throw new ForbiddenException('Diesen Artikel darfst du nicht ändern.');
    const n = item.currentVersion + 1;
    const db = this.prisma.db;
    await db.$transaction([
      db.knowledgeVersion.updateMany({ where: { articleId: id, status: 'PUBLISHED' }, data: { status: 'SUPERSEDED' } }),
      db.knowledgeVersion.create({ data: this.versionData(id, n, b, me.id, true) }),
      db.contentItem.update({ where: { id }, data: { currentVersion: n } }),
      ...(b.categoryId ? [db.knowledgeArticle.update({ where: { id }, data: { categoryId: b.categoryId } })] : []),
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

  private versionData(articleId: string, n: number, b: z.infer<typeof Version>, authorId: string, publish: boolean) {
    return { articleId, versionNumber: n, status: publish ? 'PUBLISHED' as const : 'DRAFT' as const, title: b.title, body: toBody(b.text), bodyText: b.text,
      plainLanguageText: b.plainText || null, changeSummary: b.changeSummary || (n === 1 ? 'Erste Fassung' : null), authorId, publishedAt: publish ? new Date() : null };
  }
}
