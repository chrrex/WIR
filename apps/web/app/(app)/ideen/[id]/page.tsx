'use client';

import { BookmarkButton } from '@/components/content/Extras';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReadStatus } from '@/components/content/ReadStatus';
import { api } from '@/lib/api';
import { Comments } from '@/components/content/Comments';
import { LikeButton } from '@/components/content/LikeButton';
import { RichText } from '@/components/content/MentionText';
import { Back, ErrorNote, State, day, useLoad, useSubmit } from '@/components/work';

interface I { id: string; title: string; description: string; status: string; category: string | null; author: string; publishedAt: string; canManage: boolean; statusLabels: Record<string, string>;
  history: Array<{ status: string; note: string | null; at: string; by: string | null }>; liked: boolean; likes: number }

export default function Idea() {
  const { id } = useParams<{ id: string }>();
  const { data: i, error, reload } = useLoad<I>(`/ideas/${id}`);
  const [s, setS] = useState({ status: '', note: '' });
  const { busy, error: err, run } = useSubmit();
  if (!i) return <State error={error} loading back={['/ideen', 'Zu den Ideen']} />;
  return (
    <div className="stack-lg narrow-col wide">
      <Back href="/ideen" label="Ideen" />
      <article className="card article stack">
        <div className="chips"><span className="chip info">{i.statusLabels[i.status]}</span>{i.category && <span className="chip">{i.category}</span>}</div>
        <h1>{i.title}</h1>
        <p className="small muted">{i.author} · {day(i.publishedAt)}</p>
        <div className="prose"><RichText text={i.description} /></div>
        <div className="actions-bar"><LikeButton contentId={i.id} liked={i.liked} likes={i.likes} label="Unterstützen" /><BookmarkButton contentId={i.id} /></div>
        <h2 className="h-sub">Verlauf</h2>
        <ol className="plain stack-s">{i.history.map((h, n) => <li key={n} className="small"><strong>{i.statusLabels[h.status]}</strong> · {day(h.at)}{h.by && ` · ${h.by}`}{h.note && <span className="muted"> – {h.note}</span>}</li>)}</ol>
        {i.canManage && (
          <form className="row wrap" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/ideas/${id}/status`, { method: 'PATCH', json: { status: s.status, note: s.note || null } }))) { setS({ status: '', note: '' }); reload(); } }}>
            <label className="sr" htmlFor="st">Neuer Status</label>
            <select id="st" className="input" value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}><option value="">Status ändern …</option>{Object.entries(i.statusLabels).filter(([k]) => k !== i.status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <input className="input grow" aria-label="Begründung" placeholder="Kurze Begründung für die Einreicher:in" value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} />
            <button className="btn" disabled={busy || !s.status}>Speichern</button>
          </form>
        )}
        <ErrorNote error={err} />
        <h2 className="h-sub">Kommentare</h2>
        <Comments contentId={i.id} />
      </article>
      <ReadStatus contentId={i.id} />
    </div>
  );
}
