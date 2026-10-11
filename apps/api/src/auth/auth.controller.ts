import { Body, Controller, Get, HttpCode, NotFoundException, Post, Req, Res } from '@nestjs/common';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AllowPendingPassword, CurrentUser, Public, SessionUser } from './decorators';

/** Anmeldeversuche je IP und Minute (Tests setzen den Wert hoch). */
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 10);

const LoginBody = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });
const CodeBody = z.object({ username: z.string().min(1).max(100), code: z.string().min(6).max(20) });
const PasswordBody = z.object({ newPassword: z.string().min(1).max(200), currentPassword: z.string().max(200).optional() });

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService, private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Demo-Modus nur mit Schalter UND Testdaten-Marker – sonst gibt es diese Routen nicht. */
  private async assertDemo() {
    const seeded = config.demoMode && (await this.prisma.db.systemSetting.findUnique({ where: { key: 'demo.seeded' } }));
    if (!seeded) throw new NotFoundException();
  }

  /** Demo: Personen zum Wechseln (Name, Tätigkeit, Rollen, Gesellschaft). */
  @Public()
  @Get('demo')
  async demoUsers() {
    await this.assertDemo();
    const users = await this.prisma.db.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { displayName: 'asc' },
      include: { employeeProfile: { select: { jobTitle: true, company: { select: { shortName: true } } } }, userRoles: { include: { role: { select: { name: true, key: true } } } } } });
    return users.map((u) => ({ id: u.id, username: u.username, name: u.displayName, job: u.employeeProfile?.jobTitle ?? (u.userType === 'EXTERNAL' ? 'extern' : null),
      company: u.employeeProfile?.company.shortName ?? null, roles: u.userRoles.filter((r) => r.role.key !== 'employee').map((r) => r.role.name) }));
  }

  /** Demo: ohne Passwort als diese Person anmelden; eine bestehende Sitzung wird beendet. */
  @Public()
  @Post('demo/login')
  @HttpCode(200)
  async demoLogin(@Body(new ZodPipe(z.object({ userId: z.uuid() }))) body: { userId: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.assertDemo();
    const user = await this.prisma.db.user.findFirst({ where: { id: body.userId, status: 'ACTIVE' } });
    if (!user) throw new NotFoundException();
    const old = await this.sessions.find(req.cookies?.[config.sessionCookie]);
    if (old) await this.sessions.revoke(old.id);
    await this.sessions.create(user.id, req.headers['user-agent'], res);
    await this.audit.log({ actorId: user.id, action: 'auth.demo_login', entityType: 'user', entityId: user.id });
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.loginWithPassword(body.username, body.password);
    await this.sessions.create(user.id, req.headers['user-agent'], res);
    return { ok: true, mustChangePassword: user.mustChangePassword };
  }

  @Public()
  @Throttle({ default: { limit: AUTH_LIMIT, ttl: 60_000 } })
  @Post('code')
  @HttpCode(200)
  async code(@Body(new ZodPipe(CodeBody)) body: z.infer<typeof CodeBody>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.loginWithCode(body.username, body.code);
    await this.sessions.revokeAllForUser(user.id);
    await this.sessions.create(user.id, req.headers['user-agent'], res);
    return { ok: true, mustChangePassword: true };
  }

  @AllowPendingPassword()
  @Post('password')
  @HttpCode(200)
  async password(@Body(new ZodPipe(PasswordBody)) body: z.infer<typeof PasswordBody>, @CurrentUser() me: SessionUser) {
    await this.auth.changePassword(me.id, body.newPassword, body.currentPassword);
    await this.sessions.revokeAllForUser(me.id, me.sessionId);
    return { ok: true };
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() me: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revoke(me.sessionId);
    this.sessions.clearCookie(res);
    return { ok: true };
  }
}
