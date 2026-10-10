import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';

const KINDS = ['GENERAL', 'SHIFT', 'HACCP', 'EVENT', 'AUDIT'] as const;
const RTYPES = ['CHECK', 'YES_NO', 'TEXT', 'NUMBER', 'TEMPERATURE', 'PHOTO'] as const;
const Template = z.object({
  title: z.string().trim().min(3).max(140), description: z.string().trim().max(1000).nullish(), kind: z.enum(KINDS), groupId: z.uuid(),
  items: z.array(z.object({ title: z.string().trim().min(2).max(200), responseType: z.enum(RTYPES), required: z.boolean().default(true),
    min: z.number().nullish(), max: z.number().nullish(), unit: z.string().max(10).nullish() })).min(1).max(60),
});
const ItemUpdate = z.object({ done: z.boolean().optional(), value: z.string().trim().max(500).nullish(), note: z.string().trim().max(500).nullish(), photoFileId: z.uuid().nullish() });

/** Checklisten: Vorlage → Lauf (Content-Item) → abgehakte Punkte mit Nachweis. Abweichungen gehen an die Teamleitung. */
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  @RequirePermission('checklists.execute')
  @Get()
  async overview(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const db = this.prisma.db;
    const templates = await db.checklist.findMany({ where: { isActive: true, groupId: { in: ctx.groupIds } }, include: { group: true, _count: { select: { items: true } } }, orderBy: { title: 'asc' } });
    const runs = await db.contentItem.findMany({
      where: { type: 'CHECKLIST_RUN', ...this.content.visibleWhere(me.id), publishedAt: { gte: new Date(Date.now() - 7 * 864e5) } },
      include: { checklistRun: { include: { items: { select: { isDone: true, isOutOfRange: true } }, completedBy: { select: { displayName: true } } } } }, orderBy: { publishedAt: 'desc' }, take: 50,
    });
    return {
      canManage: can(ctx, 'checklists.manage_templates'),
      templates: templates.map((t) => ({ id: t.id, title: t.title, kind: t.kind, group: t.group?.name ?? '–', items: t._count.items })),
      runs: runs.map((r) => { const x = r.checklistRun!; return { id: r.id, title: x.title, status: x.status, done: x.items.filter((i) => i.isDone).length, total: x.items.length,
        deviations: x.items.filter((i) => i.isOutOfRange).length, completedBy: x.completedBy?.displayName ?? null, completedAt: x.completedAt, startedAt: x.startedAt }; }),
    };
  }

  @RequirePermission('checklists.manage_templates')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return { kinds: KINDS, responseTypes: RTYPES, groups: groups.filter((g) => can(ctx, 'checklists.manage_templates', { companyId: g.companyId, groupId: g.id })).map((g) => ({ id: g.id, name: g.name })) };
  }

  @RequirePermission('checklists.manage_templates')
  @Post('templates')
  async createTemplate(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Template)) b: z.infer<typeof Template>) {
    const g = await this.prisma.db.group.findUnique({ where: { id: b.groupId } });
    if (!g || !can(await this.policy.loadContext(me.id), 'checklists.manage_templates', { companyId: g.companyId, groupId: g.id })) throw new ForbiddenException('Für dieses Team darfst du keine Vorlagen anlegen.');
    const t = await this.prisma.db.checklist.create({ data: {
      title: b.title, description: b.description || null, kind: b.kind, groupId: g.id, companyId: g.companyId,
      items: { create: b.items.map((i, n) => ({ title: i.title, responseType: i.responseType, isRequired: i.required, minValue: i.min ?? null, maxValue: i.max ?? null, unit: i.unit || null, sortOrder: n })) },
    } });
    return { id: t.id };
  }

  @RequirePermission('checklists.execute')
  @Post(':templateId/start')
  async start(@CurrentUser() me: SessionUser, @Param('templateId', ParseUUIDPipe) templateId: string) {
    const ctx = await this.policy.loadContext(me.id);
    const t = await this.prisma.db.checklist.findFirst({ where: { id: templateId, isActive: true }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } });
    if (!t || !t.groupId || !ctx.groupIds.includes(t.groupId)) throw new NotFoundException('Diese Checkliste gibt es für dein Team nicht.');
    const day = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date());
    const { item } = await this.content.create({
      type: 'CHECKLIST_RUN', companyId: t.companyId, authorId: me.id, targets: [{ type: 'GROUP', groupId: t.groupId }], reactionsEnabled: false,
      createSubtype: (tx, id) => tx.checklistRun.create({ data: {
        id, checklistId: t.id, checklistVersion: t.version, assignedGroupId: t.groupId, title: `${t.title} · ${day}`, status: 'IN_PROGRESS', startedAt: new Date(),
        approvalStatus: t.requiresApproval ? 'PENDING' : 'NOT_REQUIRED',
        items: { create: t.items.map((i) => ({ checklistItemId: i.id, titleSnapshot: i.title, sortOrder: i.sortOrder })) },
      } }),
    });
    return { id: item.id };
  }

  private async loadRun(userId: string, id: string) {
    await this.content.getVisible(userId, id);
    return this.prisma.db.checklistRun.findUniqueOrThrow({ where: { id }, include: {
      checklist: { select: { kind: true, groupId: true } }, completedBy: { select: { displayName: true } },
      items: { orderBy: { sortOrder: 'asc' }, include: { checklistItem: true, completedBy: { select: { displayName: true } } } },
    } });
  }

  @RequirePermission('checklists.execute')
  @Get('runs/:id')
  async run(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.loadRun(me.id, id);
    return {
      id, title: r.title, status: r.status, kind: r.checklist.kind, completedAt: r.completedAt, completedBy: r.completedBy?.displayName ?? null,
      items: r.items.map((i) => ({
        id: i.id, title: i.titleSnapshot, type: i.checklistItem?.responseType ?? 'CHECK', required: i.checklistItem?.isRequired ?? true,
        min: i.checklistItem?.minValue != null ? Number(i.checklistItem.minValue) : null, max: i.checklistItem?.maxValue != null ? Number(i.checklistItem.maxValue) : null, unit: i.checklistItem?.unit ?? null,
        done: i.isDone, value: i.valueNumber != null ? String(i.valueNumber) : i.valueText, outOfRange: i.isOutOfRange, note: i.note, photoFileId: i.photoFileId,
        by: i.completedBy?.displayName ?? null, at: i.completedAt,
      })),
    };
  }

  @RequirePermission('checklists.execute')
  @Patch('runs/:id/items/:itemId')
  async tick(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(ItemUpdate)) b: z.infer<typeof ItemUpdate>) {
    const r = await this.loadRun(me.id, id);
    if (r.status === 'COMPLETED' || r.status === 'CANCELLED') throw new BadRequestException('Diese Checkliste ist schon abgeschlossen.');
    const it = r.items.find((i) => i.id === itemId);
    if (!it) throw new NotFoundException();
    const type = it.checklistItem?.responseType ?? 'CHECK';
    const data: Record<string, unknown> = { note: b.note ?? it.note };
    if (type === 'NUMBER' || type === 'TEMPERATURE') {
      if (b.value != null && b.value !== '') {
        const n = Number(b.value.replace(',', '.'));
        if (!Number.isFinite(n)) throw new BadRequestException('Bitte eine Zahl eintragen.');
        const min = it.checklistItem?.minValue, max = it.checklistItem?.maxValue;
        Object.assign(data, { valueNumber: n, isOutOfRange: (min != null && n < Number(min)) || (max != null && n > Number(max)), isDone: true });
      }
    } else if (type === 'PHOTO') {
      if (b.photoFileId) {
        const f = await this.prisma.db.fileObject.findFirst({ where: { id: b.photoFileId, uploadedById: me.id, mimeType: { startsWith: 'image/' } } });
        if (!f) throw new BadRequestException('Foto fehlt.');
        Object.assign(data, { photoFileId: f.id, isDone: true });
      }
    } else if (type === 'TEXT' || type === 'YES_NO') {
      if (b.value) Object.assign(data, { valueText: b.value, isDone: true, isOutOfRange: type === 'YES_NO' ? b.value === 'Nein' : null });
    } else if (b.done !== undefined) data.isDone = b.done;
    if (b.done === false) Object.assign(data, { isDone: false, valueNumber: null, valueText: null, isOutOfRange: null, photoFileId: null });
    const done = (data.isDone ?? it.isDone) as boolean;
    await this.prisma.db.$transaction([
      this.prisma.db.checklistRunItem.update({ where: { id: itemId }, data: { ...data, completedById: done ? me.id : null, completedAt: done ? new Date() : null } }),
      this.prisma.db.checklistRun.update({ where: { id }, data: { status: 'IN_PROGRESS' } }),
    ]);
    return this.run(me, id);
  }

  @RequirePermission('checklists.execute')
  @Post('runs/:id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.loadRun(me.id, id);
    if (r.status === 'COMPLETED') return { ok: true };
    const missing = r.items.filter((i) => (i.checklistItem?.isRequired ?? true) && !i.isDone);
    if (missing.length) throw new BadRequestException(`Noch offen: ${missing.map((i) => i.titleSnapshot).slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}`);
    const deviations = r.items.filter((i) => i.isOutOfRange);
    if (deviations.some((i) => !i.note)) throw new BadRequestException('Bitte trag bei jeder Abweichung ein, was du unternommen hast.');
    await this.prisma.db.checklistRun.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: me.id } });
    if (deviations.length && r.checklist.groupId) {
      const leads = await this.prisma.db.groupMembership.findMany({ where: { groupId: r.checklist.groupId, isLead: true, userId: { not: me.id } }, select: { userId: true } });
      await this.notifications.notify({ recipientIds: leads.map((l) => l.userId), actorId: me.id, eventType: 'checklist.deviation', importance: 'IMPORTANT',
        title: `Abweichung: ${r.title}`, body: deviations.map((d) => `${d.titleSnapshot}: ${d.valueNumber ?? d.valueText ?? ''} – ${d.note}`).join(' · ').slice(0, 300),
        linkPath: `/checklisten/${id}`, contentItemId: id });
    }
    return { ok: true, deviations: deviations.length };
  }
}
