import { Controller, Get, Req } from '@nestjs/common';
import type { AppModule } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { can, PolicyContext } from '../policy/engine';
import { MODULE_PERMISSION, enabledModules } from '../me/branding';
import { ContentService } from '../content/content.service';

interface Widget {
  key: string;
  title: string;
  module: AppModule | null;
  /** coming = Rahmen steht, Inhalte folgen in der genannten Phase */
  state: 'ready' | 'coming';
  items?: Array<{ id: string; title: string; meta: string; unread: boolean; important?: boolean; href: string }>;
  count?: number;
  phase?: number;
  text: string;
}

const WIDGETS: Array<Omit<Widget, 'state'> & { readyInPhase: number }> = [
  { key: 'news', title: 'News', module: 'NEWS', readyInPhase: 2, text: 'Neuigkeiten aus deinem Team und dem ganzen Haus.' },
  { key: 'handovers', title: 'Übergaben', module: 'HANDOVERS', readyInPhase: 2, text: 'Was die vorige Schicht dir mitgibt.' },
  { key: 'social', title: 'Neu bei Social', module: 'SOCIAL', readyInPhase: 2, text: 'Grüße, Glückwünsche, Biete & Suche.' },
  { key: 'tasks', title: 'Meine Aufgaben', module: 'TASKS', readyInPhase: 4, text: 'Deine offenen Aufgaben mit Fälligkeit.' },
  { key: 'checklists', title: 'Checklisten heute', module: 'CHECKLISTS', readyInPhase: 4, text: 'HACCP- und Schichtchecklisten, die heute fällig sind.' },
  { key: 'events', title: 'Veranstaltungen & Räume heute', module: 'EVENTS', readyInPhase: 5, text: 'Aus dem Eventtool – sobald die Anbindung steht.' },
  { key: 'shift', title: 'Mein Dienstplan', module: 'SHIFTS', readyInPhase: 5, text: 'Aus Gastromatic – sobald die Anbindung geprüft ist.' },
  { key: 'occupancy', title: 'Haus heute', module: 'OCCUPANCY', readyInPhase: 5, text: 'Belegung in %, An- und Abreisen aus Flexkeeping.' },
  { key: 'surveys', title: 'Offene Umfrage', module: 'SURVEYS', readyInPhase: 4, text: 'Kurze, auf Wunsch anonyme Umfragen.' },
];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly prisma: PrismaService, private readonly content: ContentService) {}

  @RequirePermission('dashboard.view')
  @Get()
  async get(@CurrentUser() me: SessionUser, @Req() req: { policy: PolicyContext }) {
    const ctx = req.policy;
    const companies = await this.prisma.db.company.findMany({ include: { branding: true }, orderBy: { name: 'asc' } });
    const modules = enabledModules(ctx.companyIds, companies).filter((m) => can(ctx, MODULE_PERMISSION[m]));
    const isFoundation = companies.some((c) => ctx.companyIds.includes(c.id) && c.kind === 'FOUNDATION');

    const widgets: Widget[] = WIDGETS.filter((w) => !w.module || modules.includes(w.module)).map(({ readyInPhase, ...w }) => ({
      ...w, state: readyInPhase <= 2 ? 'ready' : 'coming', phase: readyInPhase,
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
        const rows = await db.contentItem.findMany({ where: { type: 'POST', post: { kind: 'SOCIAL' }, ...visible }, include: { post: true, author: { select: { displayName: true } } }, orderBy: { publishedAt: 'desc' }, take: 2 });
        w.items = rows.map((r) => ({ id: r.id, title: r.post!.title, meta: r.author?.displayName ?? '', unread: false, href: `/social/${r.id}` }));
      }
    }

    // Gruppenweite Sicht (ADR-039): Überblick über die Gesellschaften statt Hauskennzahlen
    const companyOverview = isFoundation || can(ctx, 'dashboard.view_cross_company')
      ? companies.filter((c) => c.kind !== 'FOUNDATION').map((c) => ({ id: c.id, name: c.name, active: c.isActive }))
      : null;

    return { widgets, companyOverview, isFoundation, important };
  }
}
