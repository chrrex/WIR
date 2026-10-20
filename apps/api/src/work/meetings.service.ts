import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { MeetingRole, MeetingSeries, Prisma } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { ContentService } from '../content/content.service';
import { NotificationService } from '../notifications/notification.service';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { AudienceTarget } from '../content/audience.service';
import { nextOccurrence } from './recurrence';

const H = 3600_000;
export const TEMPLATE = ['Rückblick Aufgaben', 'Gästefeedback', 'Dienstplan', 'Sonstiges'];
const OPEN_TASK = { notIn: ['DONE' as const, 'CANCELLED' as const] };
/** Ideen mit so viel Zuspruch schlagen sich selbst fürs nächste Meeting vor. */
export const IDEA_LIKES = 3;

export const when = (d: Date) => new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);
export const dayOf = (d: Date) => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }).format(d);
const clock = (d: Date) => new Intl.DateTimeFormat('de-DE', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(d);

export const LINK_INCLUDE = { contentItem: { include: { task: { include: { assignees: { include: { user: { select: { displayName: true } } } } } }, post: true, handover: true, knowledgeArticle: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { title: true } } } } } } } satisfies Prisma.MeetingLinkInclude;

export const MEETING_INCLUDE = {
  attendees: true, addenda: { orderBy: { createdAt: 'asc' } }, series: true,
  items: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      decisions: { orderBy: { createdAt: 'asc' } },
      links: { include: LINK_INCLUDE },
    },
  },
} satisfies Prisma.MeetingInclude;
export type FullMeeting = Prisma.MeetingGetPayload<{ include: typeof MEETING_INCLUDE }>;
type Item = FullMeeting['items'][number];

export interface Roles { lead: boolean; minutes: boolean; timekeeper: boolean; attendee: boolean }

interface InstanceInput {
  companyId: string; title: string; startsAt: Date; durationMin: number; location?: string | null; onlineUrl?: string | null;
  groupId?: string | null; userIds: string[]; guests?: Array<{ name: string; org?: string | null; email?: string | null }>;
  standardItems: string[]; leadId: string; minutesId?: string | null; timekeeperId?: string | null; agendaLeadHours: number; series?: MeetingSeries | null;
}

