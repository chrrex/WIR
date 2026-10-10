'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { ErrorNote, State, useLoad, useSubmit } from '@/components/work';
import { when } from '@/lib/time';

interface I { id: string; title: string; excerpt: string; status: string; category: string | null; author: string; publishedAt: string; likes: number; comments: number; liked: boolean }
interface Data { canCreate: boolean; statusLabels: Record<string, string>; categories: Array<{ id: string; name: string }>; ideas: I[] }
const DONE = ['IMPLEMENTED', 'REJECTED', 'PARKED'];

export default function Ideas() {
  const { data, error, reload } = useLoad<Data>('/ideas');
  const [f, setF] = useState<{ title: string; description: string; categoryId: string } | null>(null);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const { busy, error: err, run } = useSubmit();
  if (!data) return <State error={error} loading />;
  const list = data.ideas.filter((i) => (tab === 'done') === DONE.includes(i.status)).sort((a, b) => b.likes - a.likes);
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Ideen</h1>{data.canCreate && !f && <button className="btn pri" onClick={() => setF({ title: '', description: '', categoryId: '' })}><Icon name="plus" size={18} />Idee einreichen</button>}</div>
      {f && (
        <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/ideas', { method: 'POST', json: { ...f, categoryId: f.categoryId || null } }))) { setF(null); reload(); } }}>
          <h2>Deine Idee</h2>
          <div className="field"><label htmlFor="it">Kurz und knackig</label><input id="it" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={140} /></div>
          <div className="field"><label htmlFor="id">Was soll besser werden – und wie?</label><textarea id="id" className="input area" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={10} /></div>
          <div className="field"><label htmlFor="ic">Thema</label><select id="ic" className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">Ohne Thema</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <ErrorNote error={err} />
          <div className="row"><button type="button" className="btn" onClick={() => setF(null)}>Abbrechen</button><button className="btn pri" disabled={busy}>Einreichen</button></div>
        </form>
      )}
      <div className="tabs" role="tablist"><button role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>Im Gespräch</button><button role="tab" aria-selected={tab === 'done'} onClick={() => setTab('done')}>Abgeschlossen</button></div>
      {list.length === 0 ? <div className="card empty">Hier ist noch nichts.</div> : (
        <div className="list">
          {list.map((i) => (
            <Link key={i.id} href={`/ideen/${i.id}`} className="card listitem">
              <span className="votes" aria-label={`${i.likes} Unterstützer:innen`}><Icon name="thumb" size={18} /><strong>{i.likes}</strong></span>
              <span className="grow">
                <span className="row wrap gap-s"><span className={`chip ${i.status === 'IMPLEMENTED' ? 'ok' : 'info'}`}>{data.statusLabels[i.status]}</span>{i.category && <span className="chip">{i.category}</span>}<strong className="title">{i.title}</strong></span>
                <span className="block muted small">{i.author} · {when(i.publishedAt)}{i.comments > 0 && ` · ${i.comments} Kommentar${i.comments > 1 ? 'e' : ''}`}</span>
                <span className="block excerpt">{i.excerpt}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
