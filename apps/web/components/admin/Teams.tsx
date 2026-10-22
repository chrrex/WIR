'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { GROUP_TYPE_LABEL } from '@/lib/permissions';
import { ErrorNote, PersonPicker, useLoad, useSubmit } from '@/components/work';

interface G { id: string; name: string; type: string; description: string | null; isActive: boolean; source: string; company: string; companyId: string | null; parent: string | null; parentGroupId: string | null; members: Array<{ id: string; name: string; isLead: boolean }> }
interface Opts { companies: Array<{ id: string; name: string }>; groupTypes: string[] }

/** Teams & Gruppen (ADR-055): auch Gruppen quer über Teams, z. B. „Azubis“ – nutzbar als Empfänger für News, Übergaben, Aufgaben. */
export function Teams() {
  const { data, reload, error } = useLoad<G[]>('/admin/groups');
  const { data: o } = useLoad<Opts>('/admin/options');
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [f, setF] = useState<{ name: string; type: string; companyId: string; parentGroupId: string; description: string } | null>(null);
  const { busy, error: err, run } = useSubmit();
  if (!data || !o) return <ErrorNote error={error} />;
  const member = (g: G, userId: string, isLead: boolean) => run(() => api(`/admin/groups/${g.id}/members`, { method: 'POST', json: { userId, isLead } })).then(reload);
  const remove = (g: G, userId: string) => run(() => api(`/admin/groups/${g.id}/members/${userId}`, { method: 'DELETE' })).then(reload);
  return (
    <section className="stack">
      <div className="row wrap"><p className="muted small grow">Teams kommen später auch aus Gastromatic. Eigene Gruppen – z. B. <strong>Azubis</strong>, Ersthelfer:innen oder ein Projektteam – legst du hier an. Sie stehen dann überall als Empfänger zur Wahl.</p>
        {!f && <button className="btn pri" onClick={() => setF({ name: '', type: 'CUSTOM', companyId: o.companies[0]?.id ?? '', parentGroupId: '', description: '' })}>Gruppe anlegen</button>}</div>
      <ErrorNote error={err} />
      {f && (
        <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/admin/groups', { method: 'POST', json: { ...f, companyId: f.companyId || null, parentGroupId: f.parentGroupId || null, description: f.description || null } }))) { setF(null); reload(); } }}>
          <h2>Neue Gruppe</h2>
          <div className="grid">
            <div className="field"><label htmlFor="gn">Name</label><input id="gn" className="input" required minLength={2} maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="z. B. Azubis" /></div>
            <div className="field"><label htmlFor="gt">Art</label><select id="gt" className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{o.groupTypes.map((t) => <option key={t} value={t}>{GROUP_TYPE_LABEL[t]}{t === 'CUSTOM' ? ' (z. B. Azubis, Ersthelfer:innen)' : ''}</option>)}</select></div>
            <div className="field"><label htmlFor="gc">Gesellschaft</label><select id="gc" className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>{o.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="field"><label htmlFor="gp">Liegt unter (optional)</label><select id="gp" className="input" value={f.parentGroupId} onChange={(e) => setF({ ...f, parentGroupId: e.target.value })}><option value="">–</option>{data.filter((g) => g.isActive && g.companyId === f.companyId).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          </div>
          <div className="field"><label htmlFor="gd">Beschreibung (optional)</label><input id="gd" className="input" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="row"><button type="button" className="btn" onClick={() => setF(null)}>Abbrechen</button><button className="btn pri" disabled={busy}>Anlegen</button></div>
        </form>
      )}
      <div className="list">
        {data.map((g) => (
          <div key={g.id} className={`card stack-s ${g.isActive ? '' : 'muted'}`}>
            <div className="row wrap">
              <span className="grow"><strong>{g.name}</strong> <span className="chip">{GROUP_TYPE_LABEL[g.type] ?? g.type}</span>{!g.isActive && <span className="chip">aufgelöst</span>}{g.source === 'GASTROMATIC' && <span className="chip info">aus Gastromatic</span>}
                <span className="block small muted">{[g.company, g.parent && `unter ${g.parent}`, `${g.members.length} Mitglieder`, g.members.filter((m) => m.isLead).map((m) => `Leitung: ${m.name}`).join(', ')].filter(Boolean).join(' · ')}</span></span>
              <button className="btn sm" aria-expanded={open === g.id} onClick={() => { setOpen(open === g.id ? null : g.id); setName(g.name); }}>{open === g.id ? 'Schließen' : 'Bearbeiten'}</button>
            </div>
            {open === g.id && (
              <div className="stack-s">
                {g.description && <p className="small">{g.description}</p>}
                <ul className="plain stack-s">
                  {g.members.map((m) => (
                    <li key={m.id} className="row wrap">
                      <Link className="grow lnk" href={`/verwaltung/personen/${m.id}`}>{m.name}</Link>
                      <label className="check small"><input type="checkbox" checked={m.isLead} disabled={busy} onChange={(e) => member(g, m.id, e.target.checked)} />Leitung</label>
                      <button className="btn sm" disabled={busy} onClick={() => remove(g, m.id)} aria-label={`${m.name} aus ${g.name} entfernen`}>Entfernen</button>
                    </li>
                  ))}
                </ul>
                {g.isActive && <PersonPicker value={null} onChange={(p) => p && member(g, p.id, false)} />}
                <div className="row wrap">
                  <label className="sr" htmlFor={`gr-${g.id}`}>Name</label>
                  <input id={`gr-${g.id}`} className="input grow" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                  <button className="btn sm" disabled={busy || name.trim().length < 2 || name === g.name} onClick={async () => { await run(() => api(`/admin/groups/${g.id}`, { method: 'PATCH', json: { name: name.trim() } })); reload(); }}>Umbenennen</button>
                  <button className={`btn sm ${g.isActive ? 'warn' : ''}`} onClick={async () => { await run(() => api(`/admin/groups/${g.id}`, { method: 'PATCH', json: { isActive: !g.isActive } })); reload(); }}>{g.isActive ? 'Auflösen' : 'Wieder aktivieren'}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
