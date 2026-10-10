import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

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

/**
 * In-App-Benachrichtigungen. Push und E-Mail (mit persönlichen Zeitfenstern, ADR-014)
 * folgen in Phase 6 über notification_deliveries – die App zeigt immer sofort alles.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

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
    return res.count;
  }
}
