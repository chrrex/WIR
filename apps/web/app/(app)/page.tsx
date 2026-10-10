'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';

interface Dashboard {
  widgets: Array<{ key: string; title: string; state: 'ready' | 'coming'; phase?: number; text: string }>;
  companyOverview: Array<{ id: string; name: string; active: boolean }> | null;
  isFoundation: boolean;
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : 'Guten Abend';
}

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

      <section className="note info">
        <Icon name="check" size={20} />
        <span><strong>Phase 1 steht:</strong> Anmeldung, Rollen und Rechte, Auftritt je Gesellschaft und die Verwaltung neuer Kolleg:innen funktionieren. Die Bausteine unten füllen sich mit den nächsten Phasen.</span>
      </section>

      <div className="grid">
        {(data?.widgets ?? []).map((w) => (
          <section className="card widget" key={w.key}>
            <div className="chead"><h2>{w.title}</h2><span className="chip">Phase {w.phase}</span></div>
            <p className="muted">{w.text}</p>
          </section>
        ))}
      </div>

      {me.user.userType === 'EXTERNAL' && me.user.validUntil && (
        <p className="small muted">Dein Zugang ist befristet bis {new Date(me.user.validUntil).toLocaleDateString('de-DE')}.</p>
      )}
      <p className="small muted">Einstellungen wie Schriftgröße und Dunkelmodus findest du unter <Link href="/einstellungen">Einstellungen</Link>.</p>
    </div>
  );
}
