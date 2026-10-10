import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';

/** Personensuche für Chat und Erwähnungen – nur Name, Tätigkeit, Team (keine privaten Daten). */
@Controller('people')
export class PeopleController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  @RequirePermission('chat.use')
  @Get()
  async search(@CurrentUser() me: SessionUser, @Query('q') q = '') {
    const ctx = await this.policy.loadContext(me.id);
    const directory = can(ctx, 'employees.directory');
    const users = await this.prisma.db.user.findMany({
      where: {
        id: { not: me.id }, status: 'ACTIVE', userType: { not: 'SERVICE' },
        displayName: { contains: q.trim().slice(0, 60), mode: 'insensitive' },
        // Ohne Verzeichnisrecht (Externe): nur Personen der eigenen Gesellschaften
        ...(directory ? {} : { employeeProfile: { companyAssignments: { some: { companyId: { in: ctx.companyIds } } } } }),
      },
      include: { employeeProfile: { select: { jobTitle: true } }, groupMemberships: { include: { group: { select: { name: true } } } } },
      orderBy: { displayName: 'asc' },
      take: 12,
    });
    return users.map((u) => ({ id: u.id, name: u.displayName, job: u.employeeProfile?.jobTitle ?? (u.userType === 'EXTERNAL' ? 'extern' : null), groups: u.groupMemberships.map((m) => m.group.name) }));
  }

  /** Team-Verzeichnis: Kolleg:innen der eigenen Gesellschaften, nach Bereich (nur dienstliche Angaben). */
  @RequirePermission('employees.directory')
  @Get('directory')
  async directory(@CurrentUser() me: SessionUser) {
    const ctx = await this.policy.loadContext(me.id);
    const users = await this.prisma.db.user.findMany({
      where: { status: 'ACTIVE', userType: 'EMPLOYEE', employeeProfile: { companyAssignments: { some: { companyId: { in: ctx.companyIds } } } } },
      include: { employeeProfile: { select: { jobTitle: true } }, groupMemberships: { include: { group: { select: { name: true } } } } },
      orderBy: { displayName: 'asc' }, take: 1000,
    });
    return users.map((u) => ({ id: u.id, name: u.displayName, job: u.employeeProfile?.jobTitle ?? null, groups: u.groupMemberships.map((m) => m.group.name), lead: u.groupMemberships.some((m) => m.isLead) }));
  }
}
