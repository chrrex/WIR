/**
 * Hauszahlen für die Leiste „Heute im Haus“ (ADR-057): Belegung, An-/Abreisen, Zimmer, Veranstaltungen,
 * Dienst und Wetter. Nur Summen, keine Gästenamen (ADR-016). Quellen werden im Hintergrund zwischengespeichert,
 * damit das Dashboard sofort lädt und ein Ausfall von Mews nichts blockiert.
 */
import { config } from '../common/config';

export interface HouseDay {
  occupancy: number; // %
  arrivals: number;
  arrivalGroups: number;
  departures: number;
  guests: number;
  roomsReady: number;
  roomsToClean: number;
  events: number;
  eventGuests: number;
  onDuty: number;
  onDutyTeams: string;
}
export interface Weather { temp: number; max: number; code: number; rain: number }
export interface Forecast {
  now: { temp: number; feels: number; wind: number; code: number };
  hours: Array<{ at: string; temp: number; code: number; rain: number }>; // die nächsten 12 Stunden, alle 2 Stunden
  days: Array<{ date: string; min: number; max: number; code: number; rain: number }>; // 5 Tage
}
type WeatherDays = { today: Weather; tomorrow: Weather; forecast: Forecast; demo: boolean };
export interface HouseData { days: { today: HouseDay; tomorrow: HouseDay; asOf: string } | null; weather: WeatherDays | null; demo: boolean }

const env = process.env;
const mews = env.MEWS_ACCESS_TOKEN && env.MEWS_CLIENT_TOKEN && env.MEWS_SERVICE_ID
  ? { url: env.MEWS_URL ?? 'https://api.mews.com', ClientToken: env.MEWS_CLIENT_TOKEN, AccessToken: env.MEWS_ACCESS_TOKEN, Client: 'WIR Mitarbeiterportal 1.0', ServiceId: env.MEWS_SERVICE_ID }
  : null;
const LAT = env.WEATHER_LAT ?? '52.87', LON = env.WEATHER_LON ?? '13.29'; // Liebenberg

/** Hauszahlen gibt es live (Mews) oder im Demo-Modus mit erfundenen Zahlen – sonst gar nicht. */
export const houseAvailable = () => !!mews || config.demoMode;

