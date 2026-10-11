import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt.`);
  return v;
}

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.API_PORT ?? 3001),
  databaseUrl: required('DATABASE_URL'),
  /** Geheimnis für Einmal-Codes (HMAC). In Produktion zwingend setzen. */
  appSecret: isProd ? required('APP_SECRET') : (process.env.APP_SECRET ?? 'nur-fuer-entwicklung-bitte-aendern'),
  sessionCookie: 'wir_session',
  sessionDays: Number(process.env.SESSION_DAYS ?? 14),
  oneTimeCodeHours: 24,
  maxFailedLogins: 5,
  lockMinutes: 15,
  minPasswordLength: 10,
  /**
   * Demo-Modus (ADR-047): Personen per Klick wechseln, ohne Passwort. Nur mit DEMO_MODE=true UND
   * nur in einer Datenbank mit Testdaten (Marker „demo.seeded“ aus dem Seed) – nie mit echten Daten.
   */
  demoMode: process.env.DEMO_MODE === 'true',
  /** Gesellschaft, deren Auftritt die Anmeldeseite zeigt. */
  defaultCompany: process.env.DEFAULT_COMPANY ?? 'SGL',
};
