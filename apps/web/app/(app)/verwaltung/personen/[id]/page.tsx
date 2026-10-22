'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { GROUP_TYPE_LABEL } from '@/lib/permissions';
import { Avatar } from '@/components/content/Avatar';
import { Back, ErrorNote, State, day, useLoad, useSubmit } from '@/components/work';

interface P {
  id: string; username: string; displayName: string; status: string; userType: string; validUntil: string | null; lastLoginAt: string | null;
  firstName: string | null; lastName: string | null; jobTitle: string | null; company: string | null; companyId: string | null; source: string; personnelNumber: string | null;
  groups: Array<{ id: string; name: string; isLead: boolean }>; roles: Array<{ id: string; key: string; name: string; scope: string; validUntil: string | null }>;
  canManage: boolean; canRoles: boolean; canGroups: boolean; isMe: boolean;
}
interface Opts { companies: Array<{ id: string; name: string }>; groups: Array<{ id: string; name: string; type: string; companyId: string | null }>; roles: Array<{ key: string; name: string; description: string | null }> }

/** Person bearbeiten (ADR-055): Stammdaten, Teams & Leitung, Rollen. */
export default function PersonAdmin() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, setData } = useLoad<P>(`/admin/users/${id}`);
  const { data: o } = useLoad<Opts>('/admin/options');
  const { busy, error: err, run } = useSubmit();
  const [f, setF] = useState<{ displayName: string; jobTitle: string; validUntil: string } | null>(null);
  const [g, setG] = useState({ groupId: '', isLead: false });
  const [r, setR] = useState({ roleKey: '', scope: '', validUntil: '' });
  const [saved, setSaved] = useState(false);
  if (!p || !o) return <State error={error} loading back={['/verwaltung', 'Zur Verwaltung']} />;
  const form = f ?? { displayName: p.displayName, jobTitle: p.jobTitle ?? '', validUntil: p.validUntil?.slice(0, 10) ?? '' };
  const reload = async () => setData(await api<P>(`/admin/users/${id}`));
  const scopes = [...o.companies.map((c) => ({ key: `C:${c.id}`, label: `Gesellschaft: ${c.name}` })), ...o.groups.map((x) => ({ key: `G:${x.id}`, label: `${GROUP_TYPE_LABEL[x.type] ?? 'Gruppe'}: ${x.name}` }))];
  return (
    <div className="stack-lg narrow-col">
      <Back href="/verwaltung?tab=alle" label="Alle Personen" />
      <div className="row"><Avatar name={p.displayName} id={p.id} size="l" /><div><h1>{p.displayName}</h1><p className="muted">{p.username}{p.userType === 'EXTERNAL' ? ' · extern' : ''} · {p.company ?? '–'}{p.personnelNumber ? ` · Pers.-Nr. ${p.personnelNumber}` : ''}</p></div></div>
      <ErrorNote error={err} />

      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); const x = await run(() => api<P>(`/admin/users/${id}`, { method: 'PATCH', json: { displayName: form.displayName, jobTitle: form.jobTitle || null, validUntil: form.validUntil || null } })); if (x) { setData(x); setF(null); setSaved(true); setTimeout(() => setSaved(false), 2500); } }}>
        <h2>Stammdaten</h2>
        {p.source === 'GASTROMATIC' && <p className="small muted">Kommt aus Gastromatic – Änderungen dort pflegen, sonst überschreibt der nächste Abgleich sie.</p>}
        <div className="grid">
          <div className="field"><label htmlFor="dn">Anzeigename</label><input id="dn" className="input" disabled={!p.canManage} value={form.displayName} onChange={(e) => setF({ ...form, displayName: e.target.value })} /></div>
          <div className="field"><label htmlFor="jt">Tätigkeit</label><input id="jt" className="input" disabled={!p.canManage || p.userType === 'EXTERNAL'} value={form.jobTitle} onChange={(e) => setF({ ...form, jobTitle: e.target.value })} /></div>
          <div className="field"><label htmlFor="vu">Zugang gültig bis {p.userType === 'EXTERNAL' ? '' : '(optional)'}</label><input id="vu" type="date" className="input" disabled={!p.canManage} value={form.validUntil} onChange={(e) => setF({ ...form, validUntil: e.target.value })} /></div>
        </div>
        <p className="small muted">Status: {({ PROVISIONED: 'wartet auf Freischaltung', INVITED: 'Code ausgegeben', ACTIVE: 'aktiv', LOCKED: 'gesperrt', DEACTIVATED: 'deaktiviert' } as Record<string, string>)[p.status] ?? p.status} · letzte Anmeldung {p.lastLoginAt ? day(p.lastLoginAt) : '–'}</p>
        {p.canManage && <div className="row"><button className="btn pri" disabled={busy || !f}>Speichern</button>{saved && <span className="small" role="status">Gespeichert</span>}</div>}
      </form>

      <section className="card stack">
        <h2>Teams & Gruppen</h2>
        {p.groups.length === 0 && <p className="muted small">Noch in keinem Team.</p>}
        <ul className="plain stack-s">{p.groups.map((x) => (
          <li key={x.id} className="row wrap"><span className="grow">{x.name}{x.isLead && <span className="chip info">Leitung</span>}</span>
            {p.canGroups && <>
              <button className="btn sm" disabled={busy} onClick={async () => { await run(() => api(`/admin/groups/${x.id}/members`, { method: 'POST', json: { userId: id, isLead: !x.isLead } })); await reload(); }}>{x.isLead ? 'Leitung abgeben' : 'Zur Leitung machen'}</button>
              <button className="btn sm" disabled={busy} aria-label={`Aus ${x.name} entfernen`} onClick={async () => { await run(() => api(`/admin/groups/${x.id}/members/${id}`, { method: 'DELETE' })); await reload(); }}>Entfernen</button>
            </>}
          </li>
        ))}</ul>
        {p.canGroups && (
          <div className="row wrap">
            <label className="sr" htmlFor="ng">Team oder Gruppe</label>
            <select id="ng" className="input grow" value={g.groupId} onChange={(e) => setG({ ...g, groupId: e.target.value })}><option value="">Team oder Gruppe wählen …</option>{o.groups.filter((x) => !p.groups.some((y) => y.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <label className="check small"><input type="checkbox" checked={g.isLead} onChange={(e) => setG({ ...g, isLead: e.target.checked })} />als Leitung</label>
            <button className="btn" disabled={busy || !g.groupId} onClick={async () => { await run(() => api(`/admin/groups/${g.groupId}/members`, { method: 'POST', json: { userId: id, isLead: g.isLead } })); setG({ groupId: '', isLead: false }); await reload(); }}>Hinzufügen</button>
          </div>
        )}
      </section>

      <section className="card stack">
        <h2>Rollen</h2>
        <ul className="plain stack-s">{p.roles.map((x) => (
          <li key={x.id} className="row wrap"><span className="grow"><strong>{x.name}</strong> <span className="small muted">· {x.scope}{x.validUntil ? ` · bis ${day(x.validUntil)}` : ''}</span></span>
            {p.canRoles && !p.isMe && <button className="btn sm" disabled={busy} aria-label={`Rolle ${x.name} entziehen`} onClick={async () => { const n = await run(() => api<P>(`/admin/users/${id}/roles/${x.id}`, { method: 'DELETE' })); if (n) setData(n); }}>Entziehen</button>}
          </li>
        ))}</ul>
        {p.isMe && <p className="small muted">Deine eigenen Rollen ändert eine zweite Person (Vier-Augen-Prinzip).</p>}
        {p.canRoles && !p.isMe && (
          <form className="stack-s" onSubmit={async (e) => { e.preventDefault(); const [t, sid] = r.scope.split(':'); const n = await run(() => api<P>(`/admin/users/${id}/roles`, { method: 'POST', json: { roleKey: r.roleKey, companyId: t === 'C' ? sid : null, groupId: t === 'G' ? sid : null, validUntil: r.validUntil || null } })); if (n) { setData(n); setR({ roleKey: '', scope: '', validUntil: '' }); } }}>
            <div className="grid">
              <div className="field"><label htmlFor="rk">Rolle</label><select id="rk" className="input" required value={r.roleKey} onChange={(e) => setR({ ...r, roleKey: e.target.value })}><option value="">wählen …</option>{o.roles.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select></div>
              <div className="field"><label htmlFor="rs">Gilt für</label><select id="rs" className="input" required value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value })}><option value="">wählen …</option>{scopes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
              <div className="field"><label htmlFor="rv">Befristet bis (optional)</label><input id="rv" type="date" className="input" value={r.validUntil} onChange={(e) => setR({ ...r, validUntil: e.target.value })} /></div>
            </div>
            {r.roleKey && <p className="small muted">{o.roles.find((x) => x.key === r.roleKey)?.description}</p>}
            <div className="row"><button className="btn" disabled={busy}>Rolle vergeben</button></div>
          </form>
        )}
      </section>
    </div>
  );
}
