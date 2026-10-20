import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Prisma } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { primaryCompany } from './common';
import { describeRule } from './recurrence';
import { IDEA_LIKES, LINK_INCLUDE, MeetingsService, TEMPLATE, dayOf, icsFor, outlookCompose, when } from './meetings.service';

/** Adresse des WIR für Links in Kalendereinträgen (PUBLIC_URL, sonst die aufrufende Seite). */
const baseUrl = (req: Request) => process.env.PUBLIC_URL ?? (req.headers.origin as string | undefined) ?? (req.headers.referer ? new URL(req.headers.referer).origin : 'https://wir.example');

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const Guest = z.object({ name: text(120).min(2), org: text(120).nullish(), email: z.email().max(200).nullish().or(z.literal('')) });
const Create = z.object({
  title: text(120).min(3), startsAt: z.iso.datetime({ offset: true }), durationMin: z.number().int().min(10).max(480).default(60),
  location: text(120).nullish(), onlineUrl: z.url().max(500).nullish().or(z.literal('')), groupId: uuid.nullish(), userIds: z.array(uuid).max(80).default([]),
  guests: z.array(Guest).max(20).default([]), repeat: z.enum(['NONE', 'WEEKLY']).default('NONE'), standardItems: z.array(text(80).min(2)).max(12).default([]),
  minutesId: uuid.nullish(), timekeeperId: uuid.nullish(), retentionYears: z.number().int().min(1).max(10).default(3), agendaLeadHours: z.number().int().min(0).max(168).default(26),
});
const ItemInput = z.object({
  title: text(160).min(3), description: text(4000).nullish(), ownerId: uuid.nullish(), durationMin: z.number().int().min(1).max(240).default(10),
  confidential: z.boolean().default(false), viewerIds: z.array(uuid).max(40).default([]), sourcePath: z.string().regex(/^\/(news|uebergaben|ideen|aufgaben|checklisten|chat)\/[0-9a-f-]{36}(#[\w-]+)?$/).nullish(),
});
const ItemPatch = ItemInput.partial().extend({
  notes: text(10000).nullish(), status: z.enum(['PROPOSED', 'SET', 'DONE', 'POSTPONED', 'PARKED']).optional(),
  followUpOn: z.iso.date().nullish(), photoFileIds: z.array(uuid).max(6).optional(),
});
const Task = z.object({ title: text(160).min(3), description: text(4000).nullish(), userId: uuid, dueAt: z.iso.datetime({ offset: true }).nullish(), decisionId: uuid.nullish() });
const Link = z.object({ contentItemId: uuid.nullish(), checklistId: uuid.nullish(), decisionId: uuid.nullish() }).refine((b) => !!b.contentItemId !== !!b.checklistId);
const Attendee = z.union([z.object({ userId: uuid }), Guest]);
const AttendeePatch = z.object({ status: z.enum(['INVITED', 'PRESENT', 'ONLINE', 'EXCUSED', 'ABSENT']).optional(), role: z.enum(['LEAD', 'MINUTES', 'TIMEKEEPER']).nullish() });
const State = z.object({ action: z.enum(['set-agenda', 'start', 'submit', 'reopen', 'lock', 'cancel']), note: text(300).nullish() });
const SeriesPatch = z.object({ isActive: z.boolean().optional(), retentionYears: z.number().int().min(1).max(10).optional(), standardItems: z.array(text(80).min(2)).max(12).optional() });
const KIND = { TASK: 'TASK', KNOWLEDGE_ARTICLE: 'KNOWLEDGE', POST: 'NEWS', HANDOVER: 'HANDOVER' } as const;

/** Meetings: Agenda sammeln, live protokollieren, festschreiben, archivieren (ADR-061). */
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly prisma: PrismaService, private readonly svc: MeetingsService, private readonly content: ContentService, private readonly policy: PolicyService, private readonly notifications: NotificationService) {}

  // ---------------------------------------------------------------- Übersicht, Archiv, Entscheidungen

  @RequirePermission('meetings.read')
  @Get()
  async list(@CurrentUser() me: SessionUser, @Query('view') view = 'upcoming', @Query('series') series?: string, @Query('q') q?: string) {
    const db = this.prisma.db;
    const archive = view === 'archive';
    const where: Prisma.MeetingWhereInput = {
      contentItem: this.content.visibleWhere(me.id),
      ...(archive ? { status: { in: ['LOCKED', 'CANCELLED'] } } : { status: { notIn: ['LOCKED', 'CANCELLED'] } }),
      ...(series && uuid.safeParse(series).success ? { seriesId: series } : {}),
      ...(q?.trim() ? { OR: [{ title: { contains: q.trim(), mode: 'insensitive' } }, { items: { some: { title: { contains: q.trim(), mode: 'insensitive' }, confidential: false } } }] } : {}),
    };
    const rows = await db.meeting.findMany({ where, include: { attendees: { where: { userId: me.id } }, _count: { select: { items: { where: { status: { notIn: ['MERGED', 'PARKED'] } } } } }, items: { where: { OR: [{ authorId: me.id }, { ownerId: me.id }] }, select: { id: true } } },
      orderBy: { startsAt: archive ? 'desc' : 'asc' }, take: archive ? 60 : 30 });
    const mySeries = await db.meetingSeries.findMany({ where: { meetings: { some: { contentItem: this.content.visibleWhere(me.id) } } }, orderBy: { title: 'asc' } });
    return {
      canCreate: can(await this.policy.loadContext(me.id), 'meetings.create'),
      meetings: rows.map((m) => ({ id: m.id, title: m.title, startsAt: m.startsAt, status: m.status, location: m.location, items: m._count.items, mine: m.items.length, attendance: m.attendees[0]?.status ?? null, role: m.attendees[0]?.role ?? null, deadline: m.agendaDeadline })),
      series: mySeries.map((s) => ({ id: s.id, title: s.title, rule: describeRule(s.recurrenceRule), active: s.isActive, retentionYears: s.retentionYears })),
    };
  }

  /** Entscheidungsregister: alle festgeschriebenen Entscheidungen, durchsuchbar. */
  @RequirePermission('meetings.read')
  @Get('decisions')
  async decisions(@CurrentUser() me: SessionUser, @Query('q') q?: string) {
    const rows = await this.prisma.db.meetingDecision.findMany({
      where: { item: { confidential: false, meeting: { status: 'LOCKED', contentItem: this.content.visibleWhere(me.id) } }, ...(q?.trim() ? { OR: [{ text: { contains: q.trim(), mode: 'insensitive' } }, { item: { title: { contains: q.trim(), mode: 'insensitive' } } }] } : {}) },
      include: { item: { select: { title: true, meeting: { select: { id: true, title: true, startsAt: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    return rows.map((d) => ({ id: d.id, text: d.text, item: d.item.title, meetingId: d.item.meeting.id, meeting: d.item.meeting.title, at: d.item.meeting.startsAt }));
  }

  /** Für „Auf die Agenda setzen“: kommende Meetings, in die ich Punkte einbringen kann. */
  @RequirePermission('meetings.read')
  @Get('targets')
  async targets(@CurrentUser() me: SessionUser) {
    const rows = await this.prisma.db.meeting.findMany({ where: { status: { in: ['PLANNED', 'AGENDA_SET'] }, startsAt: { gt: new Date() }, contentItem: this.content.visibleWhere(me.id), attendees: { some: { userId: me.id } } }, orderBy: { startsAt: 'asc' }, take: 10 });
    return rows.map((m) => ({ id: m.id, title: m.title, when: when(m.startsAt) }));
  }

  /** „Entstanden im Teammeeting … am …“ für Aufgaben, Wissen, News, Übergaben. */
  @RequirePermission('meetings.read')
  @Get('origin/:contentId')
  async origin(@CurrentUser() me: SessionUser, @Param('contentId', ParseUUIDPipe) contentId: string) {
    const l = await this.prisma.db.meetingLink.findUnique({ where: { contentItemId: contentId }, include: { decision: true, item: { include: { meeting: true } } } });
    if (!l || l.item.confidential) return { origin: null };
    const m = l.item.meeting;
    const visible = await this.prisma.db.contentItem.count({ where: { id: m.id, ...this.content.visibleWhere(me.id) } });
    return { origin: { meeting: m.title, on: dayOf(m.startsAt), item: l.item.title, decision: l.decision?.text ?? null, href: visible ? `/meetings/${m.id}#p-${l.itemId}` : null } };
  }

  @RequirePermission('meetings.create')
  @Get('options')
  async options(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const companyId = await primaryCompany(this.prisma, me.id);
    const any = can(ctx, 'meetings.manage_any', { companyId });
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true, ...(any ? { companyId } : { id: { in: ctx.groupIds } }) }, orderBy: { name: 'asc' } });
    return { groups: groups.map((g) => ({ id: g.id, name: g.name })), template: TEMPLATE };
  }

  // ---------------------------------------------------------------- Anlegen

  @RequirePermission('meetings.create')
  @Post()
  async create(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Create)) b: z.infer<typeof Create>) {
    const db = this.prisma.db;
    const ctx = await this.policy.loadContext(me.id);
    const companyId = await primaryCompany(this.prisma, me.id);
    if (b.groupId) {
      const g = await db.group.findFirst({ where: { id: b.groupId, isActive: true } });
      this.svc.need(!!g && (ctx.groupIds.includes(g.id) || can(ctx, 'meetings.manage_any', { companyId: g.companyId })), 'Meetings legst du für deine eigenen Teams an.');
    }
    const userIds = [...new Set([...b.userIds, b.minutesId, b.timekeeperId].filter((x): x is string => !!x))];
    if (userIds.length && (await db.user.count({ where: { id: { in: userIds }, status: { in: ['ACTIVE', 'INVITED'] } } })) !== userIds.length) throw new BadRequestException('Mindestens eine Person gibt es nicht.');
    if (!b.groupId && !userIds.length && !b.guests.length) throw new BadRequestException('Bitte ein Team oder Personen einladen.');
    const startsAt = new Date(b.startsAt);
    let series = null;
    if (b.repeat === 'WEEKLY') {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).formatToParts(startsAt).map((x) => [x.type, x.value]));
      series = await db.meetingSeries.create({ data: { companyId, title: b.title, groupId: b.groupId ?? null, memberIds: b.userIds, recurrenceRule: `FREQ=WEEKLY;BYDAY=${p.weekday.slice(0, 2).toUpperCase()};BYHOUR=${+p.hour};BYMINUTE=${+p.minute}`,
        durationMin: b.durationMin, location: b.location || null, onlineUrl: b.onlineUrl || null, agendaLeadHours: b.agendaLeadHours, retentionYears: b.retentionYears, standardItems: b.standardItems,
        leadId: me.id, minutesId: b.minutesId ?? null, timekeeperId: b.timekeeperId ?? null, createdById: me.id } });
    }
    const item = await this.svc.createInstance(me.id, { companyId, title: b.title, startsAt, durationMin: b.durationMin, location: b.location, onlineUrl: b.onlineUrl, groupId: b.groupId, userIds, guests: b.guests,
      standardItems: b.standardItems, leadId: me.id, minutesId: b.minutesId, timekeeperId: b.timekeeperId, agendaLeadHours: b.agendaLeadHours, series });
    const m = await db.meeting.findUniqueOrThrow({ where: { id: item.id }, include: { attendees: true } });
    await this.svc.tell(m, me.id, `Einladung: ${b.title}`, `${when(startsAt)}${b.location ? ` · ${b.location}` : ''} – bring deine Punkte ein.`, `meeting-invite:${m.id}`);
    return { id: item.id };
  }

  @RequirePermission('meetings.read')
  @Patch('series/:id')
  async patchSeries(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(SeriesPatch)) b: z.infer<typeof SeriesPatch>) {
    const db = this.prisma.db;
    const s = await db.meetingSeries.findUnique({ where: { id } });
    this.svc.need(!!s && (s.leadId === me.id || can(await this.policy.loadContext(me.id), 'meetings.manage_any', { companyId: s.companyId })), 'Die Serie ändert die Meetingleitung.');
    await db.meetingSeries.update({ where: { id }, data: b });
    return { ok: true };
  }

  // ---------------------------------------------------------------- Ein Meeting

  @RequirePermission('meetings.read')
  @Get(':id')
  async get(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const db = this.prisma.db;
    const { m, item, roles } = await this.svc.load(me.id, id);
    const items = m.items.filter((i) => this.svc.sees(i, me.id, roles));
    const names = await this.svc.names([...m.attendees.map((a) => a.userId), ...items.flatMap((i) => [i.authorId, i.ownerId, ...i.viewerIds]), ...m.addenda.map((a) => a.authorId), m.submittedById, m.lockedById]);
    // Rückblick: offene Aufgaben aus dem letzten Termin der Serie
    const prev = m.seriesId ? await db.meeting.findFirst({ where: { seriesId: m.seriesId, startsAt: { lt: m.startsAt }, status: { not: 'CANCELLED' } }, orderBy: { startsAt: 'desc' }, include: { items: { where: { confidential: false }, include: { links: { where: { kind: 'TASK', contentItem: { task: { status: { notIn: ['DONE', 'CANCELLED'] } } } }, include: LINK_INCLUDE } } } } }) : null;
    const lead = roles.lead && !['LOCKED', 'CANCELLED'].includes(m.status);
    const parked = lead && m.seriesId ? await db.agendaItem.findMany({ where: { status: 'PARKED', carriedAt: null, meeting: { seriesId: m.seriesId, id: { not: m.id } } }, include: { meeting: { select: { startsAt: true } } }, orderBy: { createdAt: 'asc' } }) : [];
    // Ideen mit viel Zuspruch, die noch auf keiner Agenda standen
    const ideas = lead ? (await db.contentItem.findMany({ where: { type: 'IDEA', companyId: item.companyId, ...this.content.visibleWhere(me.id), idea: { status: { in: ['SUBMITTED', 'IN_REVIEW'] } }, reactions: { some: { type: 'LIKE' } } }, include: { idea: true, _count: { select: { reactions: { where: { type: 'LIKE' } } } } }, take: 50 }))
      .filter((i) => i._count.reactions >= IDEA_LIKES) : [];
    const onAgenda = ideas.length ? new Set((await db.agendaItem.findMany({ where: { sourcePath: { in: ideas.map((i) => `/ideen/${i.id}`) } }, select: { sourcePath: true } })).map((a) => a.sourcePath)) : new Set();
    const showEmail = roles.lead;
    return {
      id: m.id, title: m.title, startsAt: m.startsAt, durationMin: m.durationMin, location: m.location, onlineUrl: m.onlineUrl, status: m.status, agendaDeadline: m.agendaDeadline,
      submittedAt: m.submittedAt, submittedBy: names.get(m.submittedById!) ?? null, lockedAt: m.lockedAt, lockedBy: names.get(m.lockedById!) ?? null, retainUntil: m.retainUntil, cancelNote: m.cancelNote,
      series: m.series ? { id: m.series.id, title: m.series.title, rule: describeRule(m.series.recurrenceRule), retentionYears: m.series.retentionYears, standardItems: m.series.standardItems, active: m.series.isActive } : null,
      me: { id: me.id, ...roles },
      attendees: m.attendees.map((a) => ({ id: a.id, userId: a.userId, name: a.userId ? names.get(a.userId) ?? '–' : a.guestName!, guest: !a.userId, org: a.guestOrg, email: showEmail ? a.guestEmail : null, role: a.role, status: a.status }))
        .sort((x, y) => Number(x.guest) - Number(y.guest) || x.name.localeCompare(y.name, 'de')),
      items: items.map((i) => ({
        id: i.id, title: i.title, description: i.description, author: names.get(i.authorId!) ?? null, authorId: i.authorId, ownerId: i.ownerId, owner: names.get(i.ownerId!) ?? null, durationMin: i.durationMin, status: i.status,
        confidential: i.confidential, viewers: i.viewerIds.map((v) => ({ id: v, name: names.get(v) ?? '–' })), notes: i.notes, photos: i.photoFileIds, spentSec: i.spentSec + (i.timerAt ? Math.round((Date.now() - i.timerAt.getTime()) / 1000) : 0),
        running: !!i.timerAt, sourcePath: i.sourcePath, origin: i.origin, followUpOn: i.followUpOn, mergedIntoId: i.mergedIntoId,
        decisions: i.decisions.map((d) => ({ id: d.id, text: d.text })), links: i.links.map((l) => this.svc.linkRow(l)),
      })),
      hidden: m.items.length - items.length,
      previous: prev ? { id: prev.id, title: prev.title, startsAt: prev.startsAt, openTasks: prev.items.flatMap((i) => i.links.map((l) => this.svc.linkRow(l))) } : null,
      parked: parked.map((p) => ({ id: p.id, title: p.title, from: p.meeting.startsAt })),
      ideas: ideas.filter((i) => !onAgenda.has(`/ideen/${i.id}`)).map((i) => ({ id: i.id, title: i.idea!.title, likes: i._count.reactions })),
      addenda: m.addenda.map((a) => ({ id: a.id, text: a.text, author: names.get(a.authorId!) ?? '–', at: a.createdAt })),
    };
  }

  @RequirePermission('meetings.read')
  @Patch(':id')
  async patch(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Create.pick({ startsAt: true, durationMin: true, location: true, onlineUrl: true }).partial())) b: { startsAt?: string; durationMin?: number; location?: string | null; onlineUrl?: string | null }) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.lead); this.svc.assertOpen(m, ['REVIEW']);
    const startsAt = b.startsAt ? new Date(b.startsAt) : undefined;
    const lead = m.series?.agendaLeadHours ?? 26;
    await this.prisma.db.meeting.update({ where: { id }, data: { startsAt, durationMin: b.durationMin, location: b.location, onlineUrl: b.onlineUrl, ...(startsAt ? { agendaDeadline: new Date(startsAt.getTime() - lead * 3600_000) } : {}) } });
    if (startsAt) await this.svc.tell(m, me.id, `Neuer Termin: ${m.title}`, when(startsAt), `meeting-moved:${id}:${startsAt.getTime()}`);
    return { ok: true };
  }

  /** Ablauf: Agenda verteilen → starten → Protokoll einreichen → (Leitung) festschreiben. Absagen verschiebt offene Punkte. */
  @RequirePermission('meetings.read')
  @Post(':id/state')
  async state(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(State)) b: z.infer<typeof State>) {
    const db = this.prisma.db;
    const { m, roles } = await this.svc.load(me.id, id);
    const now = new Date();
    const from = (...s: string[]) => { if (!s.includes(m.status)) throw new BadRequestException('Das geht in diesem Schritt nicht.'); };
    const stopTimers = () => db.$executeRaw`UPDATE agenda_items SET spent_sec = spent_sec + EXTRACT(EPOCH FROM (now() - timer_at))::int, timer_at = NULL WHERE meeting_id = ${id}::uuid AND timer_at IS NOT NULL`;
    switch (b.action) {
      case 'set-agenda':
        this.svc.need(roles.lead); from('PLANNED', 'AGENDA_SET');
        await db.agendaItem.updateMany({ where: { meetingId: id, status: 'PROPOSED' }, data: { status: 'SET' } });
        await db.meeting.update({ where: { id }, data: { status: 'AGENDA_SET', agendaSetAt: now } });
        await db.readReceipt.deleteMany({ where: { contentItemId: id } }); // Lesestatus gilt ab jetzt für die Agenda
        await this.svc.tell(m, me.id, `Agenda steht: ${m.title}`, `${when(m.startsAt)} · ${m.items.filter((i) => ['PROPOSED', 'SET'].includes(i.status)).length} Punkte`, `meeting-agenda-set:${id}:${now.getTime()}`);
        break;
      case 'start':
        this.svc.need(roles.minutes, 'Starten dürfen Leitung und Protokoll.'); from('PLANNED', 'AGENDA_SET');
        await db.agendaItem.updateMany({ where: { meetingId: id, status: 'PROPOSED' }, data: { status: 'SET' } });
        await db.meeting.update({ where: { id }, data: { status: 'LIVE', startedAt: now } });
        break;
      case 'submit':
        this.svc.need(roles.minutes, 'Einreichen dürfen Protokoll und Leitung.'); from('LIVE');
        await stopTimers();
        await db.agendaItem.updateMany({ where: { meetingId: id, status: { in: ['PROPOSED', 'SET'] } }, data: { status: 'POSTPONED' } }); // nicht geschafft → nächstes Mal
        await db.meeting.update({ where: { id }, data: { status: 'REVIEW', endedAt: m.endedAt ?? now, submittedAt: now, submittedById: me.id } });
        await this.notifications.notify({ recipientIds: m.attendees.filter((a) => a.role === 'LEAD').map((a) => a.userId!), actorId: me.id, eventType: 'meeting', importance: 'IMPORTANT', title: `Protokoll prüfen: ${m.title}`, body: 'Bitte prüfen und festschreiben.', linkPath: `/meetings/${id}`, contentItemId: id, dedupeKey: `meeting-review:${id}:${now.getTime()}` });
        break;
      case 'reopen':
        this.svc.need(roles.lead); from('REVIEW');
        await db.meeting.update({ where: { id }, data: { status: 'LIVE', submittedAt: null, submittedById: null } });
        break;
      case 'lock': {
        // Vier Augen: Protokoll reicht ein, Leitung bestätigt (in kleinen Runden darf es dieselbe Person sein)
        this.svc.need(roles.lead, 'Festschreiben darf die Meetingleitung.'); from('REVIEW');
        const years = m.series?.retentionYears ?? 3;
        await db.meeting.update({ where: { id }, data: { status: 'LOCKED', lockedAt: now, lockedById: me.id, retainUntil: new Date(Date.UTC(now.getUTCFullYear() + years, now.getUTCMonth(), now.getUTCDate())) } });
        await db.readReceipt.deleteMany({ where: { contentItemId: id } }); // Lesestatus gilt ab jetzt fürs Protokoll
        await this.svc.tell(m, me.id, `Protokoll: ${m.title} vom ${dayOf(m.startsAt)}`, 'Festgeschrieben – bitte lesen.', `meeting-locked:${id}`);
        break;
      }
      case 'cancel':
        this.svc.need(roles.lead); from('PLANNED', 'AGENDA_SET');
        await db.agendaItem.updateMany({ where: { meetingId: id, status: { in: ['PROPOSED', 'SET'] }, origin: { not: 'STANDARD' } }, data: { status: 'POSTPONED' } });
        await db.meeting.update({ where: { id }, data: { status: 'CANCELLED', cancelNote: b.note || null } });
        await this.svc.tell(m, me.id, `Fällt aus: ${m.title} am ${when(m.startsAt)}`, b.note || 'Eingebrachte Punkte wandern ins nächste Meeting.', `meeting-cancel:${id}`);
        break;
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- Kalender

  /** Kalenderdatei für den eigenen Kalender (Outlook, Handy) – bei Serien mit Wiederholung. */
  @RequirePermission('meetings.read')
  @Get(':id/ics')
  async ics(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    const { m } = await this.svc.load(me.id, id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(m.title.replace(/[^\p{L}\p{N} -]/gu, ''))}.ics`);
    res.send(icsFor(m, m.series?.isActive ? m.series.recurrenceRule : null, `${baseUrl(req)}/meetings/${id}`));
  }

  /** Outlook-Einladung an alle: Termin in Outlook vorausgefüllt (Leitung). Wer keine E-Mail hat, sieht den Termin im WIR. */
  @RequirePermission('meetings.read')
  @Get(':id/outlook')
  async outlook(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.lead, 'Einladungen verschickt die Meetingleitung.');
    const users = await this.prisma.db.user.findMany({ where: { id: { in: m.attendees.map((a) => a.userId!).filter((u) => u && u !== me.id) } }, select: { displayName: true, email: true } });
    const guests = m.attendees.filter((a) => !a.userId);
    const to = [...users.map((u) => u.email), ...guests.map((g) => g.guestEmail)].filter((e): e is string => !!e);
    const missing = [...users.filter((u) => !u.email).map((u) => u.displayName), ...guests.filter((g) => !g.guestEmail).map((g) => g.guestName!)];
    return { url: outlookCompose(m, to, `${baseUrl(req)}/meetings/${id}`, m.series?.recurrenceRule ? describeRule(m.series.recurrenceRule) : null), to: to.length, missing };
  }

  // ---------------------------------------------------------------- Teilnehmende

  @RequirePermission('meetings.read')
  @Post(':id/attendees')
  async addAttendee(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Attendee)) b: z.infer<typeof Attendee>) {
    const db = this.prisma.db;
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.minutes, 'Einladen dürfen Leitung und Protokoll.'); this.svc.assertOpen(m);
    if ('userId' in b) {
      if (!(await db.user.count({ where: { id: b.userId, status: { in: ['ACTIVE', 'INVITED'] } } }))) throw new BadRequestException('Diese Person gibt es nicht.');
      if (m.attendees.some((a) => a.userId === b.userId)) throw new BadRequestException('Ist schon eingeladen.');
      await db.meetingAttendee.create({ data: { meetingId: id, userId: b.userId } });
      await this.svc.addPerson(id, b.userId);
      await this.notifications.notify({ recipientIds: [b.userId], actorId: me.id, eventType: 'meeting', title: `Einladung: ${m.title}`, body: when(m.startsAt), linkPath: `/meetings/${id}`, contentItemId: id, dedupeKey: `meeting-invite:${id}` });
    } else {
      await db.meetingAttendee.create({ data: { meetingId: id, guestName: b.name, guestOrg: b.org || null, guestEmail: b.email || null } });
    }
    return { ok: true };
  }

  @RequirePermission('meetings.read')
  @Patch(':id/attendees/:aid')
  async patchAttendee(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string, @Body(new ZodPipe(AttendeePatch)) b: z.infer<typeof AttendeePatch>) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.assertOpen(m);
    const a = m.attendees.find((x) => x.id === aid);
    if (!a) throw new BadRequestException('Gibt es nicht.');
    // Selbst absagen geht vorher; Anwesenheit führt das Protokoll, Rollen vergibt die Leitung
    const self = a.userId === me.id && b.role === undefined && ['EXCUSED', 'INVITED'].includes(b.status ?? '') && ['PLANNED', 'AGENDA_SET'].includes(m.status);
    this.svc.need(self || (b.role === undefined ? roles.minutes : roles.lead), 'Das führt das Protokoll.');
    if (b.role === 'LEAD' && !a.userId) throw new BadRequestException('Gäste können nicht leiten.');
    await this.prisma.db.meetingAttendee.update({ where: { id: aid }, data: b });
    return { ok: true };
  }

  @RequirePermission('meetings.read')
  @Delete(':id/attendees/:aid')
  async removeAttendee(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('aid', ParseUUIDPipe) aid: string) {
    const db = this.prisma.db;
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.lead); this.svc.assertOpen(m);
    const a = m.attendees.find((x) => x.id === aid);
    if (!a || a.role === 'LEAD') throw new BadRequestException('Die Leitung bleibt dabei.');
    await db.meetingAttendee.delete({ where: { id: aid } });
    if (a.userId) await db.contentRecipient.updateMany({ where: { contentItemId: id, userId: a.userId }, data: { removedAt: new Date() } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- Agenda

  @RequirePermission('meetings.read')
  @Post(':id/items')
  async addItem(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ItemInput)) b: z.infer<typeof ItemInput>) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.assertOpen(m, ['REVIEW']);
    this.svc.need(roles.attendee || roles.lead, 'Punkte bringen Teilnehmende ein.');
    if (m.status === 'LIVE') this.svc.need(roles.minutes, 'Im laufenden Meeting ergänzt das Protokoll.');
    const people = new Set(m.attendees.map((a) => a.userId));
    if (b.ownerId && !people.has(b.ownerId)) throw new BadRequestException('Verantwortlich kann nur, wer eingeladen ist.');
    const viewerIds = b.confidential ? b.viewerIds.filter((v) => people.has(v)) : [];
    const last = m.items.filter((i) => i.title !== 'Sonstiges' || i.origin !== 'STANDARD').at(-1)?.sortOrder ?? -1;
    const other = m.items.find((i) => i.title === 'Sonstiges' && i.origin === 'STANDARD');
    if (other) await this.prisma.db.agendaItem.update({ where: { id: other.id }, data: { sortOrder: last + 2 } }); // „Sonstiges“ bleibt am Ende
    const i = await this.prisma.db.agendaItem.create({ data: { meetingId: id, title: b.title, description: b.description || null, authorId: me.id, ownerId: b.ownerId ?? me.id, durationMin: b.durationMin,
      confidential: b.confidential, viewerIds, sourcePath: b.sourcePath ?? null, sortOrder: last + 1, status: m.status === 'LIVE' ? 'SET' : 'PROPOSED', origin: b.sourcePath?.startsWith('/ideen/') ? 'IDEA' : null } });
    return { id: i.id };
  }

  private async itemCtx(me: string, itemId: string) {
    const i = await this.prisma.db.agendaItem.findUnique({ where: { id: itemId }, select: { meetingId: true } });
    if (!i) throw new BadRequestException('Diesen Punkt gibt es nicht.');
    const c = await this.svc.load(me, i.meetingId);
    const item = c.m.items.find((x) => x.id === itemId)!;
    if (!this.svc.sees(item, me, c.roles)) throw new BadRequestException('Diesen Punkt gibt es nicht.');
    return { ...c, i: item };
  }

  @RequirePermission('meetings.read')
  @Patch('items/:itemId')
  async patchItem(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(ItemPatch)) b: z.infer<typeof ItemPatch>) {
    const { m, roles, i } = await this.itemCtx(me.id, itemId);
    this.svc.assertOpen(m);
    const own = i.authorId === me.id && ['PLANNED', 'AGENDA_SET'].includes(m.status) && i.status === 'PROPOSED';
    this.svc.need(roles.minutes || own, 'Ändern dürfen Leitung, Protokoll und wer den Punkt eingebracht hat.');
    const { notes, status, followUpOn, photoFileIds, ...rest } = b;
    if (!roles.minutes && (notes !== undefined || status || followUpOn !== undefined || photoFileIds)) throw new BadRequestException('Notizen und Status führt das Protokoll.');
    if (status && ['DONE'].includes(status) && m.status !== 'LIVE' && m.status !== 'REVIEW') throw new BadRequestException('Erledigt wird ein Punkt im Meeting.');
    if (photoFileIds?.length) {
      const fresh = photoFileIds.filter((f) => !i.photoFileIds.includes(f));
      if (fresh.length && (await this.prisma.db.fileObject.count({ where: { id: { in: fresh }, uploadedById: me.id, mimeType: { startsWith: 'image/' } } })) !== fresh.length) throw new BadRequestException('Foto fehlt.');
    }
    const people = new Set(m.attendees.map((a) => a.userId));
    await this.prisma.db.agendaItem.update({ where: { id: itemId }, data: {
      ...rest, ...(rest.viewerIds ? { viewerIds: rest.viewerIds.filter((v) => people.has(v)) } : {}), ...(rest.confidential === false ? { viewerIds: [] } : {}),
      notes, status, photoFileIds, followUpOn: followUpOn === undefined ? undefined : followUpOn ? new Date(followUpOn) : null,
      ...(status && status !== 'DONE' && i.timerAt ? { timerAt: null, spentSec: i.spentSec + Math.round((Date.now() - i.timerAt.getTime()) / 1000) } : {}),
    } });
    return { ok: true };
  }

  @RequirePermission('meetings.read')
  @Delete('items/:itemId')
  async deleteItem(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    const { m, roles, i } = await this.itemCtx(me.id, itemId);
    this.svc.assertOpen(m, ['REVIEW']);
    this.svc.need(roles.lead || (i.authorId === me.id && i.status === 'PROPOSED'), 'Löschen dürfen die Leitung und wer den Punkt eingebracht hat.');
    if (i.decisions.length || i.links.length) throw new BadRequestException('Zu diesem Punkt gibt es schon Ergebnisse.');
    await this.prisma.db.agendaItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  /** Reihenfolge festlegen (Leitung), z. B. per Pfeil hoch/runter. */
  @RequirePermission('meetings.read')
  @Post(':id/order')
  async order(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ ids: z.array(uuid).max(200) }))) b: { ids: string[] }) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.minutes); this.svc.assertOpen(m);
    const mine = new Set(m.items.map((i) => i.id));
    await this.prisma.db.$transaction(b.ids.filter((x) => mine.has(x)).map((x, sortOrder) => this.prisma.db.agendaItem.update({ where: { id: x }, data: { sortOrder } })));
    return { ok: true };
  }

  /** Zwei Punkte zusammenlegen: Beschreibung und Zeit wandern zum Zielpunkt. */
  @RequirePermission('meetings.read')
  @Post('items/:itemId/merge')
  async merge(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(z.object({ intoId: uuid }))) b: { intoId: string }) {
    const { m, roles, i } = await this.itemCtx(me.id, itemId);
    this.svc.need(roles.lead); this.svc.assertOpen(m, ['REVIEW']);
    const t = m.items.find((x) => x.id === b.intoId);
    if (!t || t.id === i.id || t.status === 'MERGED') throw new BadRequestException('Zielpunkt fehlt.');
    const db = this.prisma.db;
    await db.$transaction([
      db.agendaItem.update({ where: { id: t.id }, data: { description: [t.description, `${i.title}${i.description ? `: ${i.description}` : ''} (${(await this.svc.names([i.ownerId])).get(i.ownerId!) ?? 'eingebracht'})`].filter(Boolean).join('\n\n'), durationMin: t.durationMin + i.durationMin, confidential: t.confidential || i.confidential, viewerIds: [...new Set([...t.viewerIds, ...i.viewerIds])] } }),
      db.agendaItem.update({ where: { id: i.id }, data: { status: 'MERGED', mergedIntoId: t.id } }),
    ]);
    return { ok: true };
  }

  /** Geparkten Punkt aus einem früheren Termin der Serie übernehmen. */
  @RequirePermission('meetings.read')
  @Post(':id/pull')
  async pull(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ itemId: uuid }))) b: { itemId: string }) {
    const db = this.prisma.db;
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.lead); this.svc.assertOpen(m, ['REVIEW']);
    const p = await db.agendaItem.findFirst({ where: { id: b.itemId, status: 'PARKED', carriedAt: null, meeting: { seriesId: m.seriesId ?? '00000000-0000-0000-0000-000000000000' } } });
    if (!p) throw new BadRequestException('Diesen Punkt gibt es nicht auf dem Parkplatz.');
    await db.agendaItem.create({ data: { meetingId: id, title: p.title, description: p.description, authorId: p.authorId, ownerId: p.ownerId, durationMin: p.durationMin, confidential: p.confidential, viewerIds: p.viewerIds, sourcePath: p.sourcePath, origin: 'PARKED', carriedFromId: p.id, sortOrder: (m.items.at(-1)?.sortOrder ?? 0) + 1, status: m.status === 'LIVE' ? 'SET' : 'PROPOSED' } });
    await db.agendaItem.update({ where: { id: p.id }, data: { carriedAt: new Date() } });
    return { ok: true };
  }

  /** Zeit je Punkt: startet hier, stoppt alle anderen. */
  @RequirePermission('meetings.read')
  @Post('items/:itemId/timer')
  async timer(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(z.object({ run: z.boolean() }))) b: { run: boolean }) {
    const { m, roles } = await this.itemCtx(me.id, itemId);
    this.svc.need(roles.timekeeper, 'Die Zeit führen Zeitwächter:in, Protokoll und Leitung.');
    if (m.status !== 'LIVE') throw new BadRequestException('Die Zeit läuft nur im Meeting.');
    await this.prisma.db.$executeRaw`UPDATE agenda_items SET spent_sec = spent_sec + EXTRACT(EPOCH FROM (now() - timer_at))::int, timer_at = NULL WHERE meeting_id = ${m.id}::uuid AND timer_at IS NOT NULL`;
    if (b.run) await this.prisma.db.agendaItem.update({ where: { id: itemId }, data: { timerAt: new Date() } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- Ergebnisse

  @RequirePermission('meetings.read')
  @Post('items/:itemId/decisions')
  async decide(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(z.object({ text: text(1000).min(3) }))) b: { text: string }) {
    const { m, roles } = await this.itemCtx(me.id, itemId);
    this.svc.need(roles.minutes, 'Entscheidungen hält das Protokoll fest.'); this.svc.assertOpen(m);
    const d = await this.prisma.db.meetingDecision.create({ data: { itemId, text: b.text, createdById: me.id } });
    return { id: d.id };
  }

  @RequirePermission('meetings.read')
  @Delete('decisions/:id')
  async undecide(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const d = await this.prisma.db.meetingDecision.findUnique({ where: { id } });
    if (!d) throw new BadRequestException('Gibt es nicht.');
    const { m, roles } = await this.itemCtx(me.id, d.itemId);
    this.svc.need(roles.minutes); this.svc.assertOpen(m);
    await this.prisma.db.meetingDecision.delete({ where: { id } });
    return { ok: true };
  }

  /** Aufgabe direkt im Meeting: an Teilnehmende, mit Rückverweis aufs Protokoll. */
  @RequirePermission('meetings.read')
  @Post('items/:itemId/tasks')
  async task(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(Task)) b: z.infer<typeof Task>) {
    const { m, roles, i, item } = await this.itemCtx(me.id, itemId);
    this.svc.need(roles.minutes, 'Aufgaben vergeben Leitung und Protokoll.');
    if (!m.attendees.some((a) => a.userId === b.userId)) throw new BadRequestException('Aufgaben gehen an Teilnehmende.');
    if (b.decisionId && !i.decisions.some((d) => d.id === b.decisionId)) throw new BadRequestException('Entscheidung fehlt.');
    const { item: t, recipientIds } = await this.content.create({
      type: 'TASK', companyId: item.companyId, authorId: me.id, reactionsEnabled: false, targets: [{ type: 'USER', userId: b.userId }],
      createSubtype: (tx, id) => tx.task.create({ data: { id, title: b.title, description: b.description || null, dueAt: b.dueAt ? new Date(b.dueAt) : null, assignees: { create: { userId: b.userId, isResponsible: true } } } }),
    });
    await this.prisma.db.meetingLink.create({ data: { itemId, decisionId: b.decisionId ?? null, contentItemId: t.id, kind: 'TASK' } });
    await this.notifications.notify({ recipientIds, actorId: me.id, eventType: 'task.assigned', title: `Neue Aufgabe: ${b.title}`, body: `aus ${m.title} am ${dayOf(m.startsAt)}`, linkPath: `/aufgaben/${t.id}`, contentItemId: t.id });
    return { id: t.id };
  }

  /** „Daraus machen …“: eben angelegte News, Übergabe, Wissen oder Checkliste mit dem Punkt verknüpfen. */
  @RequirePermission('meetings.read')
  @Post('items/:itemId/links')
  async link(@CurrentUser() me: SessionUser, @Param('itemId', ParseUUIDPipe) itemId: string, @Body(new ZodPipe(Link)) b: z.infer<typeof Link>) {
    const db = this.prisma.db;
    const { i } = await this.itemCtx(me.id, itemId);
    if (b.decisionId && !i.decisions.some((d) => d.id === b.decisionId)) throw new BadRequestException('Entscheidung fehlt.');
    if (b.checklistId) {
      if (!(await db.checklist.count({ where: { id: b.checklistId, ownerId: me.id } }))) throw new BadRequestException('Diese Checkliste gehört nicht dir.');
      await db.meetingLink.create({ data: { itemId, decisionId: b.decisionId ?? null, checklistId: b.checklistId, kind: 'CHECKLIST' } });
      return { ok: true };
    }
    const c = await db.contentItem.findFirst({ where: { id: b.contentItemId!, authorId: me.id, deletedAt: null } });
    const kind = c && KIND[c.type as keyof typeof KIND];
    if (!c || !kind) throw new BadRequestException('Verknüpfen geht nur mit eigenen Beiträgen.');
    await db.meetingLink.upsert({ where: { contentItemId: c.id }, create: { itemId, decisionId: b.decisionId ?? null, contentItemId: c.id, kind }, update: {} });
    return { ok: true };
  }

  /** Nach dem Festschreiben: datierter Nachtrag statt Änderung. */
  @RequirePermission('meetings.read')
  @Post(':id/addenda')
  async addendum(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(z.object({ text: text(2000).min(3) }))) b: { text: string }) {
    const { m, roles } = await this.svc.load(me.id, id);
    this.svc.need(roles.minutes, 'Nachträge schreiben Leitung und Protokoll.');
    if (m.status !== 'LOCKED') throw new BadRequestException('Vor dem Festschreiben bitte direkt im Protokoll ändern.');
    await this.prisma.db.meetingAddendum.create({ data: { meetingId: id, text: b.text, authorId: me.id } });
    await this.svc.tell(m, me.id, `Nachtrag zum Protokoll: ${m.title}`, b.text.slice(0, 120), `meeting-addendum:${id}:${Date.now()}`);
    return { ok: true };
  }
}
