import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { hashOneTimeCode, normalizeOneTimeCode, safeEqualHex } from '@wir/db';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { config } from '../common/config';

const GENERIC = 'Benutzername oder Passwort stimmt nicht.';
const GENERIC_CODE = 'Benutzername oder Code stimmt nicht – oder der Code ist abgelaufen.';
// Schutz gegen Timing-Unterschiede bei unbekannten Benutzernamen: echter Hash, einmal erzeugt
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hash('wir-dummy-passwort-ohne-nutzer'));

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async primaryCompanyId(userId: string) {
    const p = await this.prisma.db.employeeProfile.findUnique({ where: { userId }, select: { companyId: true } });
    return p?.companyId ?? null;
  }

  private async registerFailure(user: { id: string; failedLoginCount: number }, reason: string) {
    const count = user.failedLoginCount + 1;
    const lock = count >= config.maxFailedLogins;
    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : count, lockedUntil: lock ? new Date(Date.now() + config.lockMinutes * 60_000) : undefined },
    });
    await this.audit.log({ actorId: null, action: lock ? 'auth.locked_temporarily' : 'auth.login_failed', entityType: 'user', entityId: user.id,
      companyId: await this.primaryCompanyId(user.id), metadata: { reason } });
  }

  private assertNotLocked(user: { lockedUntil: Date | null }) {
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new UnauthorizedException(`Zu viele Fehlversuche. Bitte versuch es in ${min} Minute${min === 1 ? '' : 'n'} erneut.`);
    }
  }

  /** Anmeldung mit Benutzername und Passwort. */
  async loginWithPassword(username: string, password: string) {
    const user = await this.prisma.db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    if (!user || !user.passwordHash) {
      await verify(await getDummyHash(), password).catch(() => false);
      throw new UnauthorizedException(GENERIC);
    }
    this.assertNotLocked(user);
    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok) {
      await this.registerFailure(user, 'password');
      throw new UnauthorizedException(GENERIC);
    }
    if (user.status !== 'ACTIVE' || (user.validUntil && user.validUntil <= new Date())) {
      throw new UnauthorizedException('Dein Zugang ist nicht aktiv. Bitte wende dich an deine Leitung.');
    }
    await this.prisma.db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, companyId: await this.primaryCompanyId(user.id) });
    return user;
  }

  /** Erstzugang bzw. Zurücksetzen mit Einmal-Code (ADR-011). Danach Pflicht-Passwortwechsel. */
  async loginWithCode(username: string, codeInput: string) {
    const code = normalizeOneTimeCode(codeInput);
    const user = await this.prisma.db.user.findUnique({ where: { username: username.trim().toLowerCase() } });
    if (!user || code.length !== 6 || user.status === 'DEACTIVATED' || user.status === 'PROVISIONED') {
      throw new UnauthorizedException(GENERIC_CODE);
    }
    this.assertNotLocked(user);
    const candidates = await this.prisma.db.credentialReset.findMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    });
    const expected = hashOneTimeCode(user.id, code, config.appSecret);
    const match = candidates.find((c) => safeEqualHex(c.tokenHash, expected));
    if (!match) {
      await this.registerFailure(user, 'one_time_code');
      throw new UnauthorizedException(GENERIC_CODE);
    }
    await this.prisma.db.$transaction([
      this.prisma.db.credentialReset.update({ where: { id: match.id }, data: { usedAt: new Date() } }),
      this.prisma.db.user.update({ where: { id: user.id }, data: { mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'auth.one_time_code_used', entityType: 'user', entityId: user.id, companyId: await this.primaryCompanyId(user.id) });
    return user;
  }

  /** Eigenes Passwort setzen. Nach Einmal-Code ohne altes Passwort, sonst mit. */
  async changePassword(userId: string, newPassword: string, currentPassword?: string) {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mustChangePassword) {
      if (!currentPassword || !user.passwordHash || !(await verify(user.passwordHash, currentPassword).catch(() => false))) {
        throw new BadRequestException('Dein aktuelles Passwort stimmt nicht.');
      }
    }
    const problem = passwordProblem(newPassword, user.username);
    if (problem) throw new BadRequestException(problem);
    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        status: user.status === 'INVITED' ? 'ACTIVE' : user.status,
      },
    });
    await this.audit.log({ actorId: userId, action: 'auth.password_changed', entityType: 'user', entityId: userId, companyId: await this.primaryCompanyId(userId) });
  }
}

/** Einfache, verständliche Regeln statt Sonderzeichen-Zwang. */
export function passwordProblem(pw: string, username: string): string | null {
  if (pw.length < config.minPasswordLength) return `Bitte mindestens ${config.minPasswordLength} Zeichen verwenden.`;
  if (pw.length > 200) return 'Das Passwort ist zu lang.';
  if (pw.toLowerCase().includes(username.toLowerCase())) return 'Das Passwort darf deinen Benutzernamen nicht enthalten.';
  if (/^(.)\1+$/.test(pw)) return 'Bitte kein Passwort aus nur einem Zeichen.';
  return null;
}
