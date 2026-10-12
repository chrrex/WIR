'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { SectionTabs } from '@/components/SectionTabs';
import { Cat, Folders, within } from '@/components/Folders';
import { Audience, AudienceOption, ErrorNote, State, day, size, upload, useLoad, useSubmit } from '@/components/work';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface DocRow { id: string; title: string; description: string | null; categoryId: string; category: string; sensitive: boolean; current: { n: number; fileId: string; name: string; size: number; createdAt: string } }

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
  const { data, error, reload } = useLoad<{ canCreate: boolean; canManage: boolean; categories: Cat[]; documents: DocRow[] }>('/documents');
  const [adding, setAdding] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const counts = useReadCounts((data?.documents ?? []).map((d) => d.id));
  if (!data) return <State error={error} loading />;
  const cats = data.categories;
  const hasSubs = cats.some((c) => c.parentId === folder);
  const term = q.trim().toLowerCase();
  const docs = term ? data.documents.filter((d) => `${d.title} ${d.description ?? ''}`.toLowerCase().includes(term)) : data.documents.filter((d) => d.categoryId === folder);
  const sensitive = (d: DocRow) => cats.find((c) => c.id === d.categoryId)?.sensitive ?? d.sensitive;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Wissen & SOPs</h1>{data.canCreate && <button className="btn pri" onClick={() => setAdding(!adding)}><Icon name="plus" size={18} />Hochladen</button>}</div>
      <SectionTabs />
      {adding && <NewDocument onDone={() => { setAdding(false); reload(); }} />}
      <div className="field"><label htmlFor="dq" className="sr">Dokumente durchsuchen</label><input id="dq" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="In allen Dokumenten suchen …" /></div>
      {!term && <Folders cats={cats} folder={folder} setFolder={setFolder} canManage={data.canManage} base="/documents/categories" sensitiveOption onChange={reload}
        count={(id) => data.documents.filter((d) => within(cats, d.categoryId, id)).length} />}
      {docs.length === 0 ? ((term || (folder && !hasSubs)) && <div className="card empty">{term ? 'Nichts gefunden.' : 'In dieser Kategorie liegen keine Dokumente.'}</div>) : (
        <div className="list">
          {docs.map((d) => (
            <div key={d.id} className="card listitem">
              <Icon name="doc" />
              <span className="grow">
                <Link href={`/dokumente/${d.id}`} className="title title-link">{d.title}</Link>
                <span className="block muted small">{term && `${cats.find((c) => c.id === d.categoryId)?.path ?? d.category} · `}{sensitive(d) && 'vertraulich · '}Version {d.current.n} · {day(d.current.createdAt)} · {size(d.current.size)} <ReadChip c={counts[d.id]} /></span>
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
