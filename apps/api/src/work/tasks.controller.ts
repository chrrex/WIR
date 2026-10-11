import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Prisma } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can, PolicyContext } from '../policy/engine';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { primaryCompany } from './common';

const STATUS = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const;
const Create = z.object({
  title: z.string().trim().min(3).max(160), description: z.string().trim().max(4000).nullish(), dueAt: z.iso.datetime({ offset: true }).nullish(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'), userId: z.uuid().nullish(), groupId: z.uuid().nullish(),
}).refine((b) => !!b.userId !== !!b.groupId, 'Bitte genau eine Person oder ein Team wählen.');

/** Aufgaben für Personen oder Teams. Sichtbar für Zugewiesene und Ersteller:in. */
@Controller('tasks')
export class TasksController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  private include = { task: { include: { assignees: { include: { user: { select: { displayName: true } }, group: { select: { name: true } } } } } }, author: { select: { displayName: true } } } satisfies Prisma.ContentItemInclude;

  private mayChange(ctx: PolicyContext, me: string, i: { authorId: string | null; companyId: string | null; task: { assignees: Array<{ userId: string | null; groupId: string | null }> } | null }) {
    return i.authorId === me || i.task!.assignees.some((a) => a.userId === me || (a.groupId && ctx.groupIds.includes(a.groupId))) || can(ctx, 'tasks.update_any', { companyId: i.companyId });
  }

  private row(i: Prisma.ContentItemGetPayload<{ include: TasksController['include'] }>) {
    const t = i.task!;
    return { id: i.id, title: t.title, description: t.description, status: t.status, priority: t.priority, dueAt: t.dueAt, completedAt: t.completedAt,
      assignee: t.assignees.map((a) => a.user?.displayName ?? a.group?.name).join(', '), author: i.author?.displayName ?? '–', authorId: i.authorId };
  }

  @RequirePermission('tasks.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('view') view = 'mine') {
    const ctx = await this.policy.loadContext(me.id);
    const filter: Prisma.ContentItemWhereInput = view === 'created' ? { authorId: me.id }
      : { task: { assignees: { some: { OR: [{ userId: me.id }, { groupId: { in: ctx.groupIds } }] } } } };
    const done = view === 'done';
    const items = await this.prisma.db.contentItem.findMany({
      where: { type: 'TASK', ...this.content.visibleWhere(me.id), ...filter, task: { ...(filter.task as object), status: done ? { in: ['DONE', 'CANCELLED'] } : { notIn: ['DONE', 'CANCELLED'] } } },
      include: this.include, orderBy: [{ task: { dueAt: { sort: 'asc', nulls: 'last' } } }, { publishedAt: 'desc' }], take: 100,
    });
    return { canCreate: can(ctx, 'tasks.create'), tasks: items.map((i) => this.row(i)) };
  }

  @RequirePermission('tasks.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return { groups: groups.filter((g) => can(ctx, 'tasks.assign', { groupId: g.id, companyId: g.companyId })).map((g) => ({ id: g.id, name: g.name })) };
  }

  @RequirePermission('tasks.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.content.getVisible(me.id, id);
    const i = await this.prisma.db.contentItem.findUniqueOrThrow({ where: { id }, include: this.include });
    return { ...this.row(i), canChange: this.mayChange(await this.policy.loadContext(me.id), me.id, i) };
  }

  @RequirePermission('tasks.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const ctx = await this.policy.loadContext(me.id);
    const db = this.prisma.db;
    if (b.groupId) {
      const g = await db.group.findUnique({ where: { id: b.groupId } });
      if (!g || !can(ctx, 'tasks.assign', { groupId: g.id, companyId: g.companyId })) throw new ForbiddenException('Diesem Team darfst du keine Aufgaben geben.');
    } else if (b.userId !== me.id) {
      const u = await db.user.findFirst({ where: { id: b.userId!, status: 'ACTIVE' } });
      if (!u) throw new BadRequestException('Diese Person gibt es nicht.');
      if (!can(ctx, 'tasks.assign')) throw new ForbiddenException('Aufgaben an andere vergeben Teamleitungen.');
    }
    const { item, recipientIds } = await this.content.create({
      type: 'TASK', companyId: await primaryCompany(this.prisma, me.id), authorId: me.id, reactionsEnabled: false,
      targets: [b.groupId ? { type: 'GROUP', groupId: b.groupId } : { type: 'USER', userId: b.userId! }],
      createSubtype: (tx, id) => tx.task.create({ data: { id, title: b.title, description: b.description || null, priority: b.priority, dueAt: b.dueAt ? new Date(b.dueAt) : null,
        groupId: b.groupId ?? null, assignees: { create: { userId: b.userId ?? null, groupId: b.groupId ?? null, isResponsible: true } } } }),
    });
    await this.notifications.notify({ recipientIds, actorId: me.id, eventType: 'task.assigned', importance: b.priority === 'URGENT' ? 'IMPORTANT' : 'NORMAL',
      title: `Neue Aufgabe: ${b.title}`, body: b.dueAt ? `Fällig ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(b.dueAt))}` : '',
      linkPath: `/aufgaben/${item.id}`, contentItemId: item.id });
    return { id: item.id };
  }

  @RequirePermission('tasks.read')
  @Patch(':id')
  async setStatus(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ status: z.enum(STATUS) }))) b: { status: (typeof STATUS)[number] }) {
    await this.content.getVisible(me.id, id);
    const i = await this.prisma.db.contentItem.findUniqueOrThrow({ where: { id }, include: this.include });
    if (!this.mayChange(await this.policy.loadContext(me.id), me.id, i)) throw new ForbiddenException('Diese Aufgabe kannst du nicht ändern.');
    if (b.status === 'CANCELLED' && i.authorId !== me.id) throw new ForbiddenException('Abbrechen kann nur, wer die Aufgabe vergeben hat.');
    const task = await this.prisma.db.task.update({ where: { id }, data: { status: b.status, completedAt: b.status === 'DONE' ? new Date() : null } });
    // Ein-/Austrittsplan: fertig, wenn alle Schritte erledigt sind
    if (task.lifecycleInstanceId) {
      const open = await this.prisma.db.task.count({ where: { lifecycleInstanceId: task.lifecycleInstanceId, status: { notIn: ['DONE', 'CANCELLED'] } } });
      await this.prisma.db.lifecycleInstance.update({ where: { id: task.lifecycleInstanceId }, data: open ? { status: 'ACTIVE', completedAt: null } : { status: 'COMPLETED', completedAt: new Date() } });
    }
    if (b.status === 'DONE' && i.authorId && i.authorId !== me.id) {
      const name = (await this.prisma.db.user.findUnique({ where: { id: me.id } }))?.displayName ?? 'Jemand';
      await this.notifications.notify({ recipientIds: [i.authorId], actorId: me.id, eventType: 'task.done', title: `Erledigt: ${i.task!.title}`, body: `von ${name}`, linkPath: `/aufgaben/${id}`, contentItemId: id });
    }
    return { id, status: b.status };
  }
}
