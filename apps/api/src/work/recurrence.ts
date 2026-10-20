/**
 * Kleine Teilmenge von RFC 5545 für Checklisten: FREQ=DAILY oder FREQ=WEEKLY;BYDAY=MO,TU…;BYHOUR=6;BYMINUTE=0.
 * Uhrzeit gilt in der Zeitzone der Vorlage (Sommer-/Winterzeit eingeschlossen).
 */
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function toRule(days: 'DAILY' | 'WEEKDAYS', time: string) {
  const [h, m] = time.split(':').map(Number);
  return days === 'DAILY' ? `FREQ=DAILY;BYHOUR=${h};BYMINUTE=${m}` : `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=${h};BYMINUTE=${m}`;
}

export function describeRule(rule: string | null) {
  if (!rule) return null;
  const p = Object.fromEntries(rule.split(';').map((x) => x.split('=')));
  const time = `${String(p.BYHOUR ?? 0).padStart(2, '0')}:${String(p.BYMINUTE ?? 0).padStart(2, '0')}`;
  const DE: Record<string, string> = { MO: 'montags', TU: 'dienstags', WE: 'mittwochs', TH: 'donnerstags', FR: 'freitags', SA: 'samstags', SU: 'sonntags' };
  return `${p.BYDAY === 'MO,TU,WE,TH,FR' ? 'Mo–Fr' : p.BYDAY ? p.BYDAY.split(',').map((d: string) => DE[d] ?? d).join(', ') : 'täglich'} ${time}`;
}

/** Abstand der Zeitzone zu UTC in Minuten zu einem Zeitpunkt. */
function offset(at: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - at.getTime()) / 60000;
}

/** Nächster Termin strikt nach `after`. */
export function nextOccurrence(rule: string, after: Date, tz = 'Europe/Berlin'): Date {
  const p = Object.fromEntries(rule.split(';').map((x) => x.split('=')));
  const days = p.FREQ === 'WEEKLY' && p.BYDAY ? p.BYDAY.split(',') : DAYS;
  const h = Number(p.BYHOUR ?? 0), m = Number(p.BYMINUTE ?? 0);
  const local = new Date(after.getTime() + offset(after, tz) * 60000); // Wanduhr als UTC-Felder
  for (let i = 0; i <= 8; i++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, h, m));
    if (!days.includes(DAYS[d.getUTCDay()])) continue;
    const utc = new Date(d.getTime() - offset(d, tz) * 60000);
    if (utc > after) return utc;
  }
  throw new Error(`Ungültige Wiederholung: ${rule}`);
}
