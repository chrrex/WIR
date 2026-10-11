import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { SENSITIVE_PERMISSIONS } from '@wir/db';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequirePermission, SessionUser } from '../auth/decorators';
import { can, companiesWith, PolicyContext } from '../policy/engine';
import { contrastWithWhite } from './contrast';
import { AdminService } from './admin.service';

type Req = { policy: PolicyContext };
const GROUP_TYPES = ['DEPARTMENT', 'TEAM', 'LOCATION', 'PROJECT', 'CUSTOM'] as const;
const MODULES = ['NEWS', 'SOCIAL', 'CHAT', 'KNOWLEDGE', 'DOCUMENTS', 'TASKS', 'CHECKLISTS', 'HANDOVERS', 'SHIFTS', 'OCCUPANCY', 'EVENTS', 'SURVEYS', 'IDEAS', 'CONTACTS', 'TEAM'] as const;
const date = z.iso.date().nullish();
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Farbe bitte als #RRGGBB.');

const PersonPatch = z.object({ displayName: z.string().trim().min(2).max(80).optional(), jobTitle: z.string().trim().max(120).nullish(), validUntil: date });
const NewPerson = z.object({
  firstName: z.string().trim().min(1).max(60), lastName: z.string().trim().min(1).max(60),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, 'Benutzername: 3–40 Zeichen, nur a–z, 0–9, Punkt, Strich.'),
  external: z.boolean().default(false), companyId: z.uuid(), jobTitle: z.string().trim().max(120).nullish(), validUntil: date,
  groupIds: z.array(z.uuid()).max(20).default([]),
}).refine((p) => !p.external || p.validUntil, 'Externe Zugänge brauchen ein Ablaufdatum.');
const Grant = z.object({ roleKey: z.string().max(60), companyId: z.uuid().nullish(), groupId: z.uuid().nullish(), validUntil: date });
const GroupBody = z.object({ name: z.string().trim().min(2).max(80), type: z.enum(GROUP_TYPES), companyId: z.uuid().nullish(), parentGroupId: z.uuid().nullish(), description: z.string().trim().max(300).nullish() });
const Member = z.object({ userId: z.uuid(), isLead: z.boolean().default(false) });
const CompanyPatch = z.object({
  disabledModules: z.array(z.enum(MODULES)).optional(),
  readListVisibility: z.enum(['AUTHOR_AND_LEADS', 'ALL_RECIPIENTS']).optional(),
  branding: z.object({ displayName: z.string().trim().min(2).max(80), primaryColor: hex, surfaceColor: hex.nullish(), footerText: z.string().trim().max(120).nullish() }).partial().optional(),
});
const RoleBody = z.object({ name: z.string().trim().min(2).max(60), description: z.string().trim().max(200).nullish(), permissions: z.array(z.string().max(60)).max(120) });

/**
 * Verwaltung (ADR-055): Personen bearbeiten, Teams & Gruppen, Einstellungen je Haus, Rollen & Rechte.
 * Jede Änderung im Rahmen des eigenen Bereichs (Gesellschaft) und ohne Rechte-Ausweitung; alles im Protokoll.
 */
