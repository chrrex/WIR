import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { berlinMidnight, houseData, weatherText } from './house';
import type { AppModule } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { can, PolicyContext } from '../policy/engine';
import { MODULE_PERMISSION, enabledModules } from '../me/branding';
import { ContentService } from '../content/content.service';
import { MeetingsService, when } from '../work/meetings.service';

const Prefs = z.object({ items: z.array(z.object({ key: z.string().regex(/^(kpi|w):[a-z]{2,20}$/), visible: z.boolean() })).max(40) });

interface Widget {
  key: string;
  title: string;
  module: AppModule | null;
  /** coming = Rahmen steht, Inhalte folgen in der genannten Phase */
  state: 'ready' | 'coming';
  items?: Array<{ id: string; title: string; meta: string; unread: boolean; important?: boolean; photo?: boolean; href: string }>;
  count?: number;
  phase?: number;
  text: string;
}

const WIDGETS: Array<Omit<Widget, 'state'> & { readyInPhase: number }> = [
  { key: 'news', title: 'News', module: 'NEWS', readyInPhase: 2, text: 'Neuigkeiten aus deinem Team, deiner Gesellschaft und der Stiftungsgruppe.' },
  { key: 'handovers', title: 'Übergaben', module: 'HANDOVERS', readyInPhase: 2, text: 'Was die vorige Schicht dir mitgibt.' },
  { key: 'weather', title: 'Wetter in Liebenberg', module: null, readyInPhase: 1, text: 'Das Wetter lässt sich gerade nicht abrufen.' },
  { key: 'social', title: 'Neu bei Social', module: 'SOCIAL', readyInPhase: 2, text: 'Grüße, Glückwünsche, Biete & Suche.' },
  { key: 'thanks', title: 'Danke-Karten', module: 'SOCIAL', readyInPhase: 2, text: 'Wer sich bei wem bedankt hat.' },
  { key: 'tasks', title: 'Meine Aufgaben', module: 'TASKS', readyInPhase: 4, text: 'Deine offenen Aufgaben mit Fälligkeit.' },
  { key: 'meetings', title: 'Nächstes Meeting', module: 'MEETINGS', readyInPhase: 4, text: 'Gerade ist kein Meeting für dich geplant.' },
  { key: 'checklists', title: 'Checklisten heute', module: 'CHECKLISTS', readyInPhase: 4, text: 'Checklisten, die heute für dich fällig sind.' },
  { key: 'events', title: 'Veranstaltungen & Räume heute', module: 'EVENTS', readyInPhase: 5, text: 'Aus dem Eventtool – sobald die Anbindung steht.' },
  { key: 'shift', title: 'Mein Dienstplan', module: 'SHIFTS', readyInPhase: 5, text: 'Aus Gastromatic – sobald die Anbindung geprüft ist.' },
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly meetings: MeetingsService) {}

  @RequirePermission('dashboard.view')
  @Get()
  async get(@CurrentUser() me: SessionUser, @Req() req: { policy: PolicyContext }) {
    const ctx = req.policy;
    const companies = await this.prisma.db.company.findMany({ include: { branding: true }, orderBy: { name: 'asc' } });
    const modules = enabledModules(ctx.companyIds, companies).filter((m) => can(ctx, MODULE_PERMISSION[m]));
    const isFoundation = companies.some((c) => ctx.companyIds.includes(c.id) && c.kind === 'FOUNDATION');

    const widgets: Widget[] = WIDGETS.filter((w) => !w.module || modules.includes(w.module)).map(({ readyInPhase, ...w }) => ({
      ...w, state: readyInPhase <= 4 ? 'ready' : 'coming', phase: readyInPhase,
    }));
    const db = this.prisma.db;
    const visible = this.content.visibleWhere(me.id);
    const fmt = (d: Date | null) => (d ? new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d) : '');
    let important: { id: string; title: string } | null = null;
    for (const w of widgets) {
      if (w.key === 'news') {
        const rows = await db.contentItem.findMany({ where: { type: 'POST', post: { kind: 'NEWS' }, ...visible }, include: { post: true, author: { select: { displayName: true } }, readReceipts: { where: { userId: me.id } } }, orderBy: { publishedAt: 'desc' }, take: 4 });
        w.items = rows.map((r) => ({ id: r.id, title: r.post!.title, meta: `${r.author?.displayName ?? ''} · ${fmt(r.publishedAt)}`, unread: !r.readReceipts.length && r.authorId !== me.id, important: r.importance === 'IMPORTANT', href: `/news/${r.id}` }));
        w.count = await db.contentItem.count({ where: { type: 'POST', post: { kind: 'NEWS' }, ...visible, authorId: { not: me.id }, readReceipts: { none: { userId: me.id } } } });
        const imp = await db.contentItem.findFirst({ where: { type: 'POST', importance: 'IMPORTANT', post: { kind: 'NEWS' }, ...visible, authorId: { not: me.id }, readReceipts: { none: { userId: me.id } } }, include: { post: true }, orderBy: { publishedAt: 'desc' } });
        if (imp) important = { id: imp.id, title: imp.post!.title };
      }
      if (w.key === 'handovers') {
        const rows = await db.contentItem.findMany({ where: { type: 'HANDOVER', ...visible }, include: { handover: { include: { group: true } }, readReceipts: { where: { userId: me.id } } }, orderBy: { publishedAt: 'desc' }, take: 3 });
        w.items = rows.map((r) => ({ id: r.id, title: `${r.handover!.shiftLabel ?? ''} · ${r.handover!.subject}`, meta: `${r.handover!.group?.name ?? ''} · ${fmt(r.publishedAt)}`, unread: !r.readReceipts.length && r.authorId !== me.id, href: `/uebergaben/${r.id}` }));
      }
      if (w.key === 'social') {
        const rows = await db.contentItem.findMany({ where: { type: 'POST', post: { kind: 'SOCIAL', NOT: { socialCategory: 'THANKS' } }, ...visible }, include: { post: true, author: { select: { displayName: true } }, _count: { select: { attachments: true } } }, orderBy: { publishedAt: 'desc' }, take: 2 });
        w.items = rows.map((r) => ({ id: r.id, title: r.post!.title, meta: r.author?.displayName ?? '', unread: false, photo: r._count.attachments > 0, href: `/social/${r.id}` }));
      }
      if (w.key === 'thanks') {
        const rows = await db.contentItem.findMany({ where: { type: 'POST', post: { socialCategory: 'THANKS' }, ...visible }, include: { post: true, author: { select: { displayName: true } } }, orderBy: { publishedAt: 'desc' }, take: 3 });
        w.items = rows.map((r) => ({ id: r.id, title: r.post!.title, meta: `von ${r.author?.displayName ?? '–'}`, unread: false, href: `/social/${r.id}` }));
        // Monatsrückblick: nur die Gesamtzahl, keine Namen (ADR-051)
        const now = new Date();
        w.count = await db.post.count({ where: { socialCategory: 'THANKS', contentItem: { status: 'PUBLISHED', deletedAt: null, publishedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } } });
      }
      if (w.key === 'tasks') {
        const where = { type: 'TASK' as const, ...visible, task: { status: { notIn: ['DONE' as const, 'CANCELLED' as const] }, assignees: { some: { OR: [{ userId: me.id }, { groupId: { in: ctx.groupIds } }] } } } };
        const rows = await db.contentItem.findMany({ where, include: { task: true }, orderBy: { task: { dueAt: { sort: 'asc', nulls: 'last' } } }, take: 4 });
        w.items = rows.map((r) => ({ id: r.id, title: r.task!.title, meta: r.task!.dueAt ? `fällig ${fmt(r.task!.dueAt)}` : 'ohne Termin', unread: false, important: r.task!.priority === 'URGENT', href: `/aufgaben/${r.id}` }));
        w.count = await db.contentItem.count({ where });
      }
      if (w.key === 'meetings') {
        const { m, tasks } = await this.meetings.nextFor(me.id);
        const open = m?.status === 'PLANNED' && m.agendaDeadline && m.agendaDeadline > new Date();
        w.items = [
          ...(m ? [{ id: m.id, title: m.title, meta: [m.status === 'LIVE' ? 'läuft gerade' : when(m.startsAt), m.location, open && `Punkte bis ${when(m.agendaDeadline!)}`].filter(Boolean).join(' · '), unread: m.status === 'LIVE', href: `/meetings/${m.id}` }] : []),
          ...(m?.items ?? []).map((i, k) => ({ id: `${m!.id}-${k}`, title: `Dein Punkt: ${i.title}`, meta: 'auf der Agenda', unread: false, href: `/meetings/${m!.id}` })),
          ...tasks.map((t) => ({ id: t.id, title: `Aufgabe: ${t.task!.title}`, meta: t.task!.dueAt ? `aus einem Meeting · fällig ${fmt(t.task!.dueAt)}` : 'aus einem Meeting', unread: false, href: `/aufgaben/${t.id}` })),
        ];
      }
      if (w.key === 'checklists') {
        const rows = await db.contentItem.findMany({ where: { type: 'CHECKLIST_RUN', ...visible, checklistRun: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } }, include: { checklistRun: true }, orderBy: { publishedAt: 'desc' }, take: 4 });
        w.items = rows.map((r) => ({ id: r.id, title: r.checklistRun!.title, meta: 'offen', unread: true, href: `/checklisten/${r.id}` }));
      }
    }

    // Gruppenweite Sicht (ADR-039): Überblick über die Gesellschaften statt Hauskennzahlen
    const companyOverview = isFoundation || can(ctx, 'dashboard.view_cross_company')
      ? companies.filter((c) => c.kind !== 'FOUNDATION').map((c) => ({ id: c.id, name: c.name, active: c.isActive }))
      : null;

    // „Nächstes Meeting“ nur, wenn eins ansteht
    return { widgets: widgets.filter((w) => w.key !== 'meetings' || w.items?.length), companyOverview, isFoundation, important, prefs: await this.prefs(me.id) };
  }

  private prefs(userId: string) {
    return this.prisma.db.dashboardPreference.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' }, select: { widgetKey: true, isVisible: true } })
      .then((r) => r.map((p) => ({ key: p.widgetKey, visible: p.isVisible })));
  }

  /** Eigene Auswahl und Reihenfolge von Kacheln (kpi:…) und Widgets (w:…) speichern (ADR-057). */
  @RequirePermission('dashboard.view')
  @Put('prefs')
  async savePrefs(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Prefs)) body: z.infer<typeof Prefs>) {
    const db = this.prisma.db;
    await db.$transaction([
      db.dashboardPreference.deleteMany({ where: { userId: me.id } }),
      db.dashboardPreference.createMany({ data: body.items.map((i, n) => ({ userId: me.id, widgetKey: i.key, isVisible: i.visible, sortOrder: n })) }),
    ]);
    return this.prefs(me.id);
  }

  /** Leiste „Heute im Haus“ (ADR-057): Hauszahlen (Mews oder Demo), Wetter und Persönliches. Ab 18 Uhr zeigen die Hauszahlen morgen. */
  @RequirePermission('dashboard.view')
  @Get('today')
  async today(@CurrentUser() me: SessionUser, @Req() req: { policy: PolicyContext }) {
    const ctx = req.policy;
    const db = this.prisma.db;
    const companies = await db.company.findMany({ include: { branding: true } });
    const modules = enabledModules(ctx.companyIds, companies).filter((m) => can(ctx, MODULE_PERMISSION[m]));
    const now = new Date();
    const evening = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(now)) >= 18;
    const md = (d: Date) => new Intl.DateTimeFormat('en-CA', { month: '2-digit', day: '2-digit', timeZone: 'Europe/Berlin' }).format(d).replace('/', '-');
    const weekday = (d: Date) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'Europe/Berlin' }).format(d);
    const n = (x: number) => x.toLocaleString('de-DE');
    const tiles: Tile[] = [];

    // ---- Haus (Mews bzw. Demo) – nur Summen
    const house = await houseData();
    if (house.days && modules.some((m) => m === 'OCCUPANCY' || m === 'EVENTS' || m === 'SHIFTS')) {
      const d = evening ? house.days.tomorrow : house.days.today;
      const demo = house.demo;
      if (modules.includes('OCCUPANCY')) {
        tiles.push(
          { key: 'occupancy', label: 'Auslastung', value: `${d.occupancy} %`, sub: d.occupancy >= 98 ? 'Volles Haus 🎉' : evening ? `heute ${house.days.today.occupancy} %` : `morgen ${house.days.tomorrow.occupancy} %`, tone: d.occupancy >= 95 ? 'good' : undefined, demo },
          { key: 'arrivals', label: 'Anreisen', value: n(d.arrivals), sub: d.arrivalGroups ? `davon ${d.arrivalGroups} ${d.arrivalGroups === 1 ? 'Gruppe' : 'Gruppen'}` : 'keine Gruppe', demo },
          { key: 'departures', label: 'Abreisen', value: n(d.departures), sub: `${n(d.guests)} Gäste im Haus`, demo },
        );
        if (!evening) {
          const open = d.roomsToClean - d.roomsReady;
          tiles.push({ key: 'rooms', label: 'Zimmer fertig', value: `${d.roomsReady} / ${d.roomsToClean}`, sub: open > 0 ? `noch ${open} offen` : 'alle fertig ✓', tone: open > 0 && now.getTime() > berlinMidnight(0).getTime() + 14 * 36e5 ? 'warn' : undefined, demo });
        }
      }
      if (modules.includes('EVENTS') && (d.events || demo)) tiles.push({ key: 'events', label: 'Veranstaltungen', value: n(d.events), sub: d.events ? `${n(d.eventGuests)} Personen` : 'keine', demo });
      if (modules.includes('SHIFTS') && (d.onDuty || demo)) tiles.push({ key: 'duty', label: 'Im Dienst', value: n(d.onDuty), sub: d.onDutyTeams, demo });
    }
    if (house.weather) {
      const w = evening ? house.weather.tomorrow : house.weather.today;
      const [txt, ico] = weatherText(w.code);
      tiles.push({ key: 'weather', label: evening ? 'Wetter morgen' : 'Wetter', value: `${ico} ${w.temp}°`, sub: `${txt}${w.rain >= 30 ? ` (${w.rain} %)` : ''}${evening ? '' : ` · bis ${w.max}°`}`, demo: house.weather.demo });
    }

    // ---- Menschen: Geburtstage (freiwillig, ohne Jahr) und Neu & Jubiläen – nur im eigenen Haus
    const days = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * 864e5));
    const inHouse = { deactivatedAt: null, employeeProfile: { companyId: { in: ctx.companyIds } } };
    let celebrate: string | null = null;
    const mine = await db.user.findUnique({ where: { id: me.id }, include: { settings: true, employeeProfile: true } });
    if (mine?.settings?.birthdayMonthDay === md(now)) celebrate = `Alles Gute zum Geburtstag, ${mine.employeeProfile?.firstName ?? mine.displayName}! 🎂`;
    if (modules.includes('SOCIAL')) {
      const bdays = await db.user.findMany({ where: { ...inHouse, settings: { showBirthday: true, birthdayMonthDay: { in: days.map(md) } } }, select: { displayName: true, settings: { select: { birthdayMonthDay: true } }, employeeProfile: { select: { firstName: true } } } });
      const first = (u: (typeof bdays)[number]) => u.employeeProfile?.firstName ?? u.displayName;
      const today = bdays.filter((u) => u.settings!.birthdayMonthDay === md(now));
      const next = days.slice(1).map((d) => ({ d, u: bdays.find((u) => u.settings!.birthdayMonthDay === md(d)) })).find((x) => x.u);
      tiles.push({ key: 'birthdays', label: today.length === 1 ? 'Geburtstag' : 'Geburtstage', value: today.length ? `🎂 ${today.length}` : '–', sub: today.length ? today.map(first).join(', ') : next ? `nächster: ${first(next.u!)} (${weekday(next.d)})` : 'diese Woche keiner', href: today.length ? '/social' : undefined });
    }
    if (modules.includes('TEAM')) {
      const since = new Date(now.getTime() - 14 * 864e5);
      const profiles = await db.employeeProfile.findMany({ where: { companyId: { in: ctx.companyIds }, entryDate: { not: null, lte: now }, user: { deactivatedAt: null } }, select: { firstName: true, entryDate: true, user: { select: { settings: { select: { showWorkAnniversary: true } } } } } });
      const fresh = profiles.filter((p) => p.entryDate! >= since);
      const jubilee = profiles.filter((p) => p.user.settings?.showWorkAnniversary && md(p.entryDate!) === md(now) && p.entryDate!.getUTCFullYear() < now.getFullYear());
      const own = mine?.employeeProfile?.entryDate;
      if (own && md(own) === md(now) && own.getUTCFullYear() < now.getFullYear()) celebrate ??= `Heute vor ${now.getFullYear() - own.getUTCFullYear()} Jahren hast du bei uns angefangen – danke, dass du dabei bist! 🎉`;
      const parts = [fresh.length ? `neu: ${fresh.map((p) => p.firstName).join(', ')}` : '', ...jubilee.map((p) => `${now.getFullYear() - p.entryDate!.getUTCFullYear()} J.: ${p.firstName}`)].filter(Boolean);
      tiles.push({ key: 'team', label: 'Neu & Jubiläen', value: n(fresh.length + jubilee.length), sub: parts.join(' · ') || 'gerade niemand', href: '/team' });
    }

    // ---- Für dich heute: Aufgaben und Checklisten, die bis heute Abend fällig sind
    if (modules.includes('TASKS') || modules.includes('CHECKLISTS')) {
      const end = berlinMidnight(1);
      const visible = this.content.visibleWhere(me.id);
      const [tasks, overdue, runs] = await Promise.all([
        db.contentItem.count({ where: { type: 'TASK', ...visible, task: { dueAt: { lt: end }, status: { notIn: ['DONE', 'CANCELLED'] }, assignees: { some: { OR: [{ userId: me.id }, { groupId: { in: ctx.groupIds } }] } } } } }),
        db.contentItem.count({ where: { type: 'TASK', ...visible, task: { dueAt: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] }, assignees: { some: { OR: [{ userId: me.id }, { groupId: { in: ctx.groupIds } }] } } } } }),
        db.contentItem.count({ where: { type: 'CHECKLIST_RUN', ...visible, checklistRun: { dueAt: { lt: end }, status: { in: ['PLANNED', 'IN_PROGRESS'] }, OR: [{ assigneeUserId: null }, { assigneeUserId: me.id }] } } }),
      ]);
      tiles.push({ key: 'mine', label: 'Für dich heute', value: n(tasks + runs), sub: tasks + runs ? [tasks && `${tasks} ${tasks === 1 ? 'Aufgabe' : 'Aufgaben'}`, runs && `${runs} ${runs === 1 ? 'Checkliste' : 'Checklisten'}`].filter(Boolean).join(' · ') + (overdue ? ` · ${overdue} überfällig` : '') : 'nichts fällig ✓', tone: overdue ? 'warn' : undefined, href: tasks || !runs ? '/aufgaben' : '/checklisten' });
    }

    return { evening, asOf: house.days?.asOf ?? now.toISOString(), celebrate, tiles, weather: house.weather ? { ...house.weather.forecast, demo: house.weather.demo } : null };
  }
}

interface Tile { key: string; label: string; value: string; sub: string; href?: string; tone?: 'warn' | 'good'; demo?: boolean }
