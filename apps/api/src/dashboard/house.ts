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
type WeatherDays = { today: Weather; tomorrow: Weather; demo: boolean };
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
function demoWeather(date: Date): Weather {
  const d = demoDay(date);
  return { temp: 8 + (d.arrivals % 12), max: 10 + (d.arrivals % 12), code: [0, 2, 3, 61][d.departures % 4], rain: (d.events * 20) % 90 };
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
async function fetchWeather() {
  const q = `latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,weather_code,precipitation_probability_max&timezone=Europe%2FBerlin&forecast_days=2`;
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error('Wetter: ' + res.status);
  const j = (await res.json()) as { current: { temperature_2m: number; weather_code: number }; daily: { temperature_2m_max: number[]; weather_code: number[]; precipitation_probability_max: number[] } };
  const day = (i: number, temp: number, code: number): Weather => ({ temp: Math.round(temp), max: Math.round(j.daily.temperature_2m_max[i]), code, rain: j.daily.precipitation_probability_max[i] ?? 0 });
  return { today: day(0, j.current.temperature_2m, j.current.weather_code), tomorrow: day(1, j.daily.temperature_2m_max[1], j.daily.weather_code[1]), demo: false };
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
  const weather = await cached<WeatherDays>('weather', 30 * 60e3, fetchWeather, () => (config.demoMode ? { today: demoWeather(d0), tomorrow: demoWeather(d1), demo: true } : null));
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
