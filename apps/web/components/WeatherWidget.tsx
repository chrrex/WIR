/** Wetter-Widget (ADR-057): jetzt, die nächsten Stunden und fünf Tage – Open-Meteo bzw. Demo. */
export interface Forecast {
  now: { temp: number; feels: number; wind: number; code: number };
  hours: Array<{ at: string; temp: number; code: number; rain: number }>;
  days: Array<{ date: string; min: number; max: number; code: number; rain: number }>;
  demo: boolean;
}

export function weatherText(code: number): [string, string] {
  if (code === 0) return ['sonnig', '☀️'];
  if (code <= 2) return ['heiter', '🌤️'];
  if (code === 3) return ['bewölkt', '☁️'];
  if (code <= 48) return ['Nebel', '🌫️'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Regen', '🌧️'];
  if (code <= 77 || code === 85 || code === 86) return ['Schnee', '❄️'];
  return ['Gewitter', '⛈️'];
}

const tz = { timeZone: 'Europe/Berlin' } as const;
const hour = (iso: string) => `${new Intl.DateTimeFormat('de-DE', { hour: '2-digit', hourCycle: 'h23', ...tz }).format(new Date(iso))} Uhr`.replace(' Uhr Uhr', ' Uhr');
const dayName = (iso: string, i: number) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Intl.DateTimeFormat('de-DE', { weekday: 'long', ...tz }).format(new Date(iso)));

export function WeatherWidget({ w, title, fallback }: { w: Forecast | null; title: string; fallback: string }) {
  if (!w) return <section className="card widget"><div className="chead"><h2>{title}</h2></div><p className="muted small">{fallback}</p></section>;
  const [txt, ico] = weatherText(w.now.code);
  const lo = Math.min(...w.days.map((d) => d.min)), hi = Math.max(...w.days.map((d) => d.max)), span = Math.max(1, hi - lo);
  return (
    <section className="card widget wx" aria-labelledby="wx-h">
      <div className="chead"><h2 id="wx-h">{title}</h2>{w.demo && <span className="chip xs" title="Erfundene Beispielwerte">Demo</span>}</div>
      <div className="wx-now">
        <span className="wx-ico" aria-hidden="true">{ico}</span>
        <span className="wx-temp">{w.now.temp}°</span>
        <span className="small muted">{txt}<br />gefühlt {w.now.feels}° · Wind {w.now.wind} km/h</span>
      </div>
      <ul className="plain wx-hours" aria-label="Die nächsten Stunden">
        {w.hours.map((h) => (
          <li key={h.at}><span className="xs muted">{hour(h.at)}</span><span aria-hidden="true">{weatherText(h.code)[1]}</span><span className="sr">{weatherText(h.code)[0]}</span><strong>{h.temp}°</strong>{h.rain >= 30 && <span className="xs wx-rain">{h.rain} %</span>}</li>
        ))}
      </ul>
      <ul className="plain wx-days" aria-label="Die nächsten Tage">
        {w.days.map((d, i) => (
          <li key={d.date}>
            <span className="wx-day">{dayName(d.date, i)}</span>
            <span aria-hidden="true">{weatherText(d.code)[1]}</span>
            <span className="xs wx-rain">{d.rain >= 30 ? `${d.rain} %` : ''}</span>
            <span className="wx-range"><span className="sr">{weatherText(d.code)[0]}, </span>{d.min}°
              <span className="wx-bar" aria-hidden="true"><span style={{ left: `${((d.min - lo) / span) * 100}%`, right: `${((hi - d.max) / span) * 100}%` }} /></span>{d.max}°</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
