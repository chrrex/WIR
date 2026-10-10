import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CurrentUser, SessionUser } from '../auth/decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

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
