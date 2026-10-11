import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { indexContent } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { ContentService } from '../content/content.service';
import { AudienceKeys, assertOwnFreshFile, primaryCompany, toTargets } from './common';

const Create = z.object({ categoryId: z.uuid(), title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).nullish(), fileId: z.uuid(), audience: AudienceKeys });
const Category = z.object({ name: z.string().trim().min(2).max(80), parentId: z.uuid().nullish(), sensitive: z.boolean().default(false) });
const CategoryUpdate = z.object({ name: z.string().trim().min(2).max(80).optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional(), parentId: z.uuid().nullish() });
const NewVersion = z.object({ fileId: z.uuid(), changeNote: z.string().trim().max(300).nullish() });

/** Dokumente mit Versionen. Sensible Kategorien (z. B. Personal) kommen nie in Suche und KI. */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audiences: AudienceService, private readonly policy: PolicyService) {}

  private include = { document: { include: { category: true, versions: { orderBy: { versionNumber: 'desc' as const }, include: { fileObject: true, uploadedBy: { select: { displayName: true } } } } } } };

  private view(i: { id: string; companyId: string | null; document: { title: string; description: string | null; category: { id: string; name: string; isSensitive: boolean }; versions: Array<{ versionNumber: number; changeNote: string | null; createdAt: Date; fileObjectId: string; fileObject: { mimeType: string; sizeBytes: bigint; originalFilename: string }; uploadedBy: { displayName: string } | null }> } | null }) {
    const d = i.document!;
    const versions = d.versions.map((v) => ({ n: v.versionNumber, fileId: v.fileObjectId, name: v.fileObject.originalFilename, mime: v.fileObject.mimeType, size: Number(v.fileObject.sizeBytes), changeNote: v.changeNote, createdAt: v.createdAt, by: v.uploadedBy?.displayName ?? '–' }));
    return { id: i.id, title: d.title, description: d.description, categoryId: d.category.id, category: d.category.name, sensitive: d.category.isSensitive, current: versions[0], versions };
  }

  @RequirePermission('documents.read')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const items = await this.prisma.db.contentItem.findMany({ where: { type: 'DOCUMENT', ...this.content.visibleWhere(me.id) }, include: this.include, orderBy: { updatedAt: 'desc' } });
    const ctx = await this.policy.loadContext(me.id);
    return { canCreate: can(ctx, 'documents.create'), canManage: can(ctx, 'documents.manage_categories'), categories: await this.categories(), documents: items.map((i) => this.view(i)) };
  }

  @RequirePermission('documents.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    return { categories: (await this.categories()).map((c) => ({ id: c.id, name: c.path, sensitive: c.sensitive })), audiences: await this.audiences.newsOptions(await this.policy.loadContext(me.id)) };
  }

  @RequirePermission('documents.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.content.getVisible(me.id, id);
    const i = await this.prisma.db.contentItem.findUniqueOrThrow({ where: { id }, include: this.include });
    return { ...this.view(i), canUpdate: can(await this.policy.loadContext(me.id), 'documents.update', { companyId: i.companyId }), audience: await this.audiences.describe(id) };
  }

  @RequirePermission('documents.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const targets = toTargets(b.audience);
    await this.audiences.assertNewsTargets(await this.policy.loadContext(me.id), targets);
    await assertOwnFreshFile(this.prisma, me.id, b.fileId);
    const cat = (await this.categories()).find((c) => c.id === b.categoryId);
    if (!cat) throw new BadRequestException('Diese Kategorie gibt es nicht.');
    const { item } = await this.content.create({
      type: 'DOCUMENT', companyId: await primaryCompany(this.prisma, me.id), authorId: me.id, targets, commentsEnabled: false, reactionsEnabled: false,
      createSubtype: (tx, id) => tx.document.create({ data: { id, categoryId: b.categoryId, title: b.title, description: b.description || null,
        versions: { create: { versionNumber: 1, fileObjectId: b.fileId, changeNote: 'Erste Fassung', uploadedById: me.id } } } }),
    });
    if (!cat.sensitive) await indexContent(this.prisma.db, item.id, 1, b.title, b.description ?? b.title);
    return { id: item.id };
  }

  /** Kategorienbaum (aktiv), sortiert, mit Pfad „Personal › Verträge“; vertraulich vererbt sich nach unten. */
  private async categories() {
    const all = await this.prisma.db.documentCategory.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    const byId = new Map(all.map((c) => [c.id, c]));
    const chain = (c: (typeof all)[number]) => { const out = [c]; let p = c.parentId ? byId.get(c.parentId) : undefined; while (p && out.length < 10) { out.unshift(p); p = p.parentId ? byId.get(p.parentId) : undefined; } return out; };
    const rows = all.map((c) => { const ch = chain(c); return { id: c.id, name: c.name, parentId: c.parentId && byId.has(c.parentId) ? c.parentId : null, path: ch.map((x) => x.name).join(' › '), sensitive: ch.some((x) => x.isSensitive), sortOrder: c.sortOrder }; });
    return rows.sort((a, b) => a.path.localeCompare(b.path, 'de'));
  }

  @RequirePermission('documents.manage_categories')
  @Post('categories')
  async createCategory(@Body(new ZodPipe(Category)) b: z.infer<typeof Category>) {
    const c = await this.prisma.db.documentCategory.create({ data: { name: b.name, parentId: b.parentId ?? null, isSensitive: b.sensitive } }).catch(() => { throw new BadRequestException('Diese Kategorie gibt es an dieser Stelle schon.'); });
    return { id: c.id };
  }

  @RequirePermission('documents.manage_categories')
  @Patch('categories/:id')
  async updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CategoryUpdate)) b: z.infer<typeof CategoryUpdate>) {
    if (b.parentId === id) throw new BadRequestException('Eine Kategorie kann nicht in sich selbst liegen.');
    if (b.isActive === false && await this.prisma.db.document.count({ where: { categoryId: id, contentItem: { deletedAt: null } } })) throw new BadRequestException('Erst die Dokumente verschieben, dann die Kategorie ausblenden.');
    await this.prisma.db.documentCategory.update({ where: { id }, data: b });
    return { id };
  }

  /** Dokument in eine andere Kategorie verschieben (Suche: vertraulich → nie indexiert). */
  @RequirePermission('documents.update')
  @Patch(':id')
  async move(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ categoryId: z.uuid() }))) b: { categoryId: string }) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.document || !can(await this.policy.loadContext(me.id), 'documents.update', { companyId: item.companyId })) throw new ForbiddenException('Dieses Dokument darfst du nicht ändern.');
    const cat = (await this.categories()).find((c) => c.id === b.categoryId);
    if (!cat) throw new BadRequestException('Diese Kategorie gibt es nicht.');
    await this.prisma.db.document.update({ where: { id }, data: { categoryId: cat.id } });
    if (cat.sensitive) await this.prisma.db.searchChunk.deleteMany({ where: { contentItemId: id } });
    else await indexContent(this.prisma.db, id, item.currentVersion, item.document.title, item.document.description ?? item.document.title);
    return { id };
  }

  @RequirePermission('documents.update')
  @Post(':id/versions')
  async addVersion(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(NewVersion)) b: z.infer<typeof NewVersion>) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.document || !can(await this.policy.loadContext(me.id), 'documents.update', { companyId: item.companyId })) throw new ForbiddenException('Dieses Dokument darfst du nicht ändern.');
    await assertOwnFreshFile(this.prisma, me.id, b.fileId);
    const n = item.currentVersion + 1;
    await this.prisma.db.$transaction([
      this.prisma.db.documentVersion.create({ data: { documentId: id, versionNumber: n, fileObjectId: b.fileId, changeNote: b.changeNote || null, uploadedById: me.id } }),
      this.prisma.db.contentItem.update({ where: { id }, data: { currentVersion: n } }),
    ]);
    return { id, version: n };
  }
}
