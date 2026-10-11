import { Injectable, OnModuleInit } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../common/prisma.service';

export interface PushPayload { title: string; body?: string | null; url?: string | null }
type Transport = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>;

/** Uhrzeit "HH:MM" in einer Zeitzone. */
export function localTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d);
}

/** Liegt die Uhrzeit in der Ruhezeit? Auch über Mitternacht (z. B. 21:00–07:00). */
export function inQuietHours(now: string, start?: string | null, end?: string | null) {
  if (!start || !end || start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

/**
 * Web-Push aufs Handy (ADR-043). Schlüssel aus VAPID_* oder – für Entwicklung/Codespaces –
 * einmalig erzeugt und in system_settings abgelegt. In der Ruhezeit wird kein Push gesendet;
 * die Benachrichtigung bleibt in der App.
 */
@Injectable()
export class PushService implements OnModuleInit {
  publicKey = '';
  /** austauschbar für Tests */
  transport: Transport = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 24 * 3600 });

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    let keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
    if (!keys) {
      const row = await this.prisma.db.systemSetting.findUnique({ where: { key: 'push.vapid' } });
      keys = (row?.value as typeof keys) ?? webpush.generateVAPIDKeys();
      if (!row) await this.prisma.db.systemSetting.create({ data: { key: 'push.vapid', value: keys } });
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:it@example.invalid', keys.publicKey, keys.privateKey);
    this.publicKey = keys.publicKey;
  }

  async send(userIds: string[], p: PushPayload) {
    if (!userIds.length) return 0;
    const subs = await this.prisma.db.pushSubscription.findMany({ where: { userId: { in: userIds } }, include: { user: { select: { settings: true } } } });
    const now = new Date();
    const payload = JSON.stringify({ title: p.title, body: p.body ?? '', url: p.url ?? '/' });
    let sent = 0;
    for (const s of subs) {
      const st = s.user.settings;
      if (inQuietHours(localTime(now, st?.timeZone ?? 'Europe/Berlin'), st?.quietHoursStart, st?.quietHoursEnd)) continue;
      try {
        await this.transport({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        await this.prisma.db.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: now } });
        sent++;
      } catch (e) {
        // Gerät abgemeldet oder Abo abgelaufen → entfernen
        if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)) await this.prisma.db.pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
      }
    }
    return sent;
  }
}
