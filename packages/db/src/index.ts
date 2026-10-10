import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

/**
 * Erzeugt einen Prisma-Client mit dem Postgres-Treiberadapter (Prisma 7, ohne Rust-Engine).
 * Die Verbindung kommt aus DATABASE_URL, sofern nicht ausdrücklich übergeben.
 */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error('DATABASE_URL ist nicht gesetzt.');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export * from './rbac-catalog';
export * from './codes';
export * from './search';
