import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../common/config';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { SessionService } from './session.service';
import { PrismaService } from '../common/prisma.service';
import { enabledModules } from '../me/branding';
import type { AppModule } from '@wir/db';

/** Rechte-Präfix → Modul: ausgeschaltete Module sperrt auch die API, nicht nur das Menü. */
const MODULE_OF: Record<string, AppModule> = {
  knowledge: 'KNOWLEDGE', documents: 'DOCUMENTS', tasks: 'TASKS', checklists: 'CHECKLISTS', surveys: 'SURVEYS',
  ideas: 'IDEAS', meetings: 'MEETINGS', contacts: 'CONTACTS', handovers: 'HANDOVERS', employees: 'TEAM',
};
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, REQUIRED_PERMISSION, SessionUser } from './decorators';

/**
 * Globaler Guard: Default Deny. Jede Route braucht eine gültige Session,
 * außer sie ist ausdrücklich @Public(). Danach Prüfung des Funktionsrechts.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService, private readonly policy: PolicyService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const session = await this.sessions.find(req.cookies?.[config.sessionCookie]);
    if (!session) throw new UnauthorizedException('Bitte melde dich an.');

    const u = session.user;
    const expired = u.validUntil && u.validUntil <= new Date();
    if (u.status === 'DEACTIVATED' || u.status === 'LOCKED' || u.status === 'PROVISIONED' || expired) {
      await this.sessions.revoke(session.id);
      throw new UnauthorizedException('Dein Zugang ist nicht aktiv.');
    }

    const user: SessionUser = { id: u.id, sessionId: session.id, username: u.username, mustChangePassword: u.mustChangePassword };
    req.user = user;

    if (u.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD, targets)) {
      throw new ForbiddenException({ message: 'Bitte vergib zuerst ein eigenes Passwort.', code: 'PASSWORD_CHANGE_REQUIRED' });
    }

    const permission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, targets);
    if (permission) {
      const pctx = await this.policy.loadContext(u.id);
      req.policy = pctx;
      if (!can(pctx, permission)) throw new ForbiddenException('Dafür fehlt dir die Berechtigung.');
      const mod = MODULE_OF[permission.split('.')[0]];
      if (mod) {
        const companies = await this.prisma.db.company.findMany({ select: { id: true, disabledModules: true } });
        if (!enabledModules(pctx.companyIds, companies).includes(mod)) throw new ForbiddenException('Dieser Bereich ist für deine Gesellschaft nicht freigeschaltet.');
      }
    }
    return true;
  }
}
