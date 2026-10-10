import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PushService } from './push.service';

export interface NotifyInput {
  recipientIds: string[];
  actorId?: string | null;
  eventType: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  contentItemId?: string | null;
  importance?: 'NORMAL' | 'IMPORTANT';
  /** verhindert doppelte Benachrichtigung je Person und Anlass */
  dedupeKey?: string;
}

/** In-App-Benachrichtigung plus Push aufs Handy (außerhalb der Ruhezeit, ADR-043). */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService, private readonly push: PushService) {}

  async notify(n: NotifyInput) {
    const ids = [...new Set(n.recipientIds)].filter((id) => id && id !== n.actorId);
    if (!ids.length) return 0;
    const res = await this.prisma.db.notification.createMany({
      data: ids.map((recipientId) => ({
        recipientId,
        actorId: n.actorId ?? null,
        eventType: n.eventType,
        importance: n.importance ?? 'NORMAL',
        title: n.title.slice(0, 200),
        body: n.body?.slice(0, 300) ?? null,
        linkPath: n.linkPath ?? null,
        contentItemId: n.contentItemId ?? null,
        dedupeKey: n.dedupeKey ?? null,
      })),
      skipDuplicates: true,
    });
    // Push nur für neu angelegte (nicht doppelte) Hinweise; Fehler blockieren nie den Ablauf
    if (res.count) {
      const fresh = n.dedupeKey ? (await this.prisma.db.notification.findMany({ where: { recipientId: { in: ids }, dedupeKey: n.dedupeKey, createdAt: { gte: new Date(Date.now() - 60_000) } }, select: { recipientId: true } })).map((r) => r.recipientId) : ids;
      void this.push.send(fresh, { title: n.title, body: n.body, url: n.linkPath }).catch(() => null);
    }
    return res.count;
  }
}
