'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Audience, AudienceOption, ErrorNote, State, day, size, upload, useLoad, useSubmit } from '@/components/work';

interface DocRow { id: string; title: string; description: string | null; category: string; sensitive: boolean; current: { n: number; fileId: string; name: string; size: number; createdAt: string } }

function NewDocument({ onDone }: { onDone: () => void }) {
  const [o, setO] = useState<{ categories: Array<{ id: string; name: string; sensitive: boolean }>; audiences: AudienceOption[] } | null>(null);
  const [f, setF] = useState({ categoryId: '', title: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [audience, setAudience] = useState<string[]>([]);
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<NonNullable<typeof o>>('/documents/options').then((r) => { setO(r); setF((x) => ({ ...x, categoryId: r.categories[0]?.id ?? '' })); }); }, []);
  if (!o) return null;
  const sensitive = o.categories.find((c) => c.id === f.categoryId)?.sensitive;
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(async () => api('/documents', { method: 'POST', json: { ...f, description: f.description || null, fileId: (await upload(file!)).id, audience } }))) onDone(); }}>
      <h2>Dokument hochladen</h2>
      <div className="field"><label htmlFor="file">Datei (PDF, Word, Excel, PowerPoint – bis 20 MB)</label><input id="file" type="file" className="input" accept=".pdf,.docx,.xlsx,.pptx" onChange={(e) => { const x = e.target.files?.[0] ?? null; setFile(x); if (x && !f.title) setF({ ...f, title: x.name.replace(/\.[^.]+$/, '') }); }} required /></div>
      <div className="row wrap">
        <div className="field grow"><label htmlFor="t">Titel</label><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
        <div className="field grow"><label htmlFor="c">Kategorie</label><select id="c" className="input" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{o.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      </div>
      {sensitive && <p className="small muted">Vertrauliche Kategorie: erscheint nicht in Suche und KI-Assistent.</p>}
      <div className="field"><label htmlFor="d">Kurzbeschreibung (für die Suche)</label><input id="d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <Audience options={o.audiences} value={audience} onChange={setAudience} />
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri" disabled={busy || !file || !f.title || !audience.length}>{busy ? 'Lade hoch …' : 'Hochladen'}</button></div>
    </form>
  );
}

export default function Documents() {
  const { data, error, reload } = useLoad<{ canCreate: boolean; documents: DocRow[] }>('/documents');
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('');
  if (!data) return <State error={error} loading />;
  const cats = [...new Set(data.documents.map((d) => d.category))];
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Dokumente</h1>{data.canCreate && <button className="btn pri" onClick={() => setAdding(!adding)}><Icon name="plus" size={18} />Hochladen</button>}</div>
      {adding && <NewDocument onDone={() => { setAdding(false); reload(); }} />}
      {cats.length > 1 && <div className="chips" role="group" aria-label="Kategorie"><button className={`fchip ${!cat ? 'on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>Alle</button>{cats.map((c) => <button key={c} className={`fchip ${cat === c ? 'on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>}
      {data.documents.length === 0 ? <div className="card empty">Noch keine Dokumente für dich.</div> : (
        <div className="list">
          {data.documents.filter((d) => !cat || d.category === cat).map((d) => (
            <div key={d.id} className="card listitem">
              <Icon name="doc" />
              <span className="grow">
                <Link href={`/dokumente/${d.id}`} className="title title-link">{d.title}</Link>
                <span className="block muted small">{d.category}{d.sensitive && ' · vertraulich'} · Version {d.current.n} · {day(d.current.createdAt)} · {size(d.current.size)}</span>
                {d.description && <span className="block excerpt">{d.description}</span>}
              </span>
              <a className="btn sm" href={`/api/v1/files/${d.current.fileId}`} target="_blank" rel="noopener" aria-label={`${d.title} öffnen`}>Öffnen</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
