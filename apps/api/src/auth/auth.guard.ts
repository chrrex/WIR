import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { config } from '../common/config';
import { PolicyService } from '../policy/policy.service';
import { can } from '../policy/engine';
import { SessionService } from './session.service';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, REQUIRED_PERMISSION, SessionUser } from './decorators';

/**
 * Globaler Guard: Default Deny. Jede Route braucht eine gültige Session,
 * außer sie ist ausdrücklich @Public(). Danach Prüfung des Funktionsrechts.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService, private readonly policy: PolicyService) {}

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
    }
    return true;
  }
}
