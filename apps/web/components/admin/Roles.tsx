'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { areaLabel, PERM_LABEL } from '@/lib/permissions';
import { ErrorNote, useLoad, useSubmit } from '@/components/work';

interface R { id: string; key: string; name: string; description: string | null; isSystem: boolean; users: number; permissions: string[] }
interface Data { permissions: Array<{ key: string; module: string; sensitive: boolean }>; roles: R[] }

/** Rollen & Rechte (ADR-055): Standardrollen ansehen, eigene Rollen zusammenstellen. Vergabe bei der Person. */
export function Roles() {
  const { data, error, reload } = useLoad<Data>('/admin/roles');
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; name: string; description: string; permissions: string[] } | null>(null);
  const { busy, error: err, run } = useSubmit();
  if (!data) return <ErrorNote error={error} />;
  const areas = [...new Set(data.permissions.map((p) => p.module))];
  const byArea = (keys: string[]) => areas.map((a) => [a, data.permissions.filter((p) => p.module === a && keys.includes(p.key))] as const).filter(([, ps]) => ps.length);
  async function save() {
    if (!edit) return;
    const body = { name: edit.name, description: edit.description || null, permissions: edit.permissions };
    if (await run(() => api(edit.id ? `/admin/roles/${edit.id}` : '/admin/roles', { method: edit.id ? 'PATCH' : 'POST', json: body }))) { setEdit(null); reload(); }
  }
  return (
    <section className="stack">
      <div className="row wrap"><p className="muted small grow">Was eine Rolle darf, siehst du hier. Vergeben wird sie bei der Person – für ein Haus oder ein Team. Standardrollen sind fest; für Abweichungen legst du eine eigene Rolle an. Rechte, die du selbst nicht hast, kannst du nicht weitergeben.</p>
        {!edit && <button className="btn pri" onClick={() => setEdit({ id: null, name: '', description: '', permissions: [] })}>Eigene Rolle anlegen</button>}</div>
      <ErrorNote error={err} />
      {edit && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h2>{edit.id ? 'Rolle bearbeiten' : 'Eigene Rolle'}</h2>
          <div className="grid">
            <div className="field"><label htmlFor="rn">Name</label><input id="rn" className="input" required minLength={2} maxLength={60} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="z. B. Azubi-Betreuung" /></div>
            <div className="field"><label htmlFor="rd">Wofür?</label><input id="rd" className="input" maxLength={200} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          </div>
          {areas.map((a) => (
            <fieldset key={a} className="stack-s"><legend className="label">{areaLabel(a)}</legend>
              <div className="checks">{data.permissions.filter((p) => p.module === a).map((p) => (
                <label key={p.key} className="check small"><input type="checkbox" checked={edit.permissions.includes(p.key)} onChange={(e) => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, p.key] : edit.permissions.filter((x) => x !== p.key) })} />
                  {PERM_LABEL[p.key] ?? p.key}{p.sensitive && <span className="chip warn">sensibel</span>}</label>
              ))}</div>
            </fieldset>
          ))}
          <div className="row"><button type="button" className="btn" onClick={() => setEdit(null)}>Abbrechen</button><button className="btn pri" disabled={busy}>Speichern</button></div>
        </form>
      )}
      <div className="list">
        {data.roles.map((r) => (
          <div key={r.id} className="card stack-s">
            <div className="row wrap">
              <span className="grow"><strong>{r.name}</strong> {r.isSystem ? <span className="chip">Standard</span> : <span className="chip info">eigene</span>}
                <span className="block small muted">{r.description ?? ''}{r.description ? ' · ' : ''}{r.permissions.length} Rechte · {r.users}× vergeben</span></span>
              <button className="btn sm" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Schließen' : 'Rechte ansehen'}</button>
              {!r.isSystem && <button className="btn sm" onClick={() => setEdit({ id: r.id, name: r.name, description: r.description ?? '', permissions: r.permissions })}>Bearbeiten</button>}
              {!r.isSystem && r.users === 0 && <button className="btn sm warn" onClick={async () => { await run(() => api(`/admin/roles/${r.id}`, { method: 'DELETE' })); reload(); }}>Löschen</button>}
            </div>
            {open === r.id && (
              <dl className="perm-list">{byArea(r.permissions).map(([a, ps]) => (
                <div key={a}><dt>{areaLabel(a)}</dt><dd>{ps.map((p) => PERM_LABEL[p.key] ?? p.key).join(' · ')}</dd></div>
              ))}</dl>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
