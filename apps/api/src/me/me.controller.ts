import { Body, Controller, Get, NotFoundException, Patch, Put } from '@nestjs/common';
import { z } from 'zod';
import type { AppModule } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { LANGUAGES } from '../translate/translate.service';
import { ZodPipe } from '../common/zod.pipe';
import { config } from '../common/config';
import { AllowPendingPassword, CurrentUser, Public, SessionUser } from '../auth/decorators';
import { MODULE_PERMISSION, enabledModules, resolveBranding } from './branding';
import { ContentService } from '../content/content.service';

const SettingsBody = z.object({
  theme: z.enum(['SYSTEM', 'LIGHT', 'DARK']).optional(),
  fontScalePercent: z.number().int().min(90).max(150).optional(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  mobileNavItems: z.array(z.string().max(30)).max(4).optional(),
  quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  locale: z.enum(Object.keys(LANGUAGES) as [string, ...string[]]).optional(),
  autoTranslate: z.boolean().optional(),
  plainLanguage: z.boolean().optional(),
  showBirthday: z.boolean().optional(),
  birthdayMonthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable().optional(),
  showWorkAnniversary: z.boolean().optional(),
});
const RecoveryBody = z.object({ email: z.email().max(200).nullable() });

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService, private readonly policy: PolicyService, private readonly content: ContentService) {}

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
            quietHoursStart: user.settings.quietHoursStart, quietHoursEnd: user.settings.quietHoursEnd,
            locale: user.settings.locale, autoTranslate: user.settings.autoTranslate, plainLanguage: user.settings.plainLanguage,
            showBirthday: user.settings.showBirthday, birthdayMonthDay: user.settings.birthdayMonthDay, showWorkAnniversary: user.settings.showWorkAnniversary,
          }
        : null,
    };
  }

  /** Zähler für Menü und Glocke (nur eigene Daten). */
  @Get('me/badges')
  async badges(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const visible = this.content.visibleWhere(me.id);
    const unreadOf = (extra: object) => db.contentItem.count({ where: { ...visible, ...extra, authorId: { not: me.id }, readReceipts: { none: { userId: me.id } } } });
    const parts = await db.chatParticipant.findMany({ where: { userId: me.id, leftAt: null }, include: { lastReadMessage: { select: { createdAt: true } } } });
    let chat = 0;
    for (const p of parts) {
      chat += await db.chatMessage.count({ where: { conversationId: p.conversationId, deletedAt: null, senderId: { not: me.id }, createdAt: { gt: p.lastReadMessage?.createdAt ?? p.joinedAt } } });
    }
    const [news, handovers, notifications] = await Promise.all([
      unreadOf({ type: 'POST', post: { kind: 'NEWS' } }),
      unreadOf({ type: 'HANDOVER' }),
      db.notification.count({ where: { recipientId: me.id, readAt: null } }),
    ]);
    return { news, handovers, chat, notifications };
  }

  @Patch('me/settings')
  async updateSettings(@CurrentUser() me: SessionUser, @Body(new ZodPipe(SettingsBody)) body: z.infer<typeof SettingsBody>) {
    const s = await this.prisma.db.userSettings.upsert({ where: { userId: me.id }, create: { userId: me.id, ...body }, update: body });
    return { theme: s.theme, fontScalePercent: s.fontScalePercent, reducedMotion: s.reducedMotion, highContrast: s.highContrast, mobileNavItems: s.mobileNavItems, quietHoursStart: s.quietHoursStart, quietHoursEnd: s.quietHoursEnd, locale: s.locale, autoTranslate: s.autoTranslate, plainLanguage: s.plainLanguage, showBirthday: s.showBirthday, birthdayMonthDay: s.birthdayMonthDay, showWorkAnniversary: s.showWorkAnniversary };
  }

  /** Freiwillige private E-Mail nur für „Passwort vergessen“ (ADR-011). Bestätigung per Link folgt in Phase 2. */
  @Put('me/recovery-email')
  async recoveryEmail(@CurrentUser() me: SessionUser, @Body(new ZodPipe(RecoveryBody)) body: z.infer<typeof RecoveryBody>) {
    await this.prisma.db.user.update({ where: { id: me.id }, data: { recoveryEmail: body.email, recoveryEmailVerifiedAt: null } });
    return { ok: true, hasRecoveryEmail: !!body.email };
  }
}