@Controller('admin')
export class ManageController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly admin: AdminService) {}

  private async allowedCompanies(ctx: PolicyContext, perm: string) {
    const all = await this.prisma.db.company.findMany({ select: { id: true } });
    const a = companiesWith(ctx, perm, all.map((c) => c.id));
    return a === 'all' ? all.map((c) => c.id) : a;
  }
  private scope(ctx: PolicyContext, perm: string, companyId: string | null) {
    if (!can(ctx, perm, companyId ? { companyId } : undefined) || (!companyId && companiesWith(ctx, perm, []) !== 'all'))
      throw new ForbiddenException('Das liegt außerhalb deines Verantwortungsbereichs.');
  }
  private async person(id: string) {
    const u = await this.prisma.db.user.findUnique({ where: { id }, include: { employeeProfile: { include: { company: true } }, userRoles: { include: { role: true, company: true, group: true } }, groupMemberships: { include: { group: true } } } });
    if (!u) throw new NotFoundException('Person nicht gefunden.');
    return { u, companyId: u.employeeProfile?.companyId ?? u.userRoles.find((r) => r.companyId)?.companyId ?? null };
  }
  /** Rechte, die jemand nicht selbst hat, kann er nicht weitergeben (RBAC §7). */
  private async assertGrantable(ctx: PolicyContext, permissionKeys: string[]) {
    const missing = permissionKeys.filter((p) => (SENSITIVE_PERMISSIONS as readonly string[]).includes(p) && !ctx.grants.has(p));
    if (missing.length) throw new ForbiddenException(`Diese Rechte hast du selbst nicht und kannst sie daher nicht vergeben: ${missing.join(', ')}`);
  }

  // ---- Auswahllisten --------------------------------------------------------

  @RequirePermission('users.read')
  @Get('options')
  async options(@Req() req: Req) {
    const ids = await this.allowedCompanies(req.policy, 'users.read');
    const [companies, groups, roles] = await Promise.all([
      this.prisma.db.company.findMany({ where: { id: { in: ids } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      this.prisma.db.group.findMany({ where: { isActive: true, OR: [{ companyId: { in: ids } }, { companyId: null }] }, orderBy: { name: 'asc' }, select: { id: true, name: true, type: true, companyId: true } }),
      this.prisma.db.role.findMany({ orderBy: { name: 'asc' }, select: { key: true, name: true, description: true } }),
    ]);
    return { companies, groups, roles, groupTypes: GROUP_TYPES, modules: MODULES };
  }

  // ---- Personen --------------------------------------------------------------

  @RequirePermission('users.read')
  @Get('users/:id')
  async getPerson(@Req() req: Req, @Param('id', ParseUUIDPipe) id: string) {
    const me = req.policy.userId;
    const { u, companyId } = await this.person(id);
    this.scope(req.policy, 'users.read', companyId);
    const p = u.employeeProfile;
    return {
      id: u.id, username: u.username, displayName: u.displayName, status: u.status, userType: u.userType, validUntil: u.validUntil, lastLoginAt: u.lastLoginAt,
      firstName: p?.firstName ?? null, lastName: p?.lastName ?? null, jobTitle: p?.jobTitle ?? null, company: p?.company.name ?? null, companyId,
      source: p?.source ?? 'LOCAL', personnelNumber: p?.personnelNumber ?? null,
      groups: u.groupMemberships.map((m) => ({ id: m.groupId, name: m.group.name, isLead: m.isLead })),
      roles: u.userRoles.map((r) => ({ id: r.id, key: r.role.key, name: r.role.name, scope: r.group ? `Team ${r.group.name}` : r.company ? r.company.name : 'überall', validUntil: r.validUntil })),
      canManage: can(req.policy, 'users.manage', companyId ? { companyId } : undefined), canRoles: can(req.policy, 'roles.manage'), canGroups: can(req.policy, 'groups.manage', companyId ? { companyId } : undefined),
      isMe: id === me,
    };
  }

  @RequirePermission('users.manage')
  @Patch('users/:id')
  async patchPerson(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(PersonPatch)) b: z.infer<typeof PersonPatch>) {
    const { u, companyId } = await this.person(id);
    this.scope(req.policy, 'users.manage', companyId);
    await this.prisma.db.user.update({ where: { id }, data: { displayName: b.displayName, ...(b.validUntil !== undefined ? { validUntil: b.validUntil ? new Date(`${b.validUntil}T23:59:59Z`) : null } : {}) } });
    if (u.employeeProfile && b.jobTitle !== undefined) await this.prisma.db.employeeProfile.update({ where: { userId: id }, data: { jobTitle: b.jobTitle } });
    await this.audit.log({ actorId: me.id, companyId, action: 'user.updated', entityType: 'user', entityId: id, metadata: { fields: Object.keys(b) } });
    return this.getPerson(req, id);
  }

  /** Person anlegen, die nicht aus Gastromatic kommt (z. B. Externe, Aushilfen) – mit Einmal-Code. */
  @RequirePermission('users.manage')
  @Post('users')
  async createPerson(@Req() req: Req, @CurrentUser() me: SessionUser, @Body(new ZodPipe(NewPerson)) b: z.infer<typeof NewPerson>) {
    this.scope(req.policy, 'users.manage', b.companyId);
    const db = this.prisma.db;
    if (await db.user.count({ where: { username: b.username } })) throw new BadRequestException('Diesen Benutzernamen gibt es schon.');
    const role = await db.role.findUniqueOrThrow({ where: { key: b.external ? 'external' : 'employee' } });
    const u = await db.user.create({ data: {
      username: b.username, displayName: `${b.firstName} ${b.lastName.charAt(0)}.`, userType: b.external ? 'EXTERNAL' : 'EMPLOYEE', status: 'PROVISIONED',
      validUntil: b.validUntil ? new Date(`${b.validUntil}T23:59:59Z`) : null, settings: { create: {} },
      ...(b.external ? { userRoles: { create: { roleId: role.id, companyId: b.companyId, grantedById: me.id } } } : {
        employeeProfile: { create: { companyId: b.companyId, firstName: b.firstName, lastName: b.lastName, jobTitle: b.jobTitle ?? null, source: 'LOCAL',
          companyAssignments: { create: { companyId: b.companyId, isPrimary: true, jobTitle: b.jobTitle ?? null, validFrom: new Date(), source: 'LOCAL' } } } },
      }),
      groupMemberships: { create: b.groupIds.map((groupId) => ({ groupId })) },
    } });
    await this.audit.log({ actorId: me.id, companyId: b.companyId, action: 'user.created', entityType: 'user', entityId: u.id, metadata: { external: b.external } });
    // Externe haben ihre Rolle schon; Mitarbeitende bekommen sie beim Freischalten – beide mit Einmal-Code
    if (b.external) {
      await db.user.update({ where: { id: u.id }, data: { status: 'INVITED', activatedAt: new Date(), mustChangePassword: true } });
      return { id: u.id, ...(await this.admin.newCode(req.policy, me.id, u.id)) };
    }
    return { id: u.id, ...(await this.admin.activate(req.policy, me.id, u.id)) };
  }

  @RequirePermission('roles.manage')
  @Post('users/:id/roles')
  async grant(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Grant)) b: z.infer<typeof Grant>) {
    if (id === me.id) throw new BadRequestException('Die eigenen Rollen ändert eine zweite Person (Vier-Augen-Prinzip).');
    const { companyId } = await this.person(id);
    this.scope(req.policy, 'users.read', companyId);
    const role = await this.prisma.db.role.findUnique({ where: { key: b.roleKey }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Rolle nicht gefunden.');
    await this.assertGrantable(req.policy, role.permissions.map((p) => p.permission.key));
    if (!b.companyId && !b.groupId && companiesWith(req.policy, 'roles.manage', []) !== 'all' && role.key !== 'employee')
      throw new BadRequestException('Bitte wähle, wofür die Rolle gilt (Haus oder Team).');
    const r = await this.prisma.db.userRole.create({ data: { userId: id, roleId: role.id, companyId: b.companyId ?? null, groupId: b.groupId ?? null, grantedById: me.id, validUntil: b.validUntil ? new Date(`${b.validUntil}T23:59:59Z`) : null } });
    await this.audit.log({ actorId: me.id, companyId: b.companyId ?? companyId, action: 'role.granted', entityType: 'user', entityId: id, metadata: { role: role.key, groupId: b.groupId ?? null, userRoleId: r.id } });
    return this.getPerson(req, id);
  }

  @RequirePermission('roles.manage')
  @Delete('users/:id/roles/:roleId')
  async revoke(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('roleId', ParseUUIDPipe) roleId: string) {
    if (id === me.id) throw new BadRequestException('Die eigenen Rollen ändert eine zweite Person (Vier-Augen-Prinzip).');
    const r = await this.prisma.db.userRole.findFirst({ where: { id: roleId, userId: id }, include: { role: { include: { permissions: { include: { permission: true } } } } } });
    if (!r) throw new NotFoundException();
    await this.assertGrantable(req.policy, r.role.permissions.map((p) => p.permission.key));
    await this.prisma.db.userRole.delete({ where: { id: roleId } });
    await this.audit.log({ actorId: me.id, companyId: r.companyId, action: 'role.revoked', entityType: 'user', entityId: id, metadata: { role: r.role.key } });
    return this.getPerson(req, id);
  }

  // ---- Teams & Gruppen ------------------------------------------------------

  @RequirePermission('groups.manage')
  @Get('groups')
  async groups(@Req() req: Req) {
    const ids = await this.allowedCompanies(req.policy, 'groups.manage');
    const global = companiesWith(req.policy, 'groups.manage', []) === 'all';
    const rows = await this.prisma.db.group.findMany({ where: { OR: [{ companyId: { in: ids } }, ...(global ? [{ companyId: null }] : [])] },
      include: { company: { select: { name: true } }, parent: { select: { name: true } }, memberships: { include: { user: { select: { id: true, displayName: true, status: true } } } } }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
    return rows.map((g) => ({ id: g.id, name: g.name, type: g.type, description: g.description, isActive: g.isActive, source: g.source, company: g.company?.name ?? 'gesellschaftsübergreifend', companyId: g.companyId,
      parent: g.parent?.name ?? null, parentGroupId: g.parentGroupId, members: g.memberships.filter((m) => m.user.status !== 'DEACTIVATED').map((m) => ({ id: m.user.id, name: m.user.displayName, isLead: m.isLead })).sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, 'de')) }));
  }

  @RequirePermission('groups.manage')
  @Post('groups')
  async createGroup(@Req() req: Req, @CurrentUser() me: SessionUser, @Body(new ZodPipe(GroupBody)) b: z.infer<typeof GroupBody>) {
    this.scope(req.policy, 'groups.manage', b.companyId ?? null);
    const g = await this.prisma.db.group.create({ data: { name: b.name, type: b.type, companyId: b.companyId ?? null, parentGroupId: b.parentGroupId ?? null, description: b.description ?? null } });
    await this.audit.log({ actorId: me.id, companyId: g.companyId, action: 'group.created', entityType: 'group', entityId: g.id, metadata: { name: g.name, type: g.type } });
    return { id: g.id };
  }

  @RequirePermission('groups.manage')
  @Patch('groups/:id')
  async patchGroup(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(GroupBody.partial().extend({ isActive: z.boolean().optional() }))) b: Partial<z.infer<typeof GroupBody>> & { isActive?: boolean }) {
    const g = await this.prisma.db.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException();
    this.scope(req.policy, 'groups.manage', g.companyId);
    if (b.parentGroupId === id) throw new BadRequestException('Eine Gruppe kann nicht in sich selbst liegen.');
    await this.prisma.db.group.update({ where: { id }, data: { name: b.name, type: b.type, description: b.description, parentGroupId: b.parentGroupId, isActive: b.isActive } });
    await this.audit.log({ actorId: me.id, companyId: g.companyId, action: b.isActive === false ? 'group.deactivated' : 'group.updated', entityType: 'group', entityId: id });
    return { ok: true };
  }

  /** Mitglied aufnehmen bzw. Leitung setzen. Leitung = Rolle „Teamleitung“ für genau dieses Team. */
  @RequirePermission('groups.manage')
  @Post('groups/:id/members')
  @HttpCode(200)
  async addMember(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Member)) b: z.infer<typeof Member>) {
    const db = this.prisma.db;
    const g = await db.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException();
    this.scope(req.policy, 'groups.manage', g.companyId);
    await db.groupMembership.upsert({ where: { userId_groupId: { userId: b.userId, groupId: id } }, create: { userId: b.userId, groupId: id, isLead: b.isLead }, update: { isLead: b.isLead } });
    const lead = await db.role.findUniqueOrThrow({ where: { key: 'team_lead' } });
    if (b.isLead) { if (!(await db.userRole.count({ where: { userId: b.userId, roleId: lead.id, groupId: id } }))) await db.userRole.create({ data: { userId: b.userId, roleId: lead.id, groupId: id, grantedById: me.id } }); }
    else await db.userRole.deleteMany({ where: { userId: b.userId, roleId: lead.id, groupId: id } });
    await this.audit.log({ actorId: me.id, companyId: g.companyId, action: 'group.member_set', entityType: 'user', entityId: b.userId, metadata: { group: g.name, isLead: b.isLead } });
    return { ok: true };
  }

  @RequirePermission('groups.manage')
  @Delete('groups/:id/members/:userId')
  async removeMember(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) userId: string) {
    const db = this.prisma.db;
    const g = await db.group.findUnique({ where: { id } });
    if (!g) throw new NotFoundException();
    this.scope(req.policy, 'groups.manage', g.companyId);
    const lead = await db.role.findUniqueOrThrow({ where: { key: 'team_lead' } });
    await db.$transaction([db.groupMembership.deleteMany({ where: { userId, groupId: id } }), db.userRole.deleteMany({ where: { userId, roleId: lead.id, groupId: id } })]);
    await this.audit.log({ actorId: me.id, companyId: g.companyId, action: 'group.member_removed', entityType: 'user', entityId: userId, metadata: { group: g.name } });
    return { ok: true };
  }

  // ---- Einstellungen je Haus -------------------------------------------------

  @RequirePermission('companies.manage_modules')
  @Get('companies')
  async companies(@Req() req: Req) {
    const ids = await this.allowedCompanies(req.policy, 'companies.manage_modules');
    const rows = await this.prisma.db.company.findMany({ where: { id: { in: ids } }, include: { branding: true }, orderBy: { name: 'asc' } });
    return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, disabledModules: c.disabledModules, readListVisibility: c.readListVisibility,
      canBrand: can(req.policy, 'branding.manage', { companyId: c.id }),
      branding: c.branding ? { displayName: c.branding.displayName, primaryColor: c.branding.primaryColor, surfaceColor: c.branding.surfaceColor, footerText: c.branding.footerText, logoRequiresWhite: c.branding.logoRequiresWhite } : null }));
  }

  @RequirePermission('companies.manage_modules')
  @Patch('companies/:id')
  async patchCompany(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CompanyPatch)) b: z.infer<typeof CompanyPatch>) {
    this.scope(req.policy, 'companies.manage_modules', id);
    const db = this.prisma.db;
    if (b.disabledModules || b.readListVisibility) await db.company.update({ where: { id }, data: { disabledModules: b.disabledModules, readListVisibility: b.readListVisibility } });
    if (b.branding) {
      this.scope(req.policy, 'branding.manage', id);
      const c = b.branding.primaryColor;
      if (c && contrastWithWhite(c) < 4.5) throw new BadRequestException('Die Aktionsfarbe ist zu hell – weiße Schrift darauf wäre schlecht lesbar (mind. 4,5 : 1). Bitte eine dunklere Farbe wählen.');
      await db.companyBranding.update({ where: { companyId: id }, data: b.branding });
    }
    await this.audit.log({ actorId: me.id, companyId: id, action: 'company.settings_updated', entityType: 'company', entityId: id, metadata: { fields: Object.keys(b) } });
    return (await this.companies(req)).find((c) => c.id === id);
  }

  // ---- Rollen & Rechte -------------------------------------------------------

  @RequirePermission('roles.manage')
  @Get('roles')
  async roles() {
    const [roles, perms] = await Promise.all([
      this.prisma.db.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { userRoles: true } } }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }),
      this.prisma.db.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] }),
    ]);
    return {
      permissions: perms.map((p) => ({ key: p.key, module: p.module, sensitive: p.isSensitive })),
      roles: roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, users: r._count.userRoles, permissions: r.permissions.map((p) => p.permission.key) })),
    };
  }

  /** Eigene Rollen (z. B. „Azubi-Betreuung“). Standardrollen sind fest. */
  @RequirePermission('roles.manage')
  @Post('roles')
  async createRole(@Req() req: Req, @CurrentUser() me: SessionUser, @Body(new ZodPipe(RoleBody)) b: z.infer<typeof RoleBody>) {
    await this.assertGrantable(req.policy, b.permissions);
    const perms = await this.prisma.db.permission.findMany({ where: { key: { in: b.permissions } } });
    const key = `custom_${b.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    if (await this.prisma.db.role.count({ where: { key } })) throw new BadRequestException('Eine Rolle mit diesem Namen gibt es schon.');
    const r = await this.prisma.db.role.create({ data: { key, name: b.name, description: b.description ?? null, isSystem: false, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } });
    await this.audit.log({ actorId: me.id, action: 'role.created', entityType: 'role', entityId: r.id, metadata: { key, permissions: b.permissions } });
    return { id: r.id };
  }

  @RequirePermission('roles.manage')
  @Patch('roles/:id')
  async patchRole(@Req() req: Req, @CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(RoleBody)) b: z.infer<typeof RoleBody>) {
    const r = await this.prisma.db.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } });
    if (!r) throw new NotFoundException();
    if (r.isSystem) throw new BadRequestException('Standardrollen sind fest – lege für Abweichungen eine eigene Rolle an.');
    await this.assertGrantable(req.policy, [...b.permissions, ...r.permissions.map((p) => p.permission.key)]);
    const perms = await this.prisma.db.permission.findMany({ where: { key: { in: b.permissions } } });
    await this.prisma.db.$transaction([
      this.prisma.db.rolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.db.role.update({ where: { id }, data: { name: b.name, description: b.description ?? null, permissions: { create: perms.map((p) => ({ permissionId: p.id })) } } }),
    ]);
    await this.audit.log({ actorId: me.id, action: 'role.updated', entityType: 'role', entityId: id, metadata: { permissions: b.permissions } });
    return { ok: true };
  }

  @RequirePermission('roles.manage')
  @Delete('roles/:id')
  async deleteRole(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.db.role.findUnique({ where: { id }, include: { _count: { select: { userRoles: true } } } });
    if (!r) throw new NotFoundException();
    if (r.isSystem) throw new BadRequestException('Standardrollen können nicht gelöscht werden.');
    if (r._count.userRoles) throw new BadRequestException('Die Rolle ist noch vergeben – bitte zuerst bei den Personen entfernen.');
    await this.prisma.db.role.delete({ where: { id } });
    await this.audit.log({ actorId: me.id, action: 'role.deleted', entityType: 'role', entityId: id, metadata: { key: r.key } });
    return { ok: true };
  }
}
