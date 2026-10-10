import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { primaryCompany } from './common';

const STATUS = ['SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'IN_PROGRESS', 'IMPLEMENTED', 'PARKED', 'REJECTED'] as const;
export const IDEA_STATUS_LABEL: Record<(typeof STATUS)[number], string> = {
  SUBMITTED: 'Eingereicht', IN_REVIEW: 'Wird geprüft', ACCEPTED: 'Angenommen', IN_PROGRESS: 'In Umsetzung', IMPLEMENTED: 'Umgesetzt', PARKED: 'Geparkt', REJECTED: 'Abgelehnt',
};
const Create = z.object({ title: z.string().trim().min(3).max(140), description: z.string().trim().min(10).max(4000), categoryId: z.uuid().nullish() });
const SetStatus = z.object({ status: z.enum(STATUS), note: z.string().trim().max(500).nullish() });

/** Ideenboard: alle im Haus sehen Ideen, unterstützen (Like) und kommentieren; Leitungen führen den Status. */
@Controller('ideas')
export class IdeasController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  @RequirePermission('ideas.read')
  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const items = await db.contentItem.findMany({ where: { type: 'IDEA', ...this.content.visibleWhere(me.id) }, include: { idea: { include: { category: true } }, author: { select: { displayName: true } } }, orderBy: { publishedAt: 'desc' }, take: 100 });
    const deco = await this.content.decorate(me.id, items.map((i) => i.id));
    const ctx = await this.policy.loadContext(me.id);
    return {
      canCreate: can(ctx, 'ideas.create'), statusLabels: IDEA_STATUS_LABEL,
      categories: (await db.ideaCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })).map((c) => ({ id: c.id, name: c.name })),
      ideas: items.map((i) => ({ id: i.id, title: i.idea!.title, excerpt: i.idea!.description.slice(0, 200), status: i.idea!.status, category: i.idea!.category?.name ?? null, author: i.author?.displayName ?? '–', publishedAt: i.publishedAt, ...deco(i.id) })),
    };
  }

  @RequirePermission('ideas.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.content.getVisible(me.id, id);
    const idea = await this.prisma.db.idea.findUniqueOrThrow({ where: { id }, include: { category: true, statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { displayName: true } } } } } });
    return {
      id, title: idea.title, description: idea.description, status: idea.status, category: idea.category?.name ?? null, author: item.author?.displayName ?? '–', publishedAt: item.publishedAt,
      canManage: can(await this.policy.loadContext(me.id), 'ideas.manage', { companyId: item.companyId }), statusLabels: IDEA_STATUS_LABEL,
      history: idea.statusHistory.map((h) => ({ status: h.toStatus, note: h.note, at: h.createdAt, by: h.changedBy?.displayName ?? null })),
      ...(await this.content.decorate(me.id, [id]))(id),
    };
  }

  @RequirePermission('ideas.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const companyId = await primaryCompany(this.prisma, me.id);
    const { item } = await this.content.create({
      type: 'IDEA', companyId, authorId: me.id, targets: [{ type: 'COMPANY', companyId }],
      createSubtype: (tx, id) => tx.idea.create({ data: { id, title: b.title, description: b.description, categoryId: b.categoryId ?? null, statusHistory: { create: { toStatus: 'SUBMITTED', changedById: me.id } } } }),
    });
    return { id: item.id };
  }

  @RequirePermission('ideas.manage')
  @Patch(':id/status')
  async setStatus(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(SetStatus)) b: z.infer<typeof SetStatus>) {
    const item = await this.content.getVisible(me.id, id);
    if (!item.idea || !can(await this.policy.loadContext(me.id), 'ideas.manage', { companyId: item.companyId })) throw new ForbiddenException('Den Status führen Leitungen.');
    await this.prisma.db.idea.update({ where: { id }, data: { status: b.status, ownerId: me.id, statusHistory: { create: { fromStatus: item.idea.status, toStatus: b.status, note: b.note || null, changedById: me.id } } } });
    if (item.authorId && item.authorId !== me.id) {
      await this.notifications.notify({ recipientIds: [item.authorId], actorId: me.id, eventType: 'idea.status', title: `Deine Idee: ${IDEA_STATUS_LABEL[b.status]}`, body: `„${item.idea.title}“${b.note ? ` – ${b.note}` : ''}`, linkPath: `/ideen/${id}`, contentItemId: id });
    }
    return { id, status: b.status };
  }
}
