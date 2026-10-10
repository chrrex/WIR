import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
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
  constructor(private readonly auth: AuthService, private readonly sessions: SessionService) {}

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
