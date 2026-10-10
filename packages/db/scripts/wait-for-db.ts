/** Wartet, bis PostgreSQL erreichbar ist (wichtig beim ersten Start im Codespace). */
import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL ist nicht gesetzt.');
  for (let i = 1; i <= 60; i++) {
    const c = new Client({ connectionString: url });
    try {
      await c.connect();
      await c.query('select 1');
      await c.end();
      console.log('Datenbank erreichbar.');
      return;
    } catch {
      await c.end().catch(() => undefined);
      if (i === 1) console.log('Warte auf die Datenbank …');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('Datenbank nach 2 Minuten nicht erreichbar.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
