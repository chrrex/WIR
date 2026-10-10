import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { PrismaService } from '../common/prisma.service';
import { config } from '../common/config';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Serverseitige Sessions: Cookie enthält nur ein Zufalls-Token, die DB nur dessen Hash. */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userAgent: string | undefined, res: Response) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionDays * 864e5);
    const session = await this.prisma.db.session.create({
      data: { userId, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 300), expiresAt },
    });
    res.cookie(config.sessionCookie, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd || process.env.COOKIE_SECURE === 'true',
      expires: expiresAt,
      path: '/',
    });
    return session;
  }

  async find(token: string | undefined) {
    if (!token) return null;
    const s = await this.prisma.db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
    if (!s || s.revokedAt || s.expiresAt <= new Date()) return null;
    // lastSeen höchstens alle 5 Minuten schreiben
    if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) {
      await this.prisma.db.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    }
    return s;
  }

  async revoke(sessionId: string) {
    await this.prisma.db.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.db.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  clearCookie(res: Response) {
    res.clearCookie(config.sessionCookie, { path: '/' });
  }
}
