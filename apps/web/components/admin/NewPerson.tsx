'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { ErrorNote, useLoad, useSubmit } from '@/components/work';

interface Opts { companies: Array<{ id: string; name: string }>; groups: Array<{ id: string; name: string; companyId: string | null }> }
export interface Issued { id: string; code: string; expiresAt: string; username: string; displayName: string }

/** Person anlegen, die nicht aus Gastromatic kommt – z. B. Externe, Aushilfen, Praktikant:innen. */
export function NewPerson({ onDone, onCancel }: { onDone: (i: Issued) => void; onCancel: () => void }) {
  const { data: o } = useLoad<Opts>('/admin/options');
  const [f, setF] = useState({ firstName: '', lastName: '', username: '', external: false, companyId: '', jobTitle: '', validUntil: '', groupIds: [] as string[] });
  const { busy, error, run } = useSubmit();
  if (!o) return null;
  const companyId = f.companyId || o.companies[0]?.id || '';
  const suggest = (a: string, b: string) => `${a}.${b.charAt(0)}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9.]/g, '');
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<Issued>('/admin/users', { method: 'POST', json: { ...f, companyId, jobTitle: f.jobTitle || null, validUntil: f.validUntil || null } })); if (r) onDone(r); }}>
      <h2>Person anlegen</h2>
      <p className="small muted">Fest angestellte Kolleg:innen kommen später automatisch aus Gastromatic. Hier legst du z. B. Externe, Aushilfen oder Praktikant:innen an. Danach bekommst du einen Einmal-Code zum persönlichen Übergeben.</p>
      <div className="seg" role="group" aria-label="Art des Zugangs">
        <button type="button" aria-pressed={!f.external} onClick={() => setF({ ...f, external: false })}>Mitarbeitende:r</button>
        <button type="button" aria-pressed={f.external} onClick={() => setF({ ...f, external: true })}>Extern / Aushilfe</button>
      </div>
      <div className="grid">
        <div className="field"><label htmlFor="nf">Vorname</label><input id="nf" className="input" required value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value, username: suggest(e.target.value, f.lastName) })} /></div>
        <div className="field"><label htmlFor="nl">Nachname</label><input id="nl" className="input" required value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value, username: suggest(f.firstName, e.target.value) })} /></div>
        <div className="field"><label htmlFor="nu">Benutzername</label><input id="nu" className="input" required pattern="[a-z0-9._\-]{3,40}" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></div>
        <div className="field"><label htmlFor="nc">Gesellschaft</label><select id="nc" className="input" value={companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })}>{o.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {!f.external && <div className="field"><label htmlFor="nj">Tätigkeit</label><input id="nj" className="input" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} placeholder="z. B. Auszubildende Hotelfach" /></div>}
        <div className="field"><label htmlFor="nv">Zugang gültig bis{f.external ? '' : ' (optional)'}</label><input id="nv" type="date" className="input" required={f.external} value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></div>
      </div>
      <fieldset className="stack-s"><legend className="label">Teams & Gruppen</legend>
        <div className="checks">{o.groups.filter((g) => !g.companyId || g.companyId === companyId).map((g) => (
          <label key={g.id} className="check small"><input type="checkbox" checked={f.groupIds.includes(g.id)} onChange={(e) => setF({ ...f, groupIds: e.target.checked ? [...f.groupIds, g.id] : f.groupIds.filter((x) => x !== g.id) })} />{g.name}</label>
        ))}</div>
      </fieldset>
      <ErrorNote error={error} />
      <div className="row"><button type="button" className="btn" onClick={onCancel}>Abbrechen</button><button className="btn pri" disabled={busy}>Anlegen & Code erzeugen</button></div>
    </form>
  );
}
