import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { formatOneTimeCode, generateOneTimeCode, hashOneTimeCode, SENSITIVE_PERMISSIONS } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PolicyService } from '../policy/policy.service';
import { can, companiesWith, PolicyContext } from '../policy/engine';
import { config } from '../common/config';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly policy: PolicyService) {}

  private async target(userId: string) {
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      include: { employeeProfile: true, userRoles: true, groupMemberships: { include: { group: true } } },
    });
    if (!u) throw new NotFoundException('Person nicht gefunden.');
    const companyId = u.employeeProfile?.companyId ?? u.userRoles.find((r) => r.companyId)?.companyId ?? null;
    return { u, companyId };
  }

  private assertScope(ctx: PolicyContext, permission: string, companyId: string | null) {
    if (!can(ctx, permission, { companyId })) throw new ForbiddenException('Diese Person liegt außerhalb deines Verantwortungsbereichs.');
  }

  /** Keine Eskalation über Codes: Ziel darf keine sensiblen Rechte haben, die man selbst nicht hat (RBAC §7). */
  private async assertNoEscalation(actor: PolicyContext, targetUserId: string) {
    const t = await this.policy.loadContext(targetUserId);
    const missing = SENSITIVE_PERMISSIONS.filter((p) => t.grants.has(p) && !actor.grants.has(p));
    if (missing.length) throw new ForbiddenException('Für diese Person darfst du keinen Code ausgeben – sie hat weitergehende Rechte als du.');
  }

  private async issueCode(actorId: string, userId: string) {
    const code = generateOneTimeCode();
    const expiresAt = new Date(Date.now() + config.oneTimeCodeHours * 3600_000);
    await this.prisma.db.$transaction([
      // ältere, unbenutzte Codes werden ungültig
      this.prisma.db.credentialReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.db.credentialReset.create({
        data: { userId, issuedById: actorId, tokenHash: hashOneTimeCode(userId, code, config.appSecret), channel: 'IN_PERSON', expiresAt },
      }),
    ]);
    return { code: formatOneTimeCode(code), expiresAt };
  }

  async listUsers(ctx: PolicyContext, status?: string) {
    const all = await this.prisma.db.company.findMany({ select: { id: true } });
    const allowed = companiesWith(ctx, 'users.read', all.map((c) => c.id));
    const users = await this.prisma.db.user.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(allowed === 'all' ? {} : {
          OR: [
            { employeeProfile: { companyId: { in: allowed } } },
            { employeeProfile: null, userRoles: { some: { companyId: { in: allowed } } } },
          ],
        }),
      },
      include: { employeeProfile: { include: { company: true } }, groupMemberships: { include: { group: true } } },
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id, username: u.username, displayName: u.displayName, status: u.status, userType: u.userType,
      source: u.employeeProfile?.source ?? 'LOCAL', personnelNumber: u.employeeProfile?.personnelNumber ?? null,
      jobTitle: u.employeeProfile?.jobTitle ?? null, company: u.employeeProfile?.company.name ?? null,
      groups: u.groupMemberships.map((m) => m.group.name), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt, validUntil: u.validUntil,
    }));
  }

  /** Freischalten nach Gastromatic-Import (ADR-021): Rolle Mitarbeitende + Einmal-Code zur persönlichen Übergabe. */
  async activate(ctx: PolicyContext, actorId: string, userId: string) {
    const { u, companyId } = await this.target(userId);
    this.assertScope(ctx, 'users.manage', companyId);
    if (u.status !== 'PROVISIONED') throw new BadRequestException('Diese Person ist bereits freigeschaltet.');
    const employee = await this.prisma.db.role.findUniqueOrThrow({ where: { key: 'employee' } });
    await this.prisma.db.$transaction([
      this.prisma.db.user.update({ where: { id: userId }, data: { status: 'INVITED', activatedAt: new Date(), mustChangePassword: true } }),
      this.prisma.db.userRole.create({ data: { userId, roleId: employee.id, grantedById: actorId } }),
    ]);
    const issued = await this.issueCode(actorId, userId);
    await this.audit.log({ actorId, companyId, action: 'user.activated', entityType: 'user', entityId: userId, metadata: { role: 'employee' } });
    await this.audit.log({ actorId, companyId, action: 'user.one_time_code_issued', entityType: 'user', entityId: userId, metadata: { channel: 'IN_PERSON' } });
    return { ...issued, username: u.username, displayName: u.displayName };
  }

  /** Neuer Einmal-Code (Passwort vergessen / Erstzugang erneut). */
  async newCode(ctx: PolicyContext, actorId: string, userId: string) {
    const { u, companyId } = await this.target(userId);
    this.assertScope(ctx, 'users.reset_password', companyId);
    if (u.status === 'PROVISIONED') throw new BadRequestException('Bitte die Person zuerst freischalten.');
    if (u.status === 'DEACTIVATED') throw new BadRequestException('Der Zugang ist deaktiviert.');
    if (u.id === actorId) throw new BadRequestException('Für dich selbst kannst du keinen Code erzeugen.');
    await this.assertNoEscalation(ctx, userId);
    const issued = await this.issueCode(actorId, userId);
    await this.prisma.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.prisma.db.user.update({ where: { id: userId }, data: { mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } });
    await this.audit.log({ actorId, companyId, action: 'user.one_time_code_issued', entityType: 'user', entityId: userId, metadata: { channel: 'IN_PERSON' } });
    return { ...issued, username: u.username, displayName: u.displayName };
  }

  async deactivate(ctx: PolicyContext, actorId: string, userId: string) {
    const { u, companyId } = await this.target(userId);
    this.assertScope(ctx, 'users.deactivate', companyId);
    if (u.id === actorId) throw new BadRequestException('Du kannst dich nicht selbst deaktivieren.');
    await this.assertNoEscalation(ctx, userId);
    await this.prisma.db.$transaction([
      this.prisma.db.user.update({ where: { id: userId }, data: { status: 'DEACTIVATED', deactivatedAt: new Date() } }),
      this.prisma.db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ actorId, companyId, action: 'user.deactivated', entityType: 'user', entityId: userId });
    return { ok: true };
  }

  async auditLog(ctx: PolicyContext, limit: number) {
    const all = await this.prisma.db.company.findMany({ select: { id: true } });
    const allowed = companiesWith(ctx, 'audit.read', all.map((c) => c.id));
    const rows = await this.prisma.db.auditLog.findMany({
      where: allowed === 'all' ? {} : { companyId: { in: allowed } },
      include: { actor: { select: { displayName: true } } },
      orderBy: { occurredAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const ids = rows.filter((r) => r.entityType === 'user' && r.entityId).map((r) => r.entityId!);
    const names = new Map((await this.prisma.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({
      id: r.id, at: r.occurredAt, actor: r.actor?.displayName ?? (r.actorType === 'SYSTEM' ? 'System' : '–'), action: r.action,
      target: r.entityType === 'user' && r.entityId ? names.get(r.entityId) ?? null : null,
    }));
  }
}
