'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
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

interface Cat { id: string; name: string; parentId: string | null; path: string; sensitive: boolean }

/** Kategorie anlegen bzw. umbenennen (nur mit documents.manage_categories). */
function CategoryForm({ parentId, edit, onDone }: { parentId: string | null; edit?: Cat; onDone: () => void }) {
  const [name, setName] = useState(edit?.name ?? '');
  const [sensitive, setSensitive] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <form className="card stack-s" onSubmit={async (e) => { e.preventDefault(); if (await run(() => edit ? api(`/documents/categories/${edit.id}`, { method: 'PATCH', json: { name } }) : api('/documents/categories', { method: 'POST', json: { name, parentId, sensitive } }))) onDone(); }}>
      <div className="row wrap">
        <label className="sr" htmlFor="cn">Name der Kategorie</label>
        <input id="cn" className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name der Kategorie" required autoFocus />
        <button className="btn pri" disabled={busy}>{edit ? 'Umbenennen' : 'Anlegen'}</button>
        <button type="button" className="btn" onClick={onDone}>Abbrechen</button>
      </div>
      {!edit && <label className="check small"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />Vertraulich (nie in Suche und KI; gilt auch für Unterkategorien)</label>}
      <ErrorNote error={error} />
    </form>
  );
}

export default function Documents() {
  const { data, error, reload } = useLoad<{ canCreate: boolean; canManage: boolean; categories: Cat[]; documents: DocRow[] }>('/documents');
  const [adding, setAdding] = useState(false);
  const [folder, setFolder] = useState<string | null>(null);
  const [catForm, setCatForm] = useState<'new' | 'edit' | null>(null);
  const [q, setQ] = useState('');
  const { error: err, run } = useSubmit();
  const counts = useReadCounts((data?.documents ?? []).map((d) => d.id));
  if (!data) return <State error={error} loading />;
  const cats = data.categories;
  const current = cats.find((c) => c.id === folder) ?? null;
  const within = (catId: string, root: string): boolean => catId === root || (() => { const c = cats.find((x) => x.id === catId); return !!c?.parentId && within(c.parentId, root); })();
  const crumbs: Cat[] = []; for (let c = current; c; c = cats.find((x) => x.id === c!.parentId) ?? null) crumbs.unshift(c);
  const subs = cats.filter((c) => c.parentId === folder).map((c) => ({ ...c, n: data.documents.filter((d) => within(d.categoryId, c.id)).length }));
  const term = q.trim().toLowerCase();
  const docs = term ? data.documents.filter((d) => `${d.title} ${d.description ?? ''}`.toLowerCase().includes(term)) : data.documents.filter((d) => d.categoryId === folder);
  const sensitive = (d: DocRow) => cats.find((c) => c.id === d.categoryId)?.sensitive ?? d.sensitive;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Dokumente</h1>{data.canCreate && <button className="btn pri" onClick={() => setAdding(!adding)}><Icon name="plus" size={18} />Hochladen</button>}</div>
      {adding && <NewDocument onDone={() => { setAdding(false); reload(); }} />}
      <div className="field"><label htmlFor="dq" className="sr">Dokumente durchsuchen</label><input id="dq" type="search" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="In allen Dokumenten suchen …" /></div>
      {!term && (
        <nav aria-label="Kategorie-Pfad" className="row wrap gap-s">
          <button className={`lnk ${folder ? '' : 'strong'}`} onClick={() => setFolder(null)}>Alle Kategorien</button>
          {crumbs.map((c) => <span key={c.id} className="row gap-s"><span aria-hidden="true">›</span><button className={`lnk ${c.id === folder ? 'strong' : ''}`} onClick={() => setFolder(c.id)}>{c.name}</button></span>)}
          {data.canManage && (
            <span className="row gap-s" style={{ marginLeft: 'auto' }}>
              <button className="btn sm" onClick={() => setCatForm('new')}><Icon name="plus" size={14} />{folder ? 'Unterkategorie' : 'Kategorie'}</button>
              {current && <button className="btn sm" onClick={() => setCatForm('edit')}>Umbenennen</button>}
              {current && <button className="btn sm" onClick={() => run(() => api(`/documents/categories/${current.id}`, { method: 'PATCH', json: { isActive: false } })).then((r) => { if (r) { setFolder(current.parentId); reload(); } })}>Ausblenden</button>}
            </span>
          )}
        </nav>
      )}
      <ErrorNote error={err} />
      {catForm && <CategoryForm parentId={folder} edit={catForm === 'edit' ? current ?? undefined : undefined} onDone={() => { setCatForm(null); reload(); }} />}
      {!term && subs.length > 0 && (
        <div className="grid">
          {subs.map((c) => (
            <button key={c.id} className="card listitem folder" onClick={() => setFolder(c.id)}>
              <Icon name="doc" /><span className="grow"><strong>{c.name}</strong><span className="block small muted">{c.n} Dokument{c.n === 1 ? '' : 'e'}{c.sensitive && ' · vertraulich'}</span></span>
            </button>
          ))}
        </div>
      )}
      {docs.length === 0 ? ((term || (folder && !subs.length)) && <div className="card empty">{term ? 'Nichts gefunden.' : 'In dieser Kategorie liegen keine Dokumente.'}</div>) : (
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
