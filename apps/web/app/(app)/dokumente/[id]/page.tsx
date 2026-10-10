'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReadStatus } from '@/components/content/ReadStatus';
import { api } from '@/lib/api';
import { Back, ErrorNote, State, dayTime, size, upload, useLoad, useSubmit } from '@/components/work';

interface D { id: string; title: string; description: string | null; category: string; sensitive: boolean; canUpdate: boolean; audience: string[]; versions: Array<{ n: number; fileId: string; name: string; size: number; changeNote: string | null; createdAt: string; by: string }> }

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, reload } = useLoad<D>(`/documents/${id}`);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const { busy, error: err, run } = useSubmit();
  if (!d) return <State error={error} loading back={['/dokumente', 'Zu den Dokumenten']} />;
  return (
    <div className="stack-lg narrow-col wide">
      <Back href="/dokumente" label="Dokumente" />
      <section className="card stack">
        <div className="chips"><span className="chip">{d.category}</span>{d.sensitive && <span className="chip warn">vertraulich</span>}</div>
        <h1>{d.title}</h1>
        {d.description && <p>{d.description}</p>}
        <p className="small muted">Für {d.audience.join(', ')}</p>
        <div className="row"><a className="btn pri" href={`/api/v1/files/${d.versions[0].fileId}`} target="_blank" rel="noopener">Aktuelle Version öffnen</a></div>
      </section>
      <section className="card stack">
        <h2 className="h-sub">Versionen</h2>
        <ol className="plain stack-s">
          {d.versions.map((v) => (
            <li key={v.n} className="row wrap between">
              <span><strong>Version {v.n}</strong> · {dayTime(v.createdAt)} · {v.by} · {size(v.size)}{v.changeNote && <span className="muted"> – {v.changeNote}</span>}</span>
              <a className="btn sm" href={`/api/v1/files/${v.fileId}`} target="_blank" rel="noopener">Öffnen</a>
            </li>
          ))}
        </ol>
        {d.canUpdate && (
          <form className="stack-s" onSubmit={async (e) => { e.preventDefault(); if (await run(async () => api(`/documents/${id}/versions`, { method: 'POST', json: { fileId: (await upload(file!)).id, changeNote: note || null } }))) { setFile(null); setNote(''); reload(); } }}>
            <h3>Neue Version hochladen</h3>
            <input type="file" className="input" aria-label="Datei" accept=".pdf,.docx,.xlsx,.pptx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <input className="input" aria-label="Was ist neu?" placeholder="Was ist neu?" value={note} onChange={(e) => setNote(e.target.value)} />
            <ErrorNote error={err} />
            <div><button className="btn" disabled={busy || !file}>{busy ? 'Lade hoch …' : 'Version hochladen'}</button></div>
          </form>
        )}
      </section>
      <ReadStatus contentId={d.id} />
    </div>
  );
}
