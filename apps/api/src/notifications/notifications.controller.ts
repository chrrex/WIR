import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { PushService } from './push.service';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, SessionUser } from '../auth/decorators';

const Sub = z.object({ endpoint: z.url().max(1000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }) });

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

  /** Push aufs Handy: öffentlicher Schlüssel, Gerät an- und abmelden (ADR-043). */
  @Get('push/key')
  key() { return { publicKey: this.push.publicKey }; }

  @Post('push/subscriptions')
  @HttpCode(200)
  async subscribe(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Sub)) b: z.infer<typeof Sub>) {
    const data = { userId: me.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth };
    await this.prisma.db.pushSubscription.upsert({ where: { endpoint: b.endpoint }, create: data, update: data });
    return { ok: true };
  }

  @Delete('push/subscriptions')
  async unsubscribe(@CurrentUser() me: SessionUser, @Body(new ZodPipe(Sub.pick({ endpoint: true }))) b: { endpoint: string }) {
    await this.prisma.db.pushSubscription.deleteMany({ where: { userId: me.id, endpoint: b.endpoint } });
    return { ok: true };
  }

  @Get()
  async list(@CurrentUser() me: SessionUser) {
    const db = this.prisma.db;
    const [items, unread] = await Promise.all([
      db.notification.findMany({
        where: { recipientId: me.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { actor: { select: { displayName: true } } },
      }),
      db.notification.count({ where: { recipientId: me.id, readAt: null } }),
    ]);
    return {
      unread,
      items: items.map((n) => ({
        id: n.id, title: n.title, body: n.body, linkPath: n.linkPath, eventType: n.eventType, importance: n.importance,
        actor: n.actor?.displayName ?? null, createdAt: n.createdAt, read: !!n.readAt,
      })),
    };
  }

  @Get('count')
  async count(@CurrentUser() me: SessionUser) {
    return { unread: await this.prisma.db.notification.count({ where: { recipientId: me.id, readAt: null } }) };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() me: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.db.notification.updateMany({ where: { id, recipientId: me.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() me: SessionUser) {
    await this.prisma.db.notification.updateMany({ where: { recipientId: me.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
