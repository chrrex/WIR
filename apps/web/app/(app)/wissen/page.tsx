'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { State, useLoad, day } from '@/components/work';
import { TYPE_LABEL } from '@/lib/labels';

interface Data { canCreate: boolean; categories: Array<{ id: string; name: string; articles: Array<{ id: string; title: string; type: string; version: number; updatedAt: string; requiresAck: boolean; acknowledged: boolean }> }> }

export default function Knowledge() {
  const { data, error } = useLoad<Data>('/knowledge');
  const [cat, setCat] = useState('');
  if (!data) return <State error={error} loading />;
  const open = data.categories.flatMap((c) => c.articles).filter((a) => a.requiresAck && !a.acknowledged).length;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Wissen & SOPs</h1>{data.canCreate && <Link className="btn pri" href="/wissen/neu"><Icon name="plus" size={18} />Neuer Artikel</Link>}</div>
      {open > 0 && <div className="note info">{open} Artikel {open === 1 ? 'wartet' : 'warten'} auf deine Bestätigung „Kenntnis genommen“.</div>}
      {data.categories.length > 1 && (
        <div className="chips" role="group" aria-label="Kategorie">
          <button className={`fchip ${!cat ? 'on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>Alle</button>
          {data.categories.map((c) => <button key={c.id} className={`fchip ${cat === c.id ? 'on' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      )}
      {data.categories.length === 0 && <div className="card empty">Für dich gibt es noch keine Artikel.</div>}
      {data.categories.filter((c) => !cat || c.id === cat).map((c) => (
        <section key={c.id} className="stack-s">
          <h2 className="h-sub">{c.name}</h2>
          <div className="list">
            {c.articles.map((a) => (
              <Link key={a.id} href={`/wissen/${a.id}`} className="card listitem">
                <span className={`udot ${a.requiresAck && !a.acknowledged ? 'warn' : 'off'}`} aria-label={a.requiresAck && !a.acknowledged ? 'Bestätigung offen' : undefined} />
                <span className="grow">
                  <span className="row wrap gap-s"><span className="chip info">{TYPE_LABEL[a.type] ?? a.type}</span><strong className="title">{a.title}</strong></span>
                  <span className="block muted small">Version {a.version} · {day(a.updatedAt)}{a.requiresAck && (a.acknowledged ? ' · bestätigt' : ' · bitte bestätigen')}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
