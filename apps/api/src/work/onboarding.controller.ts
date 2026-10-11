import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can, PolicyContext } from '../policy/engine';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { linkFor } from '../content/content.controller';

const Template = z.object({
  name: z.string().trim().min(3).max(120), kind: z.enum(['ONBOARDING', 'OFFBOARDING']), description: z.string().trim().max(500).nullish(),
  steps: z.array(z.object({ title: z.string().trim().min(2).max(160), offsetDays: z.number().int().min(-90).max(365), responsible: z.enum(['SUBJECT_EMPLOYEE', 'LINE_MANAGER']), linkedContentId: z.uuid().nullish() })).min(1).max(40),
});
const Start = z.object({ templateId: z.uuid(), userId: z.uuid(), referenceDate: z.iso.date() });

/**
 * Ein- und Austritt (ADR-026/043): Vorlage → Plan für eine Person. Jeder Schritt wird eine Aufgabe
 * für die Person selbst oder ihre Leitung; verlinkte Artikel/Dokumente werden der Person freigegeben.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  /** Sichtbar: eigene Pläne, selbst gestartete und – mit Recht – alle der eigenen Gesellschaften. */
  private where(ctx: PolicyContext, me: string) {
    return { OR: [{ employeeProfile: { userId: me } }, { startedById: me }, ...(can(ctx, 'lifecycle.view_progress') ? [{ employeeProfile: { companyId: { in: ctx.companyIds } } }] : [])] };
  }

  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const rows = await this.prisma.db.lifecycleInstance.findMany({ where: this.where(ctx, me.id), orderBy: { referenceDate: 'desc' }, take: 100,
      include: { template: { select: { name: true } }, employeeProfile: { include: { user: { select: { displayName: true } } } }, tasks: { select: { status: true } } } });
    return {
      canStart: can(ctx, 'lifecycle.start'), canManage: can(ctx, 'lifecycle.manage_templates'),
      plans: rows.map((r) => ({ id: r.id, kind: r.kind, template: r.template.name, person: r.employeeProfile.user.displayName, mine: r.employeeProfile.userId === me.id,
        referenceDate: r.referenceDate, status: r.status, done: r.tasks.filter((t) => t.status === 'DONE').length, total: r.tasks.length })),
    };
  }

  @RequirePermission('lifecycle.start')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const db = this.prisma.db;
    const [templates, people, articles] = await Promise.all([
      db.lifecycleTemplate.findMany({ where: { isActive: true, OR: [{ companyId: null }, { companyId: { in: ctx.companyIds } }] }, include: { _count: { select: { steps: true } } }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] }),
      db.user.findMany({ where: { status: { in: ['ACTIVE', 'INVITED', 'PROVISIONED'] }, employeeProfile: { companyId: { in: ctx.companyIds } } }, select: { id: true, displayName: true, status: true, employeeProfile: { select: { jobTitle: true } } }, orderBy: { displayName: 'asc' } }),
      db.contentItem.findMany({ where: { type: { in: ['KNOWLEDGE_ARTICLE', 'DOCUMENT'] }, ...this.content.visibleWhere(me.id) }, include: { knowledgeArticle: { include: { versions: { where: { status: 'PUBLISHED' }, select: { title: true } } } }, document: { select: { title: true } } } }),
    ]);
    return {
      templates: templates.map((t) => ({ id: t.id, name: t.name, kind: t.kind, steps: t._count.steps })),
      people: people.map((p) => ({ id: p.id, name: p.displayName, job: p.employeeProfile?.jobTitle ?? null, new: p.status !== 'ACTIVE' })),
      content: articles.map((a) => ({ id: a.id, title: a.knowledgeArticle?.versions[0]?.title ?? a.document?.title ?? '–', type: a.type })),
    };
  }

  @RequirePermission('lifecycle.manage_templates')
  @Post('templates')
  async createTemplate(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Template)) b: z.infer<typeof Template>) {
    const ctx = await this.policy.loadContext(me.id);
    const t = await this.prisma.db.lifecycleTemplate.create({ data: { name: b.name, kind: b.kind, description: b.description || null, companyId: ctx.companyIds[0] ?? null,
      steps: { create: b.steps.map((s, i) => ({ title: s.title, offsetDays: s.offsetDays, responsibleType: s.responsible, linkedContentId: s.linkedContentId ?? null, requiresAcknowledgement: !!s.linkedContentId, sortOrder: i })) } } });
    return { id: t.id };
  }

  @RequirePermission('lifecycle.start')
  @Post()
  async start(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Start)) b: z.infer<typeof Start>) {
    const ctx = await this.policy.loadContext(me.id);
    const db = this.prisma.db;
    const t = await db.lifecycleTemplate.findFirst({ where: { id: b.templateId, isActive: true }, include: { steps: { orderBy: { sortOrder: 'asc' } } } });
    const person = await db.user.findUnique({ where: { id: b.userId }, include: { employeeProfile: true, groupMemberships: true } });
    if (!t || !person?.employeeProfile) throw new BadRequestException('Vorlage oder Person fehlt.');
    if (!can(ctx, 'lifecycle.start', { companyId: person.employeeProfile.companyId })) throw new ForbiddenException('Für diese Person darfst du keinen Plan starten.');
    // Leitung = Teamleitungen der Person, sonst wer startet
    const leads = (await db.groupMembership.findMany({ where: { groupId: { in: person.groupMemberships.map((m) => m.groupId) }, isLead: true, userId: { not: person.id } }, select: { userId: true } })).map((l) => l.userId);
    const managers = leads.length ? leads : [me.id];
    const ref = new Date(`${b.referenceDate}T00:00:00Z`);
    const inst = await db.lifecycleInstance.create({ data: { templateId: t.id, kind: t.kind, employeeProfileId: person.employeeProfile.id, referenceDate: ref, startedById: me.id } });
    const who = person.displayName;
    for (const s of t.steps) {
      const assignees = s.responsibleType === 'SUBJECT_EMPLOYEE' ? [person.id] : managers;
      const due = new Date(ref.getTime() + s.offsetDays * 864e5 + 15 * 3600_000); // 17 Uhr Ortszeit (ungefähr)
      let description = t.kind === 'ONBOARDING' ? `Einarbeitung von ${who}` : `Austritt von ${who}`;
      if (s.linkedContentId) {
        // Pflichtlektüre: Person bekommt Zugriff auf den verlinkten Inhalt
        const linked = await db.contentItem.findUnique({ where: { id: s.linkedContentId }, include: { post: { select: { kind: true } } } });
        if (linked) {
          await db.contentRecipient.upsert({ where: { contentItemId_userId: { contentItemId: linked.id, userId: person.id } }, create: { contentItemId: linked.id, userId: person.id, reason: 'MANUAL' }, update: { removedAt: null } });
          description += `\n\nBitte lesen: ${linkFor(linked)}`;
        }
      }
      await this.content.create({
        type: 'TASK', companyId: person.employeeProfile.companyId, authorId: me.id, reactionsEnabled: false,
        targets: assignees.map((userId) => ({ type: 'USER' as const, userId })),
        createSubtype: (tx, id) => tx.task.create({ data: { id, title: s.title, description, dueAt: due, lifecycleInstanceId: inst.id, lifecycleTemplateStepId: s.id,
          assignees: { create: assignees.map((userId, i) => ({ userId, isResponsible: i === 0 })) } } }),
      });
    }
    await this.notifications.notify({ recipientIds: [person.id], actorId: me.id, eventType: 'lifecycle.started', title: t.kind === 'ONBOARDING' ? 'Willkommen! Dein Einarbeitungsplan ist da.' : 'Dein Plan für den Austritt',
      body: `${t.steps.filter((s) => s.responsibleType === 'SUBJECT_EMPLOYEE').length} Schritte für dich`, linkPath: `/einarbeitung/${inst.id}`, dedupeKey: `lifecycle:${inst.id}` });
    await this.notifications.notify({ recipientIds: managers, actorId: me.id, eventType: 'lifecycle.started', title: `${t.kind === 'ONBOARDING' ? 'Einarbeitung' : 'Austritt'}: ${who}`, body: t.name, linkPath: `/einarbeitung/${inst.id}`, dedupeKey: `lifecycle:${inst.id}` });
    return { id: inst.id };
  }

  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const ctx = await this.policy.loadContext(me.id);
    const r = await this.prisma.db.lifecycleInstance.findFirst({ where: { id, ...this.where(ctx, me.id) }, include: {
      template: true, employeeProfile: { include: { user: { select: { displayName: true } } } }, startedBy: { select: { displayName: true } },
      tasks: { orderBy: { dueAt: 'asc' }, include: { assignees: { include: { user: { select: { id: true, displayName: true } } } }, lifecycleTemplateStep: { select: { responsibleType: true } } } },
    } });
    if (!r) throw new NotFoundException('Diesen Plan gibt es nicht oder er ist nicht für dich.');
    return {
      id, kind: r.kind, template: r.template.name, person: r.employeeProfile.user.displayName, referenceDate: r.referenceDate, startedBy: r.startedBy?.displayName ?? null, status: r.status,
      steps: r.tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt, status: t.status, forPerson: t.lifecycleTemplateStep?.responsibleType === 'SUBJECT_EMPLOYEE',
        assignee: t.assignees.map((a) => a.user?.displayName).join(', '), mine: t.assignees.some((a) => a.user?.id === me.id) })),
    };
  }
}
