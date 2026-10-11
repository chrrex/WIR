'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { ErrorNote, useSubmit } from '@/components/work';

export interface Cat { id: string; name: string; parentId: string | null; path: string; sensitive: boolean }

/** Liegt `catId` in `root` (oder darunter)? */
export function within(cats: Cat[], catId: string, root: string): boolean {
  for (let c = cats.find((x) => x.id === catId); c; c = cats.find((x) => x.id === c!.parentId)) if (c.id === root) return true;
  return false;
}

/** Ordner-Navigation für Kategorien (Wissen, Dokumente): Pfad, Unterordner, Anlegen/Umbenennen/Ausblenden. */
export function Folders({ cats, folder, setFolder, count, canManage, base, sensitiveOption, onChange }: {
  cats: Cat[]; folder: string | null; setFolder: (id: string | null) => void; count: (catId: string) => number;
  canManage: boolean; base: string; sensitiveOption?: boolean; onChange: () => void;
}) {
  const [form, setForm] = useState<'new' | 'edit' | null>(null);
  const [name, setName] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const { busy, error, run } = useSubmit();
  const current = cats.find((c) => c.id === folder) ?? null;
  const crumbs: Cat[] = [];
  for (let c = current; c; c = cats.find((x) => x.id === c!.parentId) ?? null) crumbs.unshift(c);
  const subs = cats.filter((c) => c.parentId === folder);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => (form === 'edit' && current ? api(`${base}/${current.id}`, { method: 'PATCH', json: { name } }) : api(base, { method: 'POST', json: { name, parentId: folder, sensitive } })));
    if (ok) { setForm(null); setName(''); onChange(); }
  };
  return (
    <div className="stack">
      <nav aria-label="Kategorie-Pfad" className="row wrap gap-s">
        <button className={`lnk ${folder ? '' : 'strong'}`} onClick={() => setFolder(null)}>Alle Kategorien</button>
        {crumbs.map((c) => <span key={c.id} className="row gap-s"><span aria-hidden="true">›</span><button className={`lnk ${c.id === folder ? 'strong' : ''}`} onClick={() => setFolder(c.id)}>{c.name}</button></span>)}
        {canManage && (
          <span className="row gap-s" style={{ marginLeft: 'auto' }}>
            <button className="btn sm" onClick={() => { setForm('new'); setName(''); }}><Icon name="plus" size={14} />{folder ? 'Unterkategorie' : 'Kategorie'}</button>
            {current && <button className="btn sm" onClick={() => { setForm('edit'); setName(current.name); }}>Umbenennen</button>}
            {current && <button className="btn sm" disabled={busy} onClick={() => run(() => api(`${base}/${current.id}`, { method: 'PATCH', json: { isActive: false } })).then((r) => { if (r) { setFolder(current.parentId); onChange(); } })}>Ausblenden</button>}
          </span>
        )}
      </nav>
      {form && (
        <form className="card stack-s" onSubmit={save}>
          <div className="row wrap">
            <label className="sr" htmlFor="cn">Name der Kategorie</label>
            <input id="cn" className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name der Kategorie" required autoFocus />
            <button className="btn pri" disabled={busy}>{form === 'edit' ? 'Umbenennen' : 'Anlegen'}</button>
            <button type="button" className="btn" onClick={() => setForm(null)}>Abbrechen</button>
          </div>
          {form === 'new' && sensitiveOption && <label className="check small"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />Vertraulich (nie in Suche und KI; gilt auch für Unterkategorien)</label>}
        </form>
      )}
      <ErrorNote error={error} />
      {subs.length > 0 && (
        <div className="grid">
          {subs.map((c) => { const n = count(c.id); return (
            <button key={c.id} className="card listitem folder" onClick={() => setFolder(c.id)}>
              <Icon name="list" /><span className="grow"><strong>{c.name}</strong><span className="block small muted">{n} {n === 1 ? 'Eintrag' : 'Einträge'}{c.sensitive && ' · vertraulich'}</span></span>
            </button>
          ); })}
        </div>
      )}
    </div>
  );
}
