import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can, PolicyContext } from '../policy/engine';
import { AudienceService } from '../content/audience.service';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { AudienceKeys, primaryCompany, toTargets } from './common';
import { describeRule, nextOccurrence, toRule } from './recurrence';

const KINDS = ['GENERAL', 'SHIFT', 'HACCP', 'EVENT', 'AUDIT'] as const;
const RTYPES = ['CHECK', 'YES_NO', 'CHOICE', 'TEXT', 'NUMBER', 'TEMPERATURE', 'PHOTO', 'SIGNATURE', 'HEADING'] as const;
const HOURS = 3600_000;

const Item = z.object({
  key: z.string().max(40), title: z.string().trim().min(1).max(200), type: z.enum(RTYPES), description: z.string().trim().max(500).nullish(),
  required: z.boolean().default(true), options: z.array(z.string().trim().min(1).max(60)).max(12).default([]), flagged: z.array(z.string().max(60)).max(12).default([]),
  requireNote: z.boolean().default(false), requirePhoto: z.boolean().default(false), createTask: z.boolean().default(false),
  min: z.number().nullish(), max: z.number().nullish(), unit: z.string().max(10).nullish(),
  showIf: z.object({ key: z.string().max(40), value: z.string().max(60) }).nullish(),
});
const Template = z.object({
  title: z.string().trim().min(3).max(140), description: z.string().trim().max(1000).nullish(), kind: z.enum(KINDS).default('GENERAL'),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'), completionMode: z.enum(['SHARED', 'EACH']).default('SHARED'),
  assignees: z.array(z.string().regex(/^(ALL|[CGU]:[0-9a-f-]{36})$/)).max(60).default([]), dueInHours: z.number().int().min(1).max(24 * 60).nullish(),
  repeat: z.enum(['NONE', 'DAILY', 'WEEKDAYS']).default('NONE'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:00'),
  requiresApproval: z.boolean().default(false), startNow: z.boolean().default(false),
  items: z.array(Item).min(1).max(100),
}).refine((t) => t.repeat === 'NONE' || t.assignees.length, 'Wiederkehrende Checklisten brauchen Empfänger:innen.')
  .refine((t) => t.items.some((i) => i.type !== 'HEADING'), 'Bitte mindestens einen Punkt zum Abhaken anlegen.');
const Start = z.object({ assignees: AudienceKeys.optional(), dueAt: z.iso.datetime({ offset: true }).nullish() });
const Approve = z.object({ approve: z.boolean(), note: z.string().trim().max(300).nullish() });
const ItemUpdate = z.object({ done: z.boolean().optional(), value: z.string().trim().max(1000).nullish(), note: z.string().trim().max(1000).nullish(), photoFileId: z.uuid().nullish() });

type TemplateFull = Prisma.ChecklistGetPayload<{ include: { items: true } }>;

/** Antwort kritisch? (Ja/Nein, Auswahl: markierte Antworten; Zahl: außerhalb der Grenzwerte) */
const isFlagged = (flagged: string[], value: string | null | undefined) => !!value && flagged.includes(value);

/**
 * Läufe aus einer Vorlage anlegen (ADR-056): „gemeinsam“ = eine Liste für alle Empfänger:innen,
 * „jede:r einzeln“ = eine eigene Liste je Person. Ohne Empfänger:innen bekommt sie, wer startet.
 */
export async function createRuns(deps: { content: ContentService; audiences: AudienceService; notifications: NotificationService },
  t: TemplateFull, starterId: string | null, keys: string[] = t.assignees, dueAt: Date | null = t.dueInHours ? new Date(Date.now() + t.dueInHours * HOURS) : null) {
  const day = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date());
  const targetKeys = keys.length ? keys : starterId ? [`U:${starterId}`] : [];
  if (!targetKeys.length) return [];
  const items = t.items.filter((i) => i.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const one = (targets: ReturnType<typeof toTargets>, assigneeUserId: string | null) => deps.content.create({
    type: 'CHECKLIST_RUN', companyId: t.companyId, authorId: starterId, targets, reactionsEnabled: false,
    createSubtype: (tx, id) => tx.checklistRun.create({ data: {
      id, checklistId: t.id, checklistVersion: t.version, assignedGroupId: t.groupId, assigneeUserId, title: `${t.title} · ${day}`, status: 'PLANNED', dueAt,
      items: { create: items.map((i) => ({ checklistItemId: i.id, titleSnapshot: i.title, sortOrder: i.sortOrder })) },
    } }),
  });
  const runs = t.completionMode === 'EACH'
    ? await Promise.all((await deps.audiences.resolve(toTargets(targetKeys))).slice(0, 200).map((u) => one([{ type: 'USER', userId: u }], u)))
    : [await one(toTargets(targetKeys), null)];
  for (const r of runs) {
    await deps.notifications.notify({ recipientIds: r.recipientIds, actorId: starterId ?? undefined, eventType: 'checklist.due', title: `Checkliste für dich: ${t.title}`,
      body: dueAt ? `Fällig ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(dueAt)}` : '', linkPath: `/checklisten/${r.item.id}`, contentItemId: r.item.id, dedupeKey: `run:${r.item.id}` });
  }
  return runs.map((r) => r.item.id);
}

/** Checklisten für alle (ADR-056): Vorlage → Läufe → abgehakte Punkte mit Nachweis; kritische Antworten an die Leitung. */
@Controller('checklists')
export class ChecklistsController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService,
    private readonly notifications: NotificationService, private readonly audiences: AudienceService) {}

  private get deps() { return { content: this.content, audiences: this.audiences, notifications: this.notifications }; }

  /** Vorlagen, die jemand sieht: eigene, öffentliche im eigenen Haus, zugewiesene; Leitungen alle im Bereich. */
  private visibleTemplates(ctx: PolicyContext): Prisma.ChecklistWhereInput {
    return { isActive: true, OR: [
      { ownerId: ctx.userId },
      { visibility: 'PUBLIC', OR: [{ companyId: { in: ctx.companyIds } }, { companyId: null }] },
      { assignees: { hasSome: [`U:${ctx.userId}`, ...ctx.groupIds.map((g) => `G:${g}`)] } },
      ...(ctx.grants.has('checklists.manage_templates') ? [{ companyId: { in: ctx.companyIds } }] : []),
    ] };
  }
  private mayEdit(ctx: PolicyContext, t: { ownerId: string | null; companyId: string | null; groupId: string | null }) {
    return t.ownerId === ctx.userId || can(ctx, 'checklists.manage_templates', { companyId: t.companyId, groupId: t.groupId });
  }
  private async labels(keys: string[]) {
    const ids = (p: string) => keys.filter((k) => k.startsWith(p)).map((k) => k.slice(2));
    const [users, groups, companies] = await Promise.all([
      this.prisma.db.user.findMany({ where: { id: { in: ids('U:') } }, select: { id: true, displayName: true } }),
      this.prisma.db.group.findMany({ where: { id: { in: ids('G:') } }, select: { id: true, name: true } }),
      this.prisma.db.company.findMany({ where: { id: { in: ids('C:') } }, select: { id: true, name: true } }),
    ]);
    return keys.map((k) => k === 'ALL' ? 'Alle' : users.find((u) => `U:${u.id}` === k)?.displayName ?? groups.find((g) => `G:${g.id}` === k)?.name ?? companies.find((c) => `C:${c.id}` === k)?.name ?? '–');
  }

  @RequirePermission('checklists.execute')
  @Get()
  async overview(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const db = this.prisma.db;
    const [templates, runs] = await Promise.all([
      db.checklist.findMany({ where: this.visibleTemplates(ctx), include: { group: true, owner: { select: { displayName: true } }, _count: { select: { items: { where: { isActive: true, responseType: { not: 'HEADING' } } } } } }, orderBy: { title: 'asc' } }),
      db.contentItem.findMany({
        where: { type: 'CHECKLIST_RUN', ...this.content.visibleWhere(me.id), AND: [{ OR: [{ checklistRun: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }, { publishedAt: { gte: new Date(Date.now() - 30 * 864e5) } }] }] },
        include: { checklistRun: { include: { items: { select: { isDone: true, isOutOfRange: true, checklistItem: { select: { responseType: true } } } }, completedBy: { select: { displayName: true } } } } },
        orderBy: { publishedAt: 'desc' }, take: 100,
      }),
    ]);
    const people = new Map((await db.user.findMany({ where: { id: { in: runs.map((r) => r.checklistRun!.assigneeUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return {
      templates: await Promise.all(templates.map(async (t) => ({ id: t.id, title: t.title, kind: t.kind, items: t._count.items, repeat: describeRule(t.recurrenceRule), approval: t.requiresApproval,
        visibility: t.visibility, mode: t.completionMode, owner: t.owner?.displayName ?? (t.group?.name ?? '–'), mine: t.ownerId === me.id, canEdit: this.mayEdit(ctx, t), assignees: await this.labels(t.assignees) }))),
      runs: runs.map((r) => { const x = r.checklistRun!; const items = x.items.filter((i) => i.checklistItem?.responseType !== 'HEADING'); return { id: r.id, title: x.title, status: x.status,
        done: items.filter((i) => i.isDone).length, total: items.length, deviations: items.filter((i) => i.isOutOfRange).length, approval: x.approvalStatus, dueAt: x.dueAt,
        overdue: !!x.dueAt && x.dueAt < new Date() && x.status !== 'COMPLETED', completedBy: x.completedBy?.displayName ?? null, completedAt: x.completedAt, startedAt: x.startedAt,
        assignee: x.assigneeUserId ? people.get(x.assigneeUserId) ?? null : null, mine: !x.assigneeUserId || x.assigneeUserId === me.id }; }),
    };
  }

  @RequirePermission('checklists.execute')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const audiences = (await this.audiences.newsOptions(ctx)).map((o) => ({ key: o.key, label: o.label, wide: o.wide }));
    return { kinds: KINDS, responseTypes: RTYPES, audiences };
  }

  /** Vorlage anlegen oder ändern (neue Version: alte Punkte bleiben für laufende Listen erhalten). */
  private async save(me: SessionUser, b: z.infer<typeof Template>, existing?: TemplateFull) {
    const ctx = await this.policy.loadContext(me.id);
    if (b.assignees.length) await this.audiences.assertHandoverTargets(ctx, toTargets(b.assignees));
    const firstGroup = b.assignees.find((k) => k.startsWith('G:'))?.slice(2) ?? ctx.groupIds.find((g) => !ctx.groupParent.get(g)) ?? null;
    const group = firstGroup ? await this.prisma.db.group.findUnique({ where: { id: firstGroup } }) : null;
    const rule = b.repeat !== 'NONE' ? toRule(b.repeat, b.time) : null;
    const data = {
      title: b.title, description: b.description || null, kind: b.kind, visibility: b.visibility, completionMode: b.completionMode, assignees: b.assignees,
      dueInHours: b.dueInHours ?? null, requiresApproval: b.requiresApproval, groupId: group?.id ?? null,
      recurrenceRule: rule, nextRunAt: rule ? nextOccurrence(rule, new Date()) : null,
    };
    const db = this.prisma.db;
    const t = existing
      ? await db.checklist.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } })
      : await db.checklist.create({ data: { ...data, ownerId: me.id, companyId: group?.companyId ?? await primaryCompany(this.prisma, me.id) } });
    if (existing) await db.checklistItem.updateMany({ where: { checklistId: t.id }, data: { isActive: false } });
    const ids = new Map<string, string>();
    for (const [n, i] of b.items.entries()) {
      const flagged = i.type === 'YES_NO' ? (i.flagged.length ? i.flagged : ['Nein']) : i.type === 'CHOICE' ? i.flagged.filter((f) => i.options.includes(f)) : [];
      const created = await db.checklistItem.create({ data: {
        checklistId: t.id, title: i.title, description: i.description || null, responseType: i.type, isRequired: i.type !== 'HEADING' && i.required, sortOrder: n,
        options: i.type === 'CHOICE' ? i.options : [], flagged, requireNote: i.requireNote, requirePhoto: i.requirePhoto, createTask: i.createTask && (flagged.length > 0 || i.type === 'NUMBER' || i.type === 'TEMPERATURE'),
        minValue: i.min ?? null, maxValue: i.max ?? null, unit: i.unit || null,
      } });
      ids.set(i.key, created.id);
    }
    for (const i of b.items) {
      if (i.showIf && ids.has(i.showIf.key) && b.items.findIndex((x) => x.key === i.showIf!.key) < b.items.indexOf(i)) {
        await db.checklistItem.update({ where: { id: ids.get(i.key)! }, data: { showIfItemId: ids.get(i.showIf.key)!, showIfValue: i.showIf.value } });
      }
    }
    const full = await db.checklist.findUniqueOrThrow({ where: { id: t.id }, include: { items: true } });
    const runs = b.startNow ? await createRuns(this.deps, full, me.id) : [];
    return { id: t.id, runId: runs[0] ?? null, runs: runs.length };
  }

  @RequirePermission('checklists.execute')
  @Post('templates')
  create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Template)) b: z.infer<typeof Template>) {
    return this.save(me, b);
  }

  @RequirePermission('checklists.execute')
  @Get('templates/:id')
  async template(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const ctx = await this.policy.loadContext(me.id);
    const t = await this.prisma.db.checklist.findFirst({ where: { id, ...this.visibleTemplates(ctx) }, include: { items: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } } });
    if (!t) throw new NotFoundException('Diese Vorlage gibt es nicht oder sie ist nicht für dich.');
    const rule = t.recurrenceRule ?? '';
    return {
      id: t.id, title: t.title, description: t.description, kind: t.kind, visibility: t.visibility, completionMode: t.completionMode, assignees: t.assignees,
      assigneeLabels: await this.labels(t.assignees), dueInHours: t.dueInHours, requiresApproval: t.requiresApproval, version: t.version, canEdit: this.mayEdit(ctx, t),
      repeat: rule.includes('DAILY') ? 'DAILY' : rule.includes('WEEKLY') ? 'WEEKDAYS' : 'NONE', time: /BYHOUR=(\d+);BYMINUTE=(\d+)/.exec(rule)?.slice(1).map((x) => x.padStart(2, '0')).join(':') ?? '06:00',
      items: t.items.map((i) => ({ key: i.id, title: i.title, type: i.responseType, description: i.description, required: i.isRequired, options: i.options, flagged: i.flagged,
        requireNote: i.requireNote, requirePhoto: i.requirePhoto, createTask: i.createTask, min: i.minValue != null ? Number(i.minValue) : null, max: i.maxValue != null ? Number(i.maxValue) : null,
        unit: i.unit, showIf: i.showIfItemId ? { key: i.showIfItemId, value: i.showIfValue ?? '' } : null })),
    };
  }

  @RequirePermission('checklists.execute')
  @Put('templates/:id')
  async update(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Template)) b: z.infer<typeof Template>) {
    const t = await this.prisma.db.checklist.findFirst({ where: { id, isActive: true }, include: { items: true } });
    if (!t) throw new NotFoundException();
    if (!this.mayEdit(await this.policy.loadContext(me.id), t)) throw new ForbiddenException('Ändern dürfen Ersteller:in und Leitungen.');
    return this.save(me, b, t);
  }

  @RequirePermission('checklists.execute')
  @Delete('templates/:id')
  async remove(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.db.checklist.findFirst({ where: { id, isActive: true } });
    if (!t) throw new NotFoundException();
    if (!this.mayEdit(await this.policy.loadContext(me.id), t)) throw new ForbiddenException('Löschen dürfen Ersteller:in und Leitungen.');
    await this.prisma.db.checklist.update({ where: { id }, data: { isActive: false, nextRunAt: null } });
    return { ok: true };
  }

  /** Starten: für sich selbst oder für andere (Personen/Gruppen) – mit optionaler Fälligkeit. */
  @RequirePermission('checklists.execute')
  @Post(':templateId/start')
  async start(@CurrentUser() me: SessionUser, @Param('templateId', ParseUUIDPipe) templateId: string, @Body(new ZodPipe(Start.optional())) b?: z.infer<typeof Start>) {
    b = b ?? {};
    const ctx = await this.policy.loadContext(me.id);
    const t = await this.prisma.db.checklist.findFirst({ where: { id: templateId, ...this.visibleTemplates(ctx) }, include: { items: true } });
    if (!t) throw new NotFoundException('Diese Checkliste gibt es nicht oder sie ist nicht für dich.');
    if (b.assignees?.length) await this.audiences.assertHandoverTargets(ctx, toTargets(b.assignees));
    // Ohne Auswahl: an die Empfänger:innen der Vorlage, wenn man selbst dazugehört (z. B. das eigene Team) – sonst nur an sich selbst
    const inTemplate = t.assignees.some((k) => k === `U:${me.id}` || ctx.groupIds.some((g) => k === `G:${g}`));
    const keys = b.assignees?.length ? b.assignees : inTemplate || this.mayEdit(ctx, t) ? t.assignees : [];
    const runs = await createRuns(this.deps, t, me.id, keys, b.dueAt ? new Date(b.dueAt) : undefined);
    return { id: runs[0], runs: runs.length };
  }

  private async loadRun(userId: string, id: string) {
    await this.content.getVisible(userId, id);
    return this.prisma.db.checklistRun.findUniqueOrThrow({ where: { id }, include: {
      checklist: { select: { id: true, kind: true, groupId: true, companyId: true, requiresApproval: true, ownerId: true, completionMode: true } }, completedBy: { select: { displayName: true } }, approvedBy: { select: { displayName: true } },
      contentItem: { select: { authorId: true } },
      items: { orderBy: { sortOrder: 'asc' }, include: { checklistItem: true, completedBy: { select: { displayName: true } } } },
    } });
  }

  /** Sichtbare Punkte: bedingte Punkte nur, wenn die Bedingung erfüllt ist. */
  private visible(r: Awaited<ReturnType<ChecklistsController['loadRun']>>) {
    const byTemplate = new Map(r.items.map((i) => [i.checklistItemId, i]));
    return r.items.filter((i) => {
      const c = i.checklistItem;
      if (!c?.showIfItemId) return true;
      const dep = byTemplate.get(c.showIfItemId);
      return !!dep && (dep.valueText === c.showIfValue || (c.showIfValue === 'erledigt' && dep.isDone));
    });
  }

  @RequirePermission('checklists.execute')
  @Get('runs/:id')
  async run(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.loadRun(me.id, id);
    const ctx = await this.policy.loadContext(me.id);
    const assignee = r.assigneeUserId ? await this.prisma.db.user.findUnique({ where: { id: r.assigneeUserId }, select: { displayName: true } }) : null;
    const shown = new Set(this.visible(r).map((i) => i.id));
    return {
      id, title: r.title, status: r.status, kind: r.checklist.kind, completedAt: r.completedAt, completedBy: r.completedBy?.displayName ?? null, dueAt: r.dueAt, startedAt: r.startedAt,
      approval: r.approvalStatus, approvedBy: r.approvedBy?.displayName ?? null, approvedAt: r.approvedAt, mode: r.checklist.completionMode, assignee: assignee?.displayName ?? null,
      canEdit: !r.assigneeUserId || r.assigneeUserId === me.id, templateId: r.checklist.id,
      canApprove: r.approvalStatus === 'PENDING' && r.completedById !== me.id && can(ctx, 'checklists.approve', { groupId: r.checklist.groupId, companyId: r.checklist.companyId }),
      items: r.items.map((i) => { const c = i.checklistItem; return {
        id: i.id, title: i.titleSnapshot, type: c?.responseType ?? 'CHECK', description: c?.description ?? null, required: c?.isRequired ?? true, options: c?.options ?? [], flagged: c?.flagged ?? [],
        requireNote: c?.requireNote ?? false, requirePhoto: c?.requirePhoto ?? false, createTask: c?.createTask ?? false, visible: shown.has(i.id),
        min: c?.minValue != null ? Number(c.minValue) : null, max: c?.maxValue != null ? Number(c.maxValue) : null, unit: c?.unit ?? null,
        done: i.isDone, value: i.valueNumber != null ? String(i.valueNumber) : i.valueText, outOfRange: i.isOutOfRange, note: i.note, photoFileId: i.photoFileId,
        by: i.completedBy?.displayName ?? null, at: i.completedAt,
      }; }),
    };
  }

  @RequirePermission('checklists.execute')
  @Patch('runs/:id/items/:itemId')
  async tick(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(ItemUpdate)) b: z.infer<typeof ItemUpdate>) {
    const r = await this.loadRun(me.id, id);
    if (r.status === 'COMPLETED' || r.status === 'CANCELLED') throw new BadRequestException('Diese Checkliste ist schon abgeschlossen.');
    if (r.assigneeUserId && r.assigneeUserId !== me.id) throw new ForbiddenException('Diese Liste füllt die zugewiesene Person selbst aus.');
    const it = r.items.find((i) => i.id === itemId);
    if (!it) throw new NotFoundException();
    const c = it.checklistItem;
    const type = c?.responseType ?? 'CHECK';
    if (type === 'HEADING') throw new BadRequestException('Überschriften kann man nicht abhaken.');
    const data: Record<string, unknown> = {};
    if (b.note !== undefined) data.note = b.note || null;
    if (b.photoFileId !== undefined) {
      if (b.photoFileId) {
        const f = await this.prisma.db.fileObject.findFirst({ where: { id: b.photoFileId, uploadedById: me.id, mimeType: { startsWith: 'image/' } } });
        if (!f) throw new BadRequestException('Foto fehlt.');
      }
      data.photoFileId = b.photoFileId || null;
      if (type === 'PHOTO' || type === 'SIGNATURE') data.isDone = !!b.photoFileId;
    }
    if (b.value !== undefined && b.value !== null && b.value !== '') {
      if (type === 'NUMBER' || type === 'TEMPERATURE') {
        const n = Number(b.value.replace(',', '.'));
        if (!Number.isFinite(n)) throw new BadRequestException('Bitte eine Zahl eintragen.');
        const min = c?.minValue, max = c?.maxValue;
        Object.assign(data, { valueNumber: n, isOutOfRange: (min != null && n < Number(min)) || (max != null && n > Number(max)), isDone: true });
      } else if (type === 'YES_NO' || type === 'CHOICE') {
        const allowed = type === 'YES_NO' ? ['Ja', 'Nein', 'n. a.'] : c?.options ?? [];
        if (!allowed.includes(b.value)) throw new BadRequestException('Diese Antwort gibt es hier nicht.');
        Object.assign(data, { valueText: b.value, isDone: true, isOutOfRange: isFlagged(c?.flagged ?? [], b.value) });
      } else if (type === 'TEXT') Object.assign(data, { valueText: b.value, isDone: true });
    }
    if (b.done !== undefined && type === 'CHECK') data.isDone = b.done;
    if (b.done === false) Object.assign(data, { isDone: false, valueNumber: null, valueText: null, isOutOfRange: null, ...(type === 'PHOTO' || type === 'SIGNATURE' ? { photoFileId: null } : {}) });
    const done = (data.isDone ?? it.isDone) as boolean;
    await this.prisma.db.$transaction([
      this.prisma.db.checklistRunItem.update({ where: { id: itemId }, data: { ...data, completedById: done ? me.id : null, completedAt: done ? it.completedAt ?? new Date() : null } }),
      this.prisma.db.checklistRun.updateMany({ where: { id, status: { in: ['PLANNED', 'OVERDUE'] } }, data: { status: 'IN_PROGRESS', startedAt: r.startedAt ?? new Date() } }),
    ]);
    return this.run(me, id);
  }

  @RequirePermission('checklists.execute')
  @Post('runs/:id/complete')
  @HttpCode(200)
  async complete(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.loadRun(me.id, id);
    if (r.status === 'COMPLETED') return { ok: true };
    if (r.status === 'CANCELLED') throw new BadRequestException('Diese Checkliste wurde abgebrochen.');
    if (r.assigneeUserId && r.assigneeUserId !== me.id) throw new ForbiddenException('Diese Liste füllt die zugewiesene Person selbst aus.');
    const items = this.visible(r).filter((i) => i.checklistItem?.responseType !== 'HEADING');
    const problems = items.flatMap((i) => {
      const c = i.checklistItem;
      if ((c?.isRequired ?? true) && !i.isDone) return [`${i.titleSnapshot}`];
      if (i.isDone && c?.requireNote && !i.note) return [`${i.titleSnapshot} (Text fehlt)`];
      if (i.isDone && c?.requirePhoto && !i.photoFileId) return [`${i.titleSnapshot} (Foto fehlt)`];
      return [];
    });
    if (problems.length) throw new BadRequestException(`Noch offen: ${problems.slice(0, 3).join(', ')}${problems.length > 3 ? ' …' : ''}`);
    const deviations = items.filter((i) => i.isOutOfRange);
    if (deviations.some((i) => !i.note)) throw new BadRequestException('Bitte trag bei jeder kritischen Antwort ein, was los ist bzw. was du unternommen hast.');
    const approval = r.checklist.requiresApproval ? 'PENDING' as const : 'NOT_REQUIRED' as const;
    await this.prisma.db.checklistRun.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date(), completedById: me.id, approvalStatus: approval } });
    const db = this.prisma.db;
    const leads = r.checklist.groupId ? (await db.groupMembership.findMany({ where: { groupId: r.checklist.groupId, isLead: true, userId: { not: me.id } }, select: { userId: true } })).map((l) => l.userId) : [];
    // Wer die Liste angelegt bzw. vergeben hat, erfährt von Abweichungen ebenfalls
    const watchers = [...new Set([...leads, ...[r.checklist.ownerId, r.contentItem.authorId].filter((x): x is string => !!x && x !== me.id)])];
    if (approval === 'PENDING') {
      await this.notifications.notify({ recipientIds: leads, actorId: me.id, eventType: 'checklist.approval', title: `Bitte freigeben: ${r.title}`, body: deviations.length ? `${deviations.length} kritische Antwort(en)` : 'ohne Abweichungen', linkPath: `/checklisten/${id}`, contentItemId: id, dedupeKey: `approve:${id}:${Date.now()}` });
    }
    if (deviations.length) {
      await this.notifications.notify({ recipientIds: watchers, actorId: me.id, eventType: 'checklist.deviation', importance: 'IMPORTANT',
        title: `Abweichung: ${r.title}`, body: deviations.map((d) => `${d.titleSnapshot}: ${d.valueNumber ?? d.valueText ?? ''} – ${d.note}`).join(' · ').slice(0, 300), linkPath: `/checklisten/${id}`, contentItemId: id });
      // Folgeaufgaben für kritische Punkte mit „Aufgabe anlegen“ – an das Team (sonst an die Person, die die Liste vergeben hat)
      const target = r.checklist.groupId ? { type: 'GROUP' as const, groupId: r.checklist.groupId } : { type: 'USER' as const, userId: r.checklist.ownerId ?? me.id };
      for (const d of deviations.filter((x) => x.checklistItem?.createTask)) {
        const title = `${d.titleSnapshot}: ${d.valueNumber ?? d.valueText ?? ''}`.slice(0, 140);
        const { item, recipientIds } = await this.content.create({ type: 'TASK', companyId: r.checklist.companyId, authorId: me.id, reactionsEnabled: false, targets: [target],
          createSubtype: (tx, tid) => tx.task.create({ data: { id: tid, title, description: `Aus Checkliste „${r.title}“: ${d.note ?? ''}`, priority: 'HIGH', groupId: target.type === 'GROUP' ? target.groupId : null,
            assignees: { create: { userId: target.type === 'USER' ? target.userId : null, groupId: target.type === 'GROUP' ? target.groupId : null, isResponsible: true } } } }) });
        await this.notifications.notify({ recipientIds, actorId: me.id, eventType: 'task.assigned', title: `Neue Aufgabe: ${title}`, body: `aus „${r.title}“`, linkPath: `/aufgaben/${item.id}`, contentItemId: item.id });
      }
    }
    return { ok: true, deviations: deviations.length };
  }

  @RequirePermission('checklists.approve')
  @Post('runs/:id/approve')
  @HttpCode(200)
  async approve(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Approve)) b: z.infer<typeof Approve>) {
    const r = await this.loadRun(me.id, id);
    if (r.approvalStatus !== 'PENDING') throw new BadRequestException('Hier ist keine Freigabe offen.');
    if (r.completedById === me.id) throw new ForbiddenException('Vier-Augen-Prinzip: Eigene Checklisten gibt jemand anderes frei.');
    if (!can(await this.policy.loadContext(me.id), 'checklists.approve', { groupId: r.checklist.groupId, companyId: r.checklist.companyId })) throw new ForbiddenException('Freigeben darf die Leitung dieses Teams.');
    await this.prisma.db.checklistRun.update({ where: { id }, data: b.approve
      ? { approvalStatus: 'APPROVED', approvedById: me.id, approvedAt: new Date() }
      : { approvalStatus: 'NOT_REQUIRED', status: 'IN_PROGRESS', completedAt: null } });
    if (r.completedById) {
      await this.notifications.notify({ recipientIds: [r.completedById], actorId: me.id, eventType: 'checklist.approved', title: b.approve ? `Freigegeben: ${r.title}` : `Bitte nacharbeiten: ${r.title}`, body: b.note ?? '', linkPath: `/checklisten/${id}`, contentItemId: id, dedupeKey: `approved:${id}:${Date.now()}` });
    }
    return this.run(me, id);
  }
}
