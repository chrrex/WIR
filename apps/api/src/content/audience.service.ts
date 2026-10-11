import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { can, isWithin, PolicyContext } from '../policy/engine';

export type AudienceTarget =
  | { type: 'ALL' }
  | { type: 'COMPANY'; companyId: string }
  | { type: 'GROUP'; groupId: string }
  | { type: 'USER'; userId: string };

const LIVE = ['ACTIVE', 'INVITED'] as const;

/** Zielgruppen auflösen und Berechtigung zum Adressieren prüfen. */
@Injectable()
export class AudienceService {
  constructor(private readonly prisma: PrismaService) {}

  private async companyTree() {
    const companies = await this.prisma.db.company.findMany({ select: { id: true, parentId: true, kind: true, name: true, isActive: true } });
    const parent = new Map(companies.map((c) => [c.id, c.parentId]));
    return { companies, parent };
  }

  private async groupTree() {
    const groups = await this.prisma.db.group.findMany({ select: { id: true, parentGroupId: true, companyId: true, name: true } });
    return { groups, parent: new Map(groups.map((g) => [g.id, g.parentGroupId])) };
  }

  /** Alle Personen einer Zielgruppe. Externe nur bei Gruppen- oder Personenzielen (ADR-006). */
  async resolve(targets: AudienceTarget[]): Promise<string[]> {
    const db = this.prisma.db;
    const ids = new Set<string>();
    const { companies, parent } = await this.companyTree();
    const { groups, parent: gParent } = await this.groupTree();
    const now = new Date();
    for (const t of targets) {
      if (t.type === 'ALL') {
        (await db.user.findMany({ where: { status: { in: [...LIVE] }, userType: 'EMPLOYEE' }, select: { id: true } })).forEach((u) => ids.add(u.id));
      } else if (t.type === 'COMPANY') {
        const subtree = companies.filter((c) => isWithin(c.id, t.companyId, parent)).map((c) => c.id);
        const users = await db.user.findMany({
          where: {
            status: { in: [...LIVE] }, userType: 'EMPLOYEE',
            employeeProfile: { companyAssignments: { some: { companyId: { in: subtree }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] } } },
          },
          select: { id: true },
        });
        users.forEach((u) => ids.add(u.id));
      } else if (t.type === 'GROUP') {
        const subtree = groups.filter((g) => isWithin(g.id, t.groupId, gParent)).map((g) => g.id);
        const members = await db.groupMembership.findMany({
          where: { groupId: { in: subtree }, user: { status: { in: [...LIVE] } } },
          select: { userId: true },
        });
        members.forEach((m) => ids.add(m.userId));
      } else if (t.type === 'USER') {
        const u = await db.user.findFirst({ where: { id: t.userId, status: { in: [...LIVE] } }, select: { id: true } });
        if (u) ids.add(u.id);
      }
    }
    return [...ids];
  }

  /**
   * Darf die Person diese Zielgruppen für News nutzen? (ADR-037)
   * Gruppen der eigenen Gesellschaft immer; ganze Gesellschaft nur Teamleitungen und höher, alle Gesellschaften nur mit Recht an der Stiftung.
   */
  async assertNewsTargets(ctx: PolicyContext, targets: AudienceTarget[], open = false) {
    if (!targets.length) throw new BadRequestException('Bitte wähle mindestens eine Zielgruppe.');
    const { companies } = await this.companyTree();
    const groups = await this.prisma.db.group.findMany({ where: { id: { in: targets.filter((t) => t.type === 'GROUP').map((t) => (t as { groupId: string }).groupId) } } });
    for (const t of targets) {
      if (t.type === 'ALL') {
        const root = companies.find((c) => !c.parentId);
        if (!root || (!open && !can(ctx, 'news.publish_wide', { companyId: root.id }))) throw new ForbiddenException('An alle Gesellschaften darfst du nicht schreiben.');
      } else if (t.type === 'COMPANY') {
        if (!(open ? this.inOwnCompanies(ctx, t.companyId, companies) : await this.wideAllowed(ctx, t.companyId))) throw new ForbiddenException('An alle Mitarbeitenden der Gesellschaft schreiben Teamleitungen, Abteilungsleitungen und Direktion.');
      } else if (t.type === 'GROUP') {
        const g = groups.find((x) => x.id === t.groupId);
        if (!g) throw new BadRequestException('Diese Gruppe gibt es nicht.');
        if (!this.inOwnCompanies(ctx, g.companyId, companies)) throw new ForbiddenException(`An „${g.name}“ darfst du nicht schreiben.`);
      } else {
        throw new BadRequestException('News gehen an Gruppen oder Gesellschaften, nicht an einzelne Personen.');
      }
    }
  }

  /**
   * „Alle Mitarbeitenden“ einer Gesellschaft (ADR-045): mit news.publish_wide für die Gesellschaft –
   * oder als Teamleitung (Recht über die eigene Gruppe) für die Gesellschaft dieser Gruppe.
   */
  private async wideAllowed(ctx: PolicyContext, companyId: string) {
    if (can(ctx, 'news.publish_wide', { companyId })) return true;
    const groups = await this.prisma.db.group.findMany({ where: { id: { in: ctx.groupIds }, companyId }, select: { id: true } });
    return groups.some((g) => can(ctx, 'news.publish_wide', { groupId: g.id, companyId }));
  }

  /** Gruppe gehört zu einer der eigenen Gesellschaften (oder darunter, z. B. Stiftung → SGL). */
  private inOwnCompanies(ctx: PolicyContext, companyId: string | null, companies: Array<{ id: string; parentId: string | null }>) {
    const parent = new Map(companies.map((c) => [c.id, c.parentId]));
    return !!companyId && ctx.companyIds.some((c) => isWithin(companyId, c, parent));
  }

  /**
   * Übergaben (ADR-044): an beliebige Gruppen und einzelne Personen der eigenen Gesellschaften;
   * „ganze Gesellschaft“ bzw. „alle“ nur mit denselben Rechten wie bei News (ADR-037).
   */
  async assertHandoverTargets(ctx: PolicyContext, targets: AudienceTarget[]) {
    if (!targets.length) throw new BadRequestException('Bitte wähle mindestens eine Person oder Gruppe.');
    const { companies } = await this.companyTree();
    const mine = (companyId: string | null) => this.inOwnCompanies(ctx, companyId, companies);
    const groups = await this.prisma.db.group.findMany({ where: { id: { in: targets.filter((t) => t.type === 'GROUP').map((t) => (t as { groupId: string }).groupId) }, isActive: true } });
    const users = await this.prisma.db.user.findMany({ where: { id: { in: targets.filter((t) => t.type === 'USER').map((t) => (t as { userId: string }).userId) }, status: { in: [...LIVE] } }, select: { id: true } });
    for (const t of targets) {
      if (t.type === 'GROUP' && !groups.some((g) => g.id === t.groupId && mine(g.companyId))) throw new BadRequestException('Diese Gruppe kannst du nicht auswählen.');
      if (t.type === 'USER' && !users.some((u) => u.id === t.userId)) throw new BadRequestException('Diese Person gibt es nicht.');
      if (t.type === 'ALL' || t.type === 'COMPANY') await this.assertNewsTargets(ctx, [t]);
    }
  }

  /** Zielgruppen, die die Person für News auswählen kann (für das Formular). */
  /** open = Wissen mit Freigabe (ADR-045): ganze Stiftungsgruppe und eigene Gesellschaften für alle wählbar. */
  async newsOptions(ctx: PolicyContext, open = false) {
    const { companies } = await this.companyTree();
    const groups = await this.prisma.db.group.findMany({ where: { isActive: true }, include: { company: true }, orderBy: { name: 'asc' } });
    const root = companies.find((c) => !c.parentId);
    const options: Array<{ key: string; label: string; company?: string; target: AudienceTarget; wide: boolean }> = [];
    if (root && (open || can(ctx, 'news.publish_wide', { companyId: root.id }))) options.push({ key: 'ALL', label: 'Ganze Stiftungsgruppe (alle Gesellschaften)', target: { type: 'ALL' }, wide: true });
    for (const c of companies) {
      if (c.kind !== 'FOUNDATION' && c.isActive !== false && (open ? this.inOwnCompanies(ctx, c.id, companies) : await this.wideAllowed(ctx, c.id))) {
        options.push({ key: `C:${c.id}`, label: `Alle Mitarbeitenden · ${c.name}`, target: { type: 'COMPANY', companyId: c.id }, wide: true });
      }
    }
    for (const g of groups) {
      if (g.company?.isActive !== false && this.inOwnCompanies(ctx, g.companyId, companies)) options.push({ key: `G:${g.id}`, label: g.name, company: g.company?.name, target: { type: 'GROUP', groupId: g.id }, wide: false });
    }
    // Gesellschaft nur nennen, wenn Gruppen aus mehreren Gesellschaften wählbar sind
    const many = new Set(options.map((o) => o.company).filter(Boolean)).size > 1;
    return options.map(({ company, ...o }) => ({ ...o, label: many && company ? `${o.label} · ${company}` : o.label }));
  }

  /** Lesbare Bezeichnung der Zielgruppen eines Inhalts. */
  async describe(contentItemId: string): Promise<string[]> {
    const aud = await this.prisma.db.contentAudience.findMany({ where: { contentItemId }, include: { company: true, group: true, user: true } });
    return aud.map((a) =>
      a.targetType === 'ALL_USERS' ? 'Alle Gesellschaften'
        : a.targetType === 'COMPANY' ? `Alle · ${a.company?.name ?? ''}`
          : a.targetType === 'GROUP' ? a.group?.name ?? 'Gruppe'
            : a.user?.displayName ?? 'Person');
  }
}
