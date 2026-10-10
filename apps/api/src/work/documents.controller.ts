import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
const NewVersion = z.object({ fileId: z.uuid(), changeNote: z.string().trim().max(300).nullish() });

/** Dokumente mit Versionen. Sensible Kategorien (z. B. Personal) kommen nie in Suche und KI. */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly audiences: AudienceService, private readonly policy: PolicyService) {}

  private include = { document: { include: { category: true, versions: { orderBy: { versionNumber: 'desc' as const }, include: { fileObject: true, uploadedBy: { select: { displayName: true } } } } } } };

  private view(i: { id: string; companyId: string | null; document: { title: string; description: string | null; category: { name: string; isSensitive: boolean }; versions: Array<{ versionNumber: number; changeNote: string | null; createdAt: Date; fileObjectId: string; fileObject: { mimeType: string; sizeBytes: bigint; originalFilename: string }; uploadedBy: { displayName: string } | null }> } | null }) {
    const d = i.document!;
    const versions = d.versions.map((v) => ({ n: v.versionNumber, fileId: v.fileObjectId, name: v.fileObject.originalFilename, mime: v.fileObject.mimeType, size: Number(v.fileObject.sizeBytes), changeNote: v.changeNote, createdAt: v.createdAt, by: v.uploadedBy?.displayName ?? '–' }));
    return { id: i.id, title: d.title, description: d.description, category: d.category.name, sensitive: d.category.isSensitive, current: versions[0], versions };
  }

  @RequirePermission('documents.read')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const items = await this.prisma.db.contentItem.findMany({ where: { type: 'DOCUMENT', ...this.content.visibleWhere(me.id) }, include: this.include, orderBy: { updatedAt: 'desc' } });
    return { canCreate: can(await this.policy.loadContext(me.id), 'documents.create'), documents: items.map((i) => this.view(i)) };
  }

  @RequirePermission('documents.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const cats = await this.prisma.db.documentCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return { categories: cats.map((c) => ({ id: c.id, name: c.name, sensitive: c.isSensitive })), audiences: await this.audiences.newsOptions(await this.policy.loadContext(me.id)) };
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
    const cat = await this.prisma.db.documentCategory.findUniqueOrThrow({ where: { id: b.categoryId } });
    const { item } = await this.content.create({
      type: 'DOCUMENT', companyId: await primaryCompany(this.prisma, me.id), authorId: me.id, targets, commentsEnabled: false, reactionsEnabled: false,
      createSubtype: (tx, id) => tx.document.create({ data: { id, categoryId: b.categoryId, title: b.title, description: b.description || null,
        versions: { create: { versionNumber: 1, fileObjectId: b.fileId, changeNote: 'Erste Fassung', uploadedById: me.id } } } }),
    });
    if (!cat.isSensitive) await indexContent(this.prisma.db, item.id, 1, b.title, b.description ?? b.title);
    return { id: item.id };
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
