import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, PrismaClient } from '@wir/db';
import { config } from './config';

/** Ein Prisma-Client für die ganze API (Treiberadapter pg). */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient = createPrismaClient(config.databaseUrl);

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
