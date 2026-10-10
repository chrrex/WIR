import { Body, Controller, Get, NotFoundException, Patch, Put } from '@nestjs/common';
import { z } from 'zod';
import type { AppModule } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { ZodPipe } from '../common/zod.pipe';
import { config } from '../common/config';
import { AllowPendingPassword, CurrentUser, Public, SessionUser } from '../auth/decorators';
import { MODULE_PERMISSION, enabledModules, resolveBranding } from './branding';

const SettingsBody = z.object({
  theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
  fontScalePercent: z.number().int().min(90).max(150).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  mobileNavItems: z.array(z.string().max(30)).max(4).optional(),
});
const RecoveryBody = z.object({ email: z.email().max(200).nullable() });

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService) {}

  /** Auftritt der Anmeldeseite (öffentlich, ohne personenbezogene Daten). */
  @Public()
  @Get('branding/default')
  async defaultBranding() {
    const companies = await this.prisma.db.company.findMany({ include: { branding: true } });
    const c = companies.find((x) => x.shortName === config.defaultCompany) ?? companies[0];
    return c ? resolveBranding(c.id, companies) : null;
  }

  /** Auftritt einer Gesellschaft für die Anmeldeseite, z. B. ?company=dkb-stiftung (öffentlich). */
  @Public()
  @Get('branding/companies')
  async brandings() {
    const companies = await this.prisma.db.company.findMany({ where: { isActive: true }, include: { branding: true }, orderBy: { name: 'asc' } });
    return companies.map((c) => resolveBranding(c.id, companies)).filter(Boolean);
  }

  @AllowPendingPassword()
  @Get('me')
  async me(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const [user, companies, ctx] = await Promise.all([
      db.user.findUnique({
        where: { id: me.id },
        include: { employeeProfile: true, settings: true, groupMemberships: { include: { group: true } } },
      }),
      db.company.findMany({ include: { branding: true } }),
      this.policy.loadContext(me.id),
    ]);
    if (!user) throw new NotFoundException();

    const primary = user.employeeProfile?.companyId ?? ctx.companyIds[0] ?? companies.find((c) => c.shortName === config.defaultCompany)?.id;
    const branding = primary ? resolveBranding(primary, companies) : null;
    const modules = enabledModules(ctx.companyIds, companies).filter((m) => can(ctx, MODULE_PERMISSION[m as AppModule]));
    const permissions = [...ctx.grants.keys()].filter((k) => can(ctx, k)).sort();

    return {
      user: {
        id: user.id, username: user.username, displayName: user.displayName, userType: user.userType, status: user.status,
        mustChangePassword: user.mustChangePassword, validUntil: user.validUntil, hasRecoveryEmail: !!user.recoveryEmail,
      },
      profile: user.employeeProfile
        ? { firstName: user.employeeProfile.firstName, lastName: user.employeeProfile.lastName, jobTitle: user.employeeProfile.jobTitle }
        : null,
      groups: user.groupMemberships.map((m) => ({ id: m.groupId, name: m.group.name, isLead: m.isLead })),
      companies: companies.filter((c) => ctx.companyIds.includes(c.id)).map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      branding,
      modules,
      permissions,
      settings: user.settings
        ? {
            theme: user.settings.theme, fontScalePercent: user.settings.fontScalePercent, reducedMotion: user.settings.reducedMotion,
            highContrast: user.settings.highContrast, mobileNavItems: user.settings.mobileNavItems,
          }
        : null,
    };
  }

  @Patch('me/settings')
  async updateSettings(@CurrentUser() me: SessionUser, @Body(new ZodPipe(SettingsBody)) body: z.infer<typeof SettingsBody>) {
    const s = await this.prisma.db.userSettings.upsert({ where: { userId: me.id }, create: { userId: me.id, ...body }, update: body });
    return { theme: s.theme, fontScalePercent: s.fontScalePercent, reducedMotion: s.reducedMotion, highContrast: s.highContrast, mobileNavItems: s.mobileNavItems };
  }

  /** Freiwillige private E-Mail nur für „Passwort vergessen“ (ADR-011). Bestätigung per Link folgt in Phase 2. */
  @Put('me/recovery-email')
  async recoveryEmail(@CurrentUser() me: SessionUser, @Body(new ZodPipe(RecoveryBody)) body: z.infer<typeof RecoveryBody>) {
    await this.prisma.db.user.update({ where: { id: me.id }, data: { recoveryEmail: body.email, recoveryEmailVerifiedAt: null } });
    return { ok: true, hasRecoveryEmail: !!body.email };
  }
}
