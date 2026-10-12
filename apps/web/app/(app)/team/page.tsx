'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Avatar } from '@/components/content/Avatar';
import { Absent, AbsentChip } from '@/components/Absent';
import { State, useLoad } from '@/components/work';
import { SectionTabs } from '@/components/SectionTabs';

interface P { id: string; name: string; job: string | null; groups: string[]; lead: boolean; absent: Absent | null }

/** Wer ist wer – mit Abwesenheiten. Klick öffnet das Profil. */
export default function Team() {
  const { data, error } = useLoad<P[]>('/people/directory');
  const [q, setQ] = useState('');
  const [onlyAway, setOnlyAway] = useState(false);
  if (!data) return <State error={error} loading />;
  const hit = data.filter((p) => `${p.name} ${p.job ?? ''} ${p.groups.join(' ')}`.toLowerCase().includes(q.toLowerCase()) && (!onlyAway || p.absent));
  const groups = [...new Set(hit.flatMap((p) => (p.groups.length ? p.groups : ['Ohne Bereich'])))].sort((a, b) => a.localeCompare(b, 'de'));
  const away = data.filter((p) => p.absent).length;
  return (
    <div className="stack-lg">
      <h1>Kontakte</h1>
      <SectionTabs />
      <div className="row wrap">
        <label htmlFor="tq" className="sr">Team durchsuchen</label>
        <input id="tq" type="search" className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Tätigkeit oder Bereich" />
        <label className={`fchip ${onlyAway ? 'on' : ''}`}><input type="checkbox" checked={onlyAway} onChange={(e) => setOnlyAway(e.target.checked)} />Heute abwesend ({away})</label>
      </div>
      {groups.map((g) => (
        <section key={g} className="stack-s">
          <h2 className="h-sub">{g}</h2>
          <div className="grid">
            {hit.filter((p) => (p.groups.length ? p.groups.includes(g) : g === 'Ohne Bereich')).map((p) => (
              <Link key={p.id} href={`/team/${p.id}`} className="card row listitem">
                <Avatar name={p.name} id={p.id} />
                <span className="grow"><strong>{p.name}</strong><span className="block small muted">{p.job}{p.lead && ' · Leitung'}</span><AbsentChip a={p.absent} /></span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {hit.length === 0 && <div className="card empty">Niemand gefunden.</div>}
    </div>
  );
}