/** Meetings (ADR-061): Termine anlegen, Rollen, Sichtbarkeit vertraulicher Punkte, Übertrag, Erinnerungen, Aufbewahrung. */
@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService, private readonly notifications: NotificationService, private readonly policy: PolicyService) {}

  /** Termin mit allem, was dazugehört – nur für Teilnehmende (Empfänger:innen des Inhalts). */
  async load(me: string, id: string) {
    const item = await this.content.getVisible(me, id);
    const m = await this.prisma.db.meeting.findUnique({ where: { id }, include: MEETING_INCLUDE });
    if (!m) throw new NotFoundException('Dieses Meeting gibt es nicht.');
    const ctx = await this.policy.loadContext(me);
    const mine = m.attendees.find((a) => a.userId === me);
    const lead = mine?.role === 'LEAD' || item.authorId === me || can(ctx, 'meetings.manage_any', { companyId: item.companyId });
    const minutes = lead || mine?.role === 'MINUTES';
    const roles: Roles = { lead, minutes, timekeeper: minutes || mine?.role === 'TIMEKEEPER', attendee: !!mine };
    return { m, item, ctx, roles };
  }

  /** Vertrauliche Punkte sehen nur Ausgewählte, Leitung, Protokoll und wer sie eingebracht hat. */
  sees(i: { confidential: boolean; authorId: string | null; ownerId: string | null; viewerIds: string[] }, me: string, roles: Roles) {
    return !i.confidential || roles.minutes || i.authorId === me || i.ownerId === me || i.viewerIds.includes(me);
  }

  assertOpen(m: { status: string }, also: string[] = []) {
    if (m.status === 'LOCKED') throw new BadRequestException('Das Protokoll ist festgeschrieben – nur noch Nachträge sind möglich.');
    if (m.status === 'CANCELLED') throw new BadRequestException('Dieses Meeting fällt aus.');
    if (also.includes(m.status)) throw new BadRequestException('Das geht in diesem Schritt nicht mehr.');
  }

  need(ok: boolean, msg = 'Das darf die Meetingleitung.') { if (!ok) throw new ForbiddenException(msg); }

  async names(ids: Array<string | null | undefined>) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const users = list.length ? await this.prisma.db.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  /** Was aus einem Punkt entstanden ist – mit dem aktuellen Stand (auch im festgeschriebenen Protokoll). */
  linkRow(l: Item['links'][number]) {
    const c = l.contentItem;
    if (l.kind === 'CHECKLIST') return { id: l.checklistId!, kind: l.kind, decisionId: l.decisionId, title: 'Checkliste', status: null, href: `/checklisten/neu?id=${l.checklistId}` };
    const t = c?.task;
    const title = t?.title ?? c?.post?.title ?? c?.handover?.subject ?? c?.knowledgeArticle?.versions[0]?.title ?? '–';
    const href = { TASK: '/aufgaben/', NEWS: '/news/', HANDOVER: '/uebergaben/', KNOWLEDGE: '/wissen/' }[l.kind as 'TASK'] + l.contentItemId;
    const status = t ? t.status : c?.status === 'DRAFT' ? 'DRAFT' : c?.status ?? null;
    return { id: l.contentItemId!, kind: l.kind, decisionId: l.decisionId, title, status, href, assignee: t?.assignees.map((a) => a.user?.displayName).filter(Boolean).join(', ') || null, dueAt: t?.dueAt ?? null };
  }

  /** Neuer Termin – einzeln oder als nächster einer Serie (mit Übertrag, Wiedervorlagen und Vorlage). */
  async createInstance(authorId: string, x: InstanceInput) {
    const db = this.prisma.db;
    const targets: AudienceTarget[] = [...(x.groupId ? [{ type: 'GROUP' as const, groupId: x.groupId }] : []), ...[...new Set([x.leadId, ...x.userIds])].map((userId) => ({ type: 'USER' as const, userId }))];
    const role = (u: string): MeetingRole | null => (u === x.leadId ? 'LEAD' : u === x.minutesId ? 'MINUTES' : u === x.timekeeperId ? 'TIMEKEEPER' : null);
    const { item, recipientIds } = await this.content.create({
      type: 'MEETING', companyId: x.companyId, authorId, targets, reactionsEnabled: false, commentsEnabled: true,
      createSubtype: async (tx, id) => {
        await tx.meeting.create({ data: { id, seriesId: x.series?.id ?? null, title: x.title, startsAt: x.startsAt, durationMin: x.durationMin, location: x.location || null, onlineUrl: x.onlineUrl || null, agendaDeadline: new Date(x.startsAt.getTime() - x.agendaLeadHours * H) } });
      },
    });
    const people = [...new Set([authorId, x.leadId, ...recipientIds])];
    await db.meetingAttendee.createMany({ data: [
      ...people.map((userId) => ({ meetingId: item.id, userId, role: role(userId) })),
      ...(x.guests ?? []).map((g) => ({ meetingId: item.id, guestName: g.name, guestOrg: g.org || null, guestEmail: g.email || null })),
    ], skipDuplicates: true });
    let n = 0;
    const add = (d: Omit<Prisma.AgendaItemCreateManyInput, 'meetingId' | 'sortOrder'>) => ({ ...d, meetingId: item.id, sortOrder: n++ });
    const rows: Prisma.AgendaItemCreateManyInput[] = [];
    const std = (title: string) => add({ title, origin: 'STANDARD', durationMin: 5, authorId: x.leadId, ownerId: x.leadId });
    rows.push(...x.standardItems.filter((t) => t !== 'Sonstiges').map(std));
    if (x.series) {
      // Vertagtes und fällige Wiedervorlagen aus früheren Terminen der Serie
      const due = await db.agendaItem.findMany({ where: { carriedAt: null, meeting: { seriesId: x.series.id, id: { not: item.id } }, OR: [{ status: 'POSTPONED' }, { followUpOn: { lte: x.startsAt } }] }, orderBy: { createdAt: 'asc' } });
      for (const d of due) rows.push(add({ title: d.status === 'POSTPONED' ? d.title : `Wiedervorlage: ${d.title}`, description: d.description, authorId: d.authorId, ownerId: d.ownerId, durationMin: d.durationMin, confidential: d.confidential, viewerIds: d.viewerIds, sourcePath: d.sourcePath, origin: d.status === 'POSTPONED' ? 'CARRIED' : 'FOLLOW_UP', carriedFromId: d.id }));
      if (due.length) await db.agendaItem.updateMany({ where: { id: { in: due.map((d) => d.id) } }, data: { carriedAt: new Date() } });
    }
    rows.push(...x.standardItems.filter((t) => t === 'Sonstiges').map(std)); // „Sonstiges“ immer zuletzt
    if (rows.length) await db.agendaItem.createMany({ data: rows });
    return item;
  }

  /** Neue Person nachträglich einladen: sieht das Meeting ab sofort. */
  async addPerson(meetingId: string, userId: string) {
    const db = this.prisma.db;
    await db.contentAudience.create({ data: { contentItemId: meetingId, targetType: 'USER', userId } });
    await db.contentRecipient.upsert({ where: { contentItemId_userId: { contentItemId: meetingId, userId } }, create: { contentItemId: meetingId, userId }, update: { removedAt: null } });
  }

  /** Alle Teilnehmenden mit Zugang benachrichtigen. */
  async tell(m: { id: string; attendees: Array<{ userId: string | null }> }, actorId: string | undefined, title: string, body: string, key: string, important = false) {
    return this.notifications.notify({ recipientIds: m.attendees.map((a) => a.userId!).filter(Boolean), actorId, eventType: 'meeting', importance: important ? 'IMPORTANT' : 'NORMAL', title, body, linkPath: `/meetings/${m.id}`, contentItemId: m.id, dedupeKey: key });
  }

  // ---------------------------------------------------------------- Hintergrund (alle 5 Minuten aus dem JobsService)

  async run(now = new Date()) {
    return { meetings: await this.nextOfSeries(now), reminders: await this.reminders(now), purged: await this.purge(now) };
  }

  /** Je Serie steht der nächste Termin spätestens 8 Tage vorher im WIR – Punkte lassen sich früh sammeln. */
  private async nextOfSeries(now: Date) {
    const db = this.prisma.db;
    const series = await db.meetingSeries.findMany({ where: { isActive: true, recurrenceRule: { not: null } } });
    let made = 0;
    for (const s of series) {
      const last = await db.meeting.findFirst({ where: { seriesId: s.id }, orderBy: { startsAt: 'desc' } });
      if (last && last.startsAt > now) continue;
      const at = nextOccurrence(s.recurrenceRule!, now);
      if (at.getTime() - now.getTime() > 8 * 24 * H) continue;
      await this.createInstance(s.leadId, { companyId: s.companyId, title: s.title, startsAt: at, durationMin: s.durationMin, location: s.location, onlineUrl: s.onlineUrl, groupId: s.groupId,
        userIds: [...s.memberIds, s.minutesId, s.timekeeperId].filter((x): x is string => !!x),
        standardItems: s.standardItems, leadId: s.leadId, minutesId: s.minutesId, timekeeperId: s.timekeeperId, agendaLeadHours: s.agendaLeadHours, series: s });
      made++;
    }
    return made;
  }

  /** „Punkte bis Montag 12 Uhr“ ans Team, „Agenda festlegen“ an die Leitung, kurz vor Beginn an alle. */
  private async reminders(now: Date) {
    const db = this.prisma.db;
    const soon = await db.meeting.findMany({ where: { status: { in: ['PLANNED', 'AGENDA_SET'] }, startsAt: { gt: now, lte: new Date(now.getTime() + 3 * 24 * H) } }, include: { attendees: true, items: { select: { origin: true, status: true } } } });
    let n = 0;
    for (const m of soon) {
      const d = m.agendaDeadline;
      if (m.status === 'PLANNED' && d && now >= new Date(d.getTime() - 24 * H) && now < d) {
        n += await this.tell(m, undefined, `Punkte fürs ${m.title} bis ${clock(d)} Uhr`, `Was soll am ${when(m.startsAt)} besprochen werden? Trag deinen Punkt ein.`, `meeting-items:${m.id}`);
      }
      if (m.status === 'PLANNED' && d && now >= d) {
        const lead = m.attendees.filter((a) => a.role === 'LEAD').map((a) => a.userId!);
        const own = m.items.filter((i) => i.origin !== 'STANDARD' && !['MERGED', 'PARKED'].includes(i.status)).length;
        n += await this.notifications.notify({ recipientIds: lead, eventType: 'meeting', importance: 'IMPORTANT', linkPath: `/meetings/${m.id}`, contentItemId: m.id, dedupeKey: `meeting-agenda:${m.id}`,
          title: own ? `Agenda festlegen: ${m.title}` : `Keine Punkte für ${m.title} – Meeting ausfallen lassen?`,
          body: own ? `${own} ${own === 1 ? 'Punkt ist' : 'Punkte sind'} eingegangen. Bitte sortieren und verteilen – Termin ${when(m.startsAt)}.` : `Bis jetzt hat niemand etwas eingebracht. Termin ${when(m.startsAt)}.` });
      }
      if (now.getTime() >= m.startsAt.getTime() - 15 * 60_000) {
        n += await this.tell(m, undefined, `Gleich: ${m.title} um ${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(m.startsAt)} Uhr`, [m.location, m.onlineUrl && 'Online-Link im Meeting'].filter(Boolean).join(' · '), `meeting-start:${m.id}`);
      }
    }
    return n;
  }

  /** Aufbewahrungsfrist abgelaufen → Protokoll endgültig löschen (je Serie einstellbar, Standard 3 Jahre). */
  private async purge(now: Date) {
    const db = this.prisma.db;
    const old = await db.meeting.findMany({ where: { retainUntil: { lt: now } }, select: { id: true } });
    for (const o of old) {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('wir.purge', 'on', true)`;
        await tx.contentItem.delete({ where: { id: o.id } });
      });
    }
    return old.length;
  }

  // ---------------------------------------------------------------- Startseite

  /** Kachel „Nächstes Meeting“: Termin, eigene Punkte, offene Aufgaben aus Meetings. */
  async nextFor(me: string) {
    const db = this.prisma.db;
    const m = await db.meeting.findFirst({ where: { status: { in: ['PLANNED', 'AGENDA_SET', 'LIVE'] }, startsAt: { gt: new Date(Date.now() - 3 * H) }, contentItem: this.content.visibleWhere(me) },
      include: { items: { where: { OR: [{ ownerId: me }, { authorId: me }], status: { notIn: ['MERGED', 'PARKED'] }, origin: { not: 'STANDARD' } }, select: { title: true } } }, orderBy: { startsAt: 'asc' } });
    const tasks = await db.contentItem.findMany({ where: { type: 'TASK', ...this.content.visibleWhere(me), meetingOrigin: { isNot: null }, task: { status: OPEN_TASK, assignees: { some: { userId: me } } } }, include: { task: true }, orderBy: { task: { dueAt: { sort: 'asc', nulls: 'last' } } }, take: 3 });
    return { m, tasks };
  }
}

// ---------------------------------------------------------------- Outlook / Kalender (ADR-061)

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Zeilen nach RFC 5545 auf 75 Zeichen falten */
const fold = (l: string) => l.match(/.{1,73}/gu)!.join('\r\n ');
const local = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d).replace(/[-:]/g, '').replace(' ', 'T');
const BERLIN = ['BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];

/** Kalenderdatei (.ics) für Outlook & Co. – bei Serien mit Wiederholung, Uhrzeit in Berliner Zeit (auch über die Zeitumstellung). */
export function icsFor(m: { id: string; title: string; startsAt: Date; durationMin: number; location: string | null; onlineUrl: string | null; seriesId: string | null }, rule: string | null, url: string) {
  const r = rule ? Object.fromEntries(rule.split(';').map((x) => x.split('='))) : null;
  const end = new Date(m.startsAt.getTime() + m.durationMin * 60_000);
  const text = [`Agenda, Punkte und Protokoll im WIR: ${url}`, m.onlineUrl && `Online teilnehmen: ${m.onlineUrl}`].filter(Boolean).join('\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WIR Mitarbeiterportal//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...BERLIN, 'BEGIN:VEVENT',
    `UID:${rule && m.seriesId ? `serie-${m.seriesId}` : m.id}@wir`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Berlin:${local(m.startsAt)}`, `DTEND;TZID=Europe/Berlin:${local(end)}`, ...(r ? [`RRULE:FREQ=WEEKLY;BYDAY=${r.BYDAY}`] : []),
    `SUMMARY:${esc(m.title)}`, ...(m.location || m.onlineUrl ? [`LOCATION:${esc(m.location ?? 'Microsoft Teams')}`] : []), `DESCRIPTION:${esc(text)}`, `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(m.title)}`, 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Neuer Termin in Outlook (Web) mit allen Teilnehmenden vorausgefüllt – dort nur noch „Senden“. */
export function outlookCompose(m: { title: string; startsAt: Date; durationMin: number; location: string | null; onlineUrl: string | null }, to: string[], url: string, weekly: string | null) {
  const q = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: m.title, startdt: m.startsAt.toISOString(), enddt: new Date(m.startsAt.getTime() + m.durationMin * 60_000).toISOString(),
    location: m.location ?? (m.onlineUrl ? 'Microsoft Teams' : ''), to: to.join(','),
    body: [`Agenda und Punkte im WIR: ${url}`, m.onlineUrl && `Online teilnehmen: ${m.onlineUrl}`, weekly && `Bitte als Serie speichern: ${weekly}.`].filter(Boolean).join('\n'),
  });
  return `https://outlook.office.com/calendar/deeplink/compose?${q}`;
}
