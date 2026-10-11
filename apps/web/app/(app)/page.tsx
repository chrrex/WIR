'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';

interface Widget {
  key: string; title: string; state: 'ready' | 'coming'; phase?: number; text: string; count?: number;
  items?: Array<{ id: string; title: string; meta: string; unread: boolean; important?: boolean; photo?: boolean; href: string }>;
}
interface Dashboard {
  widgets: Widget[];
  important: { id: string; title: string } | null;
  companyOverview: Array<{ id: string; name: string; active: boolean }> | null;
  isFoundation: boolean;
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
}

const WIDGET_HREF: Record<string, string> = { news: '/news', handovers: '/uebergaben', social: '/social', tasks: '/aufgaben', checklists: '/checklisten', surveys: '/umfragen', thanks: '/social' };

export default function StartPage() {
  const { me } = useMe();
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { api<Dashboard>('/dashboard').then(setData).catch(() => null); }, []);
  if (!me) return null;
  const today = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="stack-lg">
      <div className="ptitle">
        <div>
          <div className="eyebrow">{today}</div>
          <h1>{greeting()}, {me.profile?.firstName ?? me.user.displayName}</h1>
        </div>
      </div>

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
        {(data?.widgets ?? []).filter((w) => w.state === 'ready').map((w) => (
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
