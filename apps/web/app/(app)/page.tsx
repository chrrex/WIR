'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';
import { WeatherWidget, type Forecast } from '@/components/WeatherWidget';

interface Widget {
  key: string; title: string; state: 'ready' | 'coming'; phase?: number; text: string; count?: number;
  items?: Array<{ id: string; title: string; meta: string; unread: boolean; important?: boolean; photo?: boolean; href: string }>;
}
interface Dashboard {
  widgets: Widget[];
  important: { id: string; title: string } | null;
  companyOverview: Array<{ id: string; name: string; active: boolean }> | null;
  isFoundation: boolean;
  prefs: Pref[];
}
interface Pref { key: string; visible: boolean }
interface Tile { key: string; label: string; value: string; sub: string; href?: string; tone?: 'warn' | 'good'; demo?: boolean }
interface Today { evening: boolean; asOf: string; celebrate: string | null; tiles: Tile[]; weather: Forecast | null }

/** Eigene Reihenfolge zuerst, Neues hinten dran (sichtbar). */
function arrange<T extends { key: string }>(items: T[], prefix: string, prefs: Pref[]) {
  const by = new Map(items.map((i) => [`${prefix}${i.key}`, i]));
  const keys = [...prefs.map((p) => p.key).filter((k) => by.has(k)), ...[...by.keys()].filter((k) => !prefs.some((p) => p.key === k))];
  return keys.map((k) => ({ k, item: by.get(k)!, visible: prefs.find((p) => p.key === k)?.visible ?? true }));
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
}

const WIDGET_HREF: Record<string, string> = { news: '/news', handovers: '/uebergaben', social: '/social', tasks: '/aufgaben', checklists: '/checklisten', surveys: '/umfragen', thanks: '/social' };

