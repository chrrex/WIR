import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PolicyContext, Scope } from './engine';

/** Lädt den Berechtigungskontext einer Person aus der Datenbank (einmal pro Request). */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async loadContext(userId: string): Promise<PolicyContext> {
    const db = this.prisma.db;
    const now = new Date();
    const [user, companies, groups] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        include: {
          employeeProfile: { include: { companyAssignments: true } },
          groupMemberships: true,
          userRoles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      }),
      db.company.findMany({ select: { id: true, parentId: true, isActive: true } }),
      db.group.findMany({ select: { id: true, parentGroupId: true } }),
    ]);

    const companyParent = new Map(companies.map((c) => [c.id, c.parentId]));
    const groupParent = new Map(groups.map((g) => [g.id, g.parentGroupId]));

    if (!user) {
      return { userId, active: false, companyIds: [], groupIds: [], grants: new Map(), companyParent, groupParent };
    }

    const active = user.status === 'ACTIVE' && (!user.validUntil || user.validUntil > now);

    const companyIds = new Set<string>();
    for (const a of user.employeeProfile?.companyAssignments ?? []) {
      if (a.validFrom <= now && (!a.validTo || a.validTo >= now)) companyIds.add(a.companyId);
    }
    if (user.employeeProfile) companyIds.add(user.employeeProfile.companyId);

    const groupIds = new Set<string>();
    for (const m of user.groupMemberships) {
      let g: string | null | undefined = m.groupId;
      while (g && !groupIds.has(g)) { groupIds.add(g); g = groupParent.get(g) ?? null; }
    }

    const grants = new Map<string, Scope[]>();
    for (const ur of user.userRoles) {
      if (ur.validUntil && ur.validUntil <= now) continue;
      const scope: Scope = ur.companyId ? { type: 'company', id: ur.companyId } : ur.groupId ? { type: 'group', id: ur.groupId } : { type: 'global' };
      // Externe ohne Profil gehören zur Gesellschaft ihrer Rollen (ADR-006)
      if (!user.employeeProfile && ur.companyId) companyIds.add(ur.companyId);
      for (const rp of ur.role.permissions) {
        const list = grants.get(rp.permission.key) ?? [];
        list.push(scope);
        grants.set(rp.permission.key, list);
      }
    }

    return { userId, active, companyIds: [...companyIds], groupIds: [...groupIds], grants, companyParent, groupParent };
  }
}
