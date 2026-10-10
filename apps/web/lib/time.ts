const TZ = 'Europe/Berlin';

/** „gerade eben“, „vor 12 Min.“, „heute, 07:12“, „gestern, 18:40“, „Mo., 5.10.“ */
export function when(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return 'gerade eben';
  if (diff < 60) return `vor ${Math.round(diff)} Min.`;
  const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(d);
  const day = (x: Date) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeZone: TZ }).format(x);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (day(d) === day(today)) return `heute, ${time}`;
  if (day(d) === day(yesterday)) return `gestern, ${time}`;
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: TZ }).format(d);
}

export function initials(name: string) {
  const p = name.replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
}