export default function StartPage() {
  const { me } = useMe();
  const [data, setData] = useState<Dashboard | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    api<Dashboard>('/dashboard').then(setData).catch(() => null);
    const load = () => api<Today>('/dashboard/today').then(setToday).catch(() => null);
    load();
    const t = setInterval(load, 10 * 60e3); // Hauszahlen alle 10 Minuten auffrischen
    return () => clearInterval(t);
  }, []);
  if (!me) return null;
  const prefs = data?.prefs ?? [];
  const tiles = arrange(today?.tiles ?? [], 'kpi:', prefs);
  const widgets = arrange((data?.widgets ?? []).filter((w) => w.state === 'ready'), 'w:', prefs);
  async function savePrefs(next: Pref[]) {
    setData((d) => (d ? { ...d, prefs: next } : d));
    await api('/dashboard/prefs', { method: 'PUT', json: { items: next } }).catch(() => null);
  }
  /** Ein-/Ausblenden bzw. Verschieben innerhalb einer Gruppe; speichert immer die ganze Liste. */
  function change(list: Array<{ k: string; visible: boolean }>, k: string, op: 'toggle' | -1 | 1) {
    const l = list.map((x) => ({ key: x.k, visible: x.visible }));
    const i = l.findIndex((x) => x.key === k);
    if (op === 'toggle') l[i].visible = !l[i].visible;
    else if (l[i + op]) [l[i], l[i + op]] = [l[i + op], l[i]];
    const other = [...tiles, ...widgets].filter((x) => !list.some((y) => y.k === x.k)).map((x) => ({ key: x.k, visible: x.visible }));
    savePrefs([...l, ...other]);
  }
  const asOf = today ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(today.asOf)) : '';
  const shown = tiles.filter((t) => t.visible);
  const dateLabel = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="stack-lg">
      <div className="ptitle">
        <div>
          <div className="eyebrow">{dateLabel}</div>
          <h1>{greeting()}, {me.profile?.firstName ?? me.user.displayName}</h1>
        </div>
        <button className={`btn sm ${edit ? 'on' : ''}`} aria-expanded={edit} aria-controls="dash-edit" onClick={() => setEdit(!edit)}><Icon name="settings" size={18} /> {edit ? 'Fertig' : 'Anpassen'}</button>
      </div>

      {today?.celebrate && <section className="note ok celebrate" aria-label="Glückwunsch"><span aria-hidden="true">🎉</span><strong>{today.celebrate}</strong></section>}

      {edit && (
        <section id="dash-edit" className="card stack dash-edit" aria-label="Startseite anpassen">
          <div className="chead"><h2>Startseite anpassen</h2>{prefs.length > 0 && <button className="lnk small" onClick={() => savePrefs([])}>Zurücksetzen</button>}</div>
          <p className="small muted">Wähle, was du sehen möchtest, und bring es mit den Pfeilen in deine Reihenfolge. Das gilt nur für dich.</p>
          {[{ title: 'Kacheln „Heute im Haus“', list: tiles.map((t) => ({ k: t.k, visible: t.visible, label: t.item.label })) },
            { title: 'Bereiche', list: widgets.map((w) => ({ k: w.k, visible: w.visible, label: w.item.title })) }].map((g) => (
            <fieldset key={g.title} className="stack dash-group"><legend className="strong">{g.title}</legend>
              <ul className="plain dash-edit-list">
                {g.list.map((x, i) => (
                  <li key={x.k}>
                    <label className="check grow"><input type="checkbox" checked={x.visible} onChange={() => change(g.list, x.k, 'toggle')} /> {x.label}</label>
                    <button className="iconbtn sm" aria-label={`${x.label} nach oben`} disabled={i === 0} onClick={() => change(g.list, x.k, -1)}>↑</button>
                    <button className="iconbtn sm" aria-label={`${x.label} nach unten`} disabled={i === g.list.length - 1} onClick={() => change(g.list, x.k, 1)}>↓</button>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
          <p className="small muted">Deinen Geburtstag kannst du unter <Link href="/einstellungen">Einstellungen</Link> eintragen.</p>
        </section>
      )}

      {shown.length > 0 && (
        <section className="today" aria-labelledby="today-h">
          <div className="today-head">
            <h2 id="today-h" className="eyebrow">{today?.evening ? 'Morgen im Haus' : 'Heute im Haus'}</h2>
            <span className="xs muted">Stand {asOf}{shown.some((t) => t.item.demo) && <> · <span className="chip xs" title="Erfundene Beispielzahlen, bis die Anbindung steht">Demo-Zahlen</span></>}</span>
          </div>
          <ul className="plain today-strip">
            {shown.map(({ k, item: t }) => {
              const body = <><span className="t-label">{t.label}</span><span className="t-value">{t.value}</span><span className="t-sub" title={t.sub}>{t.sub}</span></>;
              return <li key={k} className={`tile ${t.tone ?? ''}`}>{t.href ? <Link href={t.href}>{body}</Link> : <div>{body}</div>}</li>;
            })}
          </ul>
        </section>
      )}

      {data?.important && (
        <section className="banner" aria-label="Wichtig">
          <span className="banner-ico"><Icon name="bellring" size={22} /></span>
          <div className="grow"><div className="eyebrow warn-ink">Wichtig · noch nicht gelesen</div><div className="banner-title">{data.important.title}</div></div>
          <Link className="btn warn-solid" href={`/news/${data.important.id}`}>Jetzt lesen</Link>
        </section>
      )}

      {data?.isFoundation && (
        <section className="note info" aria-label="Gruppenweite Sicht">
          <Icon name="globe" size={20} />
          <span><strong>Gruppenweite Sicht:</strong> Du arbeitest für die ganze Stiftungsgruppe. Deshalb erscheint das WIR bei dir im Auftritt der DKB STIFTUNG. Interne Themen eines Hauses wie Übergaben oder Checklisten bleiben dort.</span>
        </section>
      )}

      {data?.companyOverview && (
        <section className="kpis" aria-label="Gesellschaften im WIR">
          {data.companyOverview.map((c) => (
            <div className="kpi" key={c.id}>
              <div className="small muted">{c.name}</div>
              <div className="v">{c.active ? 'im WIR' : 'geplant'}</div>
              <div className="s">{c.active ? 'Pilot ab Phase 1' : 'Ausbaustufe 2'}</div>
            </div>
          ))}
        </section>
      )}

      <div className="grid">
        {widgets.filter((x) => x.visible).map(({ item: w }) => w.key === 'weather' ? (
          today && <WeatherWidget key={w.key} w={today.weather} title={w.title} fallback={w.text} />
        ) : (
          <section className="card widget" key={w.key}>
            <div className="chead">
              <h2>{w.title}{w.count ? <span className="muted"> · {w.key === 'thanks' ? `${w.count}× Danke im ${new Intl.DateTimeFormat('de-DE', { month: 'long' }).format(new Date())}` : `${w.count} ${w.key === 'tasks' ? 'offen' : 'neu'}`}</span> : null}</h2>
              <Link className="lnk small" href={WIDGET_HREF[w.key] ?? '/'}>Alle</Link>
            </div>
            {w.items?.length ? (
              <ul className="plain">
                {w.items.map((i) => (
                  <li key={i.id}><Link className="witem" href={i.href}>
                    <span className={`udot ${i.unread ? '' : 'off'}`} aria-label={i.unread ? 'ungelesen' : undefined} />
                    <span className="grow">{i.important && <span className="chip warn">Wichtig</span>} <span className={i.unread ? 'strong' : ''}>{i.title}</span>{i.photo && <span className="photo-ico" title="mit Foto"><Icon name="camera" size={15} /><span className="sr"> (mit Foto)</span></span>}<span className="block xs muted">{i.meta}</span></span>
                  </Link></li>
                ))}
              </ul>
            ) : <p className="muted small">{w.text}</p>}
          </section>
        ))}
      </div>

      {(data?.widgets ?? []).some((w) => w.state === 'coming') && (
        <section className="stack">
          <h2 className="h-sub">Kommt mit den nächsten Phasen</h2>
          <div className="grid">
            {(data?.widgets ?? []).filter((w) => w.state === 'coming').map((w) => (
              <section className="card widget soon" key={w.key}>
                <div className="chead"><h2>{w.title}</h2><span className="chip">Phase {w.phase}</span></div>
                <p className="muted small">{w.text}</p>
              </section>
            ))}
          </div>
        </section>
      )}

      {me.user.userType === 'EXTERNAL' && me.user.validUntil && (
        <p className="small muted">Dein Zugang ist befristet bis {new Date(me.user.validUntil).toLocaleDateString('de-DE')}.</p>
      )}
      <p className="small muted">Einstellungen wie Schriftgröße und Dunkelmodus findest du unter <Link href="/einstellungen">Einstellungen</Link>.</p>
    </div>
  );
}
