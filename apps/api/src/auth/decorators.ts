import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@wir/db';

export const IS_PUBLIC = 'wir:isPublic';
export const ALLOW_PENDING_PASSWORD = 'wir:allowPendingPassword';
export const REQUIRED_PERMISSION = 'wir:requiredPermission';

/** Route ohne Anmeldung (Login, Health, Auftritt der Anmeldeseite). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Route auch erlaubt, solange der Pflicht-Passwortwechsel noch aussteht. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);
/** Funktionsrecht, das die Route mindestens braucht (Scope-Prüfung im Handler). */
export const RequirePermission = (key: PermissionKey) => SetMetadata(REQUIRED_PERMISSION, key);

export interface SessionUser {
  id: string;
  sessionId: string;
  username: string;
  mustChangePassword: boolean;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  return ctx.switchToHttp().getRequest().user;
});
