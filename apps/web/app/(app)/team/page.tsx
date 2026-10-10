'use client';

import { useState } from 'react';
import { Avatar } from '@/components/content/Avatar';
import { State, useLoad } from '@/components/work';

interface P { id: string; name: string; job: string | null; groups: string[]; lead: boolean }

/** Wer ist wer – nur Name, Tätigkeit und Bereich (keine privaten Daten). */
export default function Team() {
  const { data, error } = useLoad<P[]>('/people/directory');
  const [q, setQ] = useState('');
  if (!data) return <State error={error} loading />;
  const hit = data.filter((p) => `${p.name} ${p.job ?? ''} ${p.groups.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(hit.flatMap((p) => (p.groups.length ? p.groups : ['Ohne Bereich'])))].sort((a, b) => a.localeCompare(b, 'de'));
  return (
    <div className="stack-lg">
      <h1>Team</h1>
      <div className="field"><label htmlFor="tq" className="sr">Team durchsuchen</label><input id="tq" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Tätigkeit oder Bereich" /></div>
      {groups.map((g) => (
        <section key={g} className="stack-s">
          <h2 className="h-sub">{g}</h2>
          <div className="grid">
            {hit.filter((p) => (p.groups.length ? p.groups.includes(g) : g === 'Ohne Bereich')).map((p) => (
              <div key={p.id} className="card row"><Avatar name={p.name} /><span><strong>{p.name}</strong><span className="block small muted">{p.job}{p.lead && ' · Leitung'}</span></span></div>
            ))}
          </div>
        </section>
      ))}
      {hit.length === 0 && <div className="card empty">Niemand gefunden.</div>}
    </div>
  );
}