/** Mitternacht in Berlin (+ n Tage) als UTC-Zeitpunkt. */
export function berlinMidnight(addDays = 0, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now).split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d + addDays); // Mitternacht Berliner Zeit, als wäre sie UTC
  const at = new Date(wall);
  const offset = new Date(at.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getTime() - new Date(at.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(wall - offset);
}

// ---------------------------------------------------------------- Demo (erfundene, je Tag gleichbleibende Zahlen)
function demoDay(date: Date): HouseDay {
  let s = Number(date.toISOString().slice(0, 10).replace(/-/g, ''));
  const r = (min: number, max: number) => { s = (s * 9301 + 49297) % 233280; return Math.round(min + (s / 233280) * (max - min)); };
  const rooms = 72, occ = r(58, 99), departures = r(8, 34);
  return {
    occupancy: occ, arrivals: r(10, 38), arrivalGroups: r(0, 2), departures, guests: Math.round((rooms * occ) / 100 * 1.6),
    roomsReady: r(0, departures), roomsToClean: departures, events: r(0, 4), eventGuests: r(20, 220),
    onDuty: r(38, 58), onDutyTeams: `Rezeption ${r(3, 6)} · Küche ${r(7, 12)} · Service ${r(8, 15)}`,
  };
}
function demoWeather(): Omit<WeatherDays, 'demo'> {
  const day = (i: number) => { const d = demoDay(berlinMidnight(i)); return { date: berlinMidnight(i).toISOString(), min: 3 + (d.departures % 6), max: 9 + (d.arrivals % 10), code: [0, 2, 3, 61, 80][d.departures % 5], rain: (d.events * 20) % 90 }; };
  const days = [0, 1, 2, 3, 4].map(day);
  const start = Math.ceil(Date.now() / 36e5) * 36e5;
  const hours = Array.from({ length: 6 }, (_, i) => ({ at: new Date(start + i * 2 * 36e5).toISOString(), temp: days[0].max - Math.abs(i - 2), code: days[0].code, rain: days[0].rain }));
  const w = (d: (typeof days)[number], temp: number): Weather => ({ temp, max: d.max, code: d.code, rain: d.rain });
  return { today: w(days[0], days[0].max - 2), tomorrow: w(days[1], days[1].max), forecast: { now: { temp: days[0].max - 2, feels: days[0].max - 4, wind: 14, code: days[0].code }, hours, days } };
}

// ---------------------------------------------------------------- Mews Connector API (vorbereitet; aktiv, sobald die Zugangsdaten gesetzt sind)
async function mewsPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { url, ...auth } = mews!;
  const res = await fetch(`${url}/api/connector/v1/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...auth, ...body }), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Mews ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}
type Res = { Reservations: Array<{ PersonCounts?: Array<{ Count: number }>; GroupId?: string }>; Cursor?: string };
async function mewsDay(from: Date, cleanRooms: { ready: number } | null): Promise<HouseDay> {
  const to = new Date(from.getTime() + 864e5);
  const iv = { StartUtc: from.toISOString(), EndUtc: to.toISOString() };
  const states = ['Confirmed', 'Started', 'Processed'];
  const list = (filter: Record<string, unknown>) => mewsPost<Res>('reservations/getAll/2023-06-06', { ServiceIds: [mews!.ServiceId], States: states, Limitation: { Count: 1000 }, ...filter }).then((r) => r.Reservations);
  const [avail, arr, dep, stay] = await Promise.all([
    mewsPost<{ ResourceCategoryAvailabilities: Array<{ Metrics: Record<string, number[]> }> }>('services/getAvailability/2024-01-22', {
      ServiceId: mews!.ServiceId, FirstTimeUnitStartUtc: from.toISOString(), LastTimeUnitStartUtc: from.toISOString(), Metrics: ['Occupied', 'ActiveResources', 'OutOfOrderBlocks'],
    }),
    list({ ScheduledStartUtc: iv }), list({ ScheduledEndUtc: iv }), list({ CollidingUtc: iv }),
  ]);
  const sum = (k: string) => avail.ResourceCategoryAvailabilities.reduce((a, c) => a + (c.Metrics[k]?.[0] ?? 0), 0);
  const usable = sum('ActiveResources') - sum('OutOfOrderBlocks');
  const persons = (rs: Res['Reservations']) => rs.reduce((a, r) => a + (r.PersonCounts ?? []).reduce((b, p) => b + p.Count, 0), 0);
  return {
    occupancy: usable > 0 ? Math.round((sum('Occupied') / usable) * 100) : 0,
    arrivals: arr.length, arrivalGroups: new Set(arr.map((r) => r.GroupId).filter(Boolean)).size,
    departures: dep.length, guests: persons(stay),
    roomsReady: cleanRooms?.ready ?? 0, roomsToClean: dep.length,
    // Veranstaltungen (Eventtool) und Dienst (Gastromatic) folgen mit eigener Anbindung
    events: 0, eventGuests: 0, onDuty: 0, onDutyTeams: '',
  };
}
async function mewsCleanRooms() {
  const r = await mewsPost<{ Resources: Array<{ State: string; IsActive: boolean }> }>('resources/getAll', { Extent: { Resources: true }, Limitation: { Count: 1000 } });
  return { ready: r.Resources.filter((x) => x.IsActive && (x.State === 'Inspected' || x.State === 'Clean')).length };
}

// ---------------------------------------------------------------- Wetter (Open-Meteo, frei nutzbar, ohne Schlüssel)
async function fetchWeather(): Promise<WeatherDays> {
  const q = `latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code`
    + '&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max'
    + '&timezone=Europe%2FBerlin&timeformat=unixtime&forecast_days=5&forecast_hours=14';
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Wetter: ' + res.status);
  type Arr = Record<string, number[]>;
  const j = (await res.json()) as { current: Record<string, number>; hourly: Arr; daily: Arr };
  const r = Math.round, D = j.daily, H = j.hourly;
  const days = D.time.map((t, i) => ({ date: new Date(t * 1000).toISOString(), min: r(D.temperature_2m_min[i]), max: r(D.temperature_2m_max[i]), code: D.weather_code[i], rain: D.precipitation_probability_max[i] ?? 0 }));
  const hours = H.time.map((t, i) => ({ at: new Date(t * 1000).toISOString(), temp: r(H.temperature_2m[i]), code: H.weather_code[i], rain: H.precipitation_probability[i] ?? 0 })).filter((h) => new Date(h.at).getTime() > Date.now()).filter((_, i) => i % 2 === 0).slice(0, 6);
  const c = j.current;
  return {
    today: { temp: r(c.temperature_2m), max: days[0].max, code: c.weather_code, rain: days[0].rain },
    tomorrow: { temp: days[1].max, max: days[1].max, code: days[1].code, rain: days[1].rain },
    forecast: { now: { temp: r(c.temperature_2m), feels: r(c.apparent_temperature), wind: r(c.wind_speed_10m), code: c.weather_code }, hours, days },
    demo: false,
  };
}

// ---------------------------------------------------------------- Zwischenspeicher
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, fallback: () => T | null): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  try {
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return (hit?.value as T) ?? fallback(); // letzter bekannter Stand, sonst Ersatz
  }
}

export async function houseData(): Promise<HouseData> {
  const [d0, d1] = [berlinMidnight(0), berlinMidnight(1)];
  const demo = !mews;
  const days = houseAvailable() ? await cached('house', 10 * 60e3, async () => {
    if (demo) return { today: demoDay(d0), tomorrow: demoDay(d1), asOf: new Date().toISOString() };
    const clean = await mewsCleanRooms().catch(() => null);
    const [today, tomorrow] = await Promise.all([mewsDay(d0, clean), mewsDay(d1, null)]);
    return { today, tomorrow, asOf: new Date().toISOString() };
  }, () => null) : null;
  const weather = await cached<WeatherDays>('weather', 30 * 60e3, fetchWeather, () => (config.demoMode ? { ...demoWeather(), demo: true } : null));
  return { days, weather, demo };
}

/** WMO-Wettercode → kurzer Text und Zeichen. */
export function weatherText(code: number): [string, string] {
  if (code === 0) return ['sonnig', '☀️'];
  if (code <= 2) return ['heiter', '🌤️'];
  if (code === 3) return ['bewölkt', '☁️'];
  if (code <= 48) return ['Nebel', '🌫️'];
  if (code <= 67 || (code >= 80 && code <= 82)) return ['Regen', '🌧️'];
  if (code <= 77 || code === 85 || code === 86) return ['Schnee', '❄️'];
  return ['Gewitter', '⛈️'];
}
