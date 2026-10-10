import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Feature-Schalter aus system_settings (kurz gecacht). */
@Injectable()
export class FeatureService {
  private cache = new Map<string, { v: unknown; at: number }>();
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string, fallback: T): Promise<T> {
    const c = this.cache.get(key);
    if (c && Date.now() - c.at < 30_000) return c.v as T;
    const row = await this.prisma.db.systemSetting.findUnique({ where: { key } });
    const v = (row?.value ?? fallback) as T;
    this.cache.set(key, { v, at: Date.now() });
    return v;
  }

  /** Lesestatus und Erinnerungen – aus, bis die Betriebsvereinbarung steht (ADR-012). */
  readTracking(): Promise<boolean> {
    return this.get('feature.read_tracking', false);
  }

  clear() {
    this.cache.clear();
  }
}
