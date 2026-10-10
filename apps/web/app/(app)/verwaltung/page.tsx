'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';

interface AdminUser {
  id: string; username: string; displayName: string; status: string; userType: string; source: string;
  personnelNumber: string | null; jobTitle: string | null; company: string | null; groups: string[];
  lastLoginAt: string | null; validUntil: string | null;
}
interface Issued { code: string; expiresAt: string; username: string; displayName: string }
interface Report { id: string; kind: string; reason: string; createdAt: string; link: string | null; title: string; excerpt: string; author: string }
interface AuditRow { id: string; at: string; actor: string; action: string; target: string | null }

const STATUS: Record<string, string> = { PROVISIONED: 'wartet auf Freischaltung', INVITED: 'Code ausgegeben', ACTIVE: 'aktiv', LOCKED: 'gesperrt', DEACTIVATED: 'deaktiviert' };
const ACTIONS: Record<string, string> = {
  'auth.login': 'hat sich angemeldet', 'auth.login_failed': 'Fehlversuch bei der Anmeldung', 'auth.locked_temporarily': 'vorübergehend gesperrt (Fehlversuche)',
  'auth.one_time_code_used': 'hat den Einmal-Code genutzt', 'auth.password_changed': 'hat das Passwort geändert',
  'user.activated': 'freigeschaltet', 'user.one_time_code_issued': 'Einmal-Code ausgegeben', 'user.deactivated': 'deaktiviert', 'system.seeded': 'Demo-Daten angelegt',
};

export default function AdminPage() {
  const { can } = useMe();
  const [tab, setTab] = useState<'neu' | 'alle' | 'protokoll' | 'meldungen'>(can('users.read') ? 'neu' : 'meldungen');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminUser | null>(null);

  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'meldungen' && can('social.moderate')) setTab('meldungen'); }, [can]);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (tab === 'protokoll') setAudit(await api<AuditRow[]>('/admin/audit?limit=60'));
      else if (tab === 'meldungen') setReports(await api<Report[]>('/moderation/reports'));
      else setUsers(await api<AdminUser[]>(`/admin/users${tab === 'neu' ? '?status=PROVISIONED' : ''}`));
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Laden hat nicht geklappt.'); }
  }, [tab]);
  useEffect(() => { void load(); }, [load]);

  async function act(path: string, u: AdminUser) {
    setError(null);
    try {
      const res = await api<Issued | { ok: true }>(path, { method: 'POST' });
      if ('code' in res) setIssued(res);
      setConfirm(null);
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : `Das hat bei ${u.displayName} nicht geklappt.`); }
  }

  if (!can('users.read') && !can('audit.read') && !can('social.moderate')) {
    return <div className="card narrow stack"><h1>Kein Zugriff</h1><p className="muted">Die Verwaltung ist nur für berechtigte Personen.</p></div>;
  }

  const tabs: Array<[typeof tab, string, boolean]> = [
    ['neu', 'Neu aus Gastromatic', can('users.read')], ['alle', 'Alle Personen', can('users.read')], ['protokoll', 'Protokoll', can('audit.read')], ['meldungen', 'Meldungen', can('social.moderate')],
  ];

  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Verwaltung</h1></div>
      <div className="tabs" role="tablist">
        {tabs.filter((t) => t[2]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setIssued(null); }}>{label}</button>
        ))}
      </div>
      {error && <div className="note warn" role="alert">{error}</div>}

      {issued && (
        <section className="card issued" aria-live="polite">
          <div className="eyebrow">Einmal-Code für {issued.displayName} ({issued.username})</div>
          <div className="bigcode">{issued.code}</div>
          <p className="muted small">Gültig bis {new Date(issued.expiresAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · bitte persönlich übergeben. Der Code wird nur jetzt angezeigt und nirgends im Klartext gespeichert.</p>
          <button className="btn" onClick={() => setIssued(null)}>Erledigt</button>
        </section>
      )}

      {tab === 'neu' && (
        <section className="stack">
          <div className="note info"><Icon name="check" size={18} /><span>Neue Kolleg:innen legt Gastromatic an. Hier prüfst du kurz und schaltest frei – dann gibst du den Einmal-Code persönlich weiter.</span></div>
          {users?.length === 0 && <div className="card empty">Niemand wartet auf Freischaltung.</div>}
          {users?.map((u) => (
            <div className="card row wrap person" key={u.id}>
              <span className="av">{u.displayName.slice(0, 2).toUpperCase()}</span>
              <span className="grow">
                <strong>{u.displayName}</strong> <span className="muted">· {u.username}</span>
                <span className="small muted block">{[u.jobTitle, u.groups.join(', '), u.company, u.personnelNumber && `Pers.-Nr. ${u.personnelNumber}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="chip">aus {u.source === 'GASTROMATIC' ? 'Gastromatic' : 'WIR'}</span>
              {can('users.manage') && <button className="btn pri" onClick={() => act(`/admin/users/${u.id}/activate`, u)}>Freischalten</button>}
            </div>
          ))}
        </section>
      )}

      {tab === 'alle' && (
        <section className="card table-wrap">
          <table>
            <thead><tr><th>Person</th><th>Bereich</th><th>Status</th><th>Letzte Anmeldung</th><th><span className="sr">Aktionen</span></th></tr></thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.displayName}</strong><div className="small muted">{u.username}{u.userType === 'EXTERNAL' ? ' · extern' : ''}</div></td>
                  <td>{u.groups.join(', ') || '–'}</td>
                  <td><span className={`chip st-${u.status.toLowerCase()}`}>{STATUS[u.status] ?? u.status}</span></td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('de-DE') : '–'}</td>
                  <td className="actions">
                    {u.status !== 'PROVISIONED' && u.status !== 'DEACTIVATED' && can('users.reset_password') && (
                      <button className="btn sm" onClick={() => act(`/admin/users/${u.id}/one-time-code`, u)}>Neuer Code</button>
                    )}
                    {u.status !== 'DEACTIVATED' && can('users.deactivate') && (
                      <button className="btn sm warn" onClick={() => setConfirm(u)}>Deaktivieren</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'protokoll' && (
        <section className="card table-wrap">
          <p className="muted small">Sicherheitsrelevante Aktionen. Keine Inhalte, keine Codes, keine Passwörter.</p>
          <table>
            <thead><tr><th>Zeit</th><th>Wer</th><th>Was</th><th>Betrifft</th></tr></thead>
            <tbody>
              {audit?.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{a.actor}</td><td>{ACTIONS[a.action] ?? a.action}</td><td>{a.target ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'meldungen' && (
        <section className="stack">
          <div className="note info"><Icon name="flag" size={18} /><span>Gemeldete Beiträge und Kommentare. Wer gemeldet hat, bleibt anonym. Ausblenden ist protokolliert.</span></div>
          {reports?.length === 0 && <div className="card empty">Keine offenen Meldungen.</div>}
          {reports?.map((r) => (
            <div className="card stack-s" key={r.id}>
              <div className="row wrap gap-s"><span className="chip">{r.kind}</span><strong>{r.title}</strong><span className="small muted">von {r.author}</span></div>
              {r.excerpt && <p className="excerpt">{r.excerpt}</p>}
              <div className="note warn small"><span><strong>Grund:</strong> {r.reason}</span></div>
              <div className="row wrap">
                {r.link && <a className="btn sm" href={r.link}>Ansehen</a>}
                <button className="btn sm warn" onClick={async () => { await api(`/moderation/reports/${r.id}/hide`, { method: 'POST' }); await load(); }}>Ausblenden</button>
                <button className="btn sm" onClick={async () => { await api(`/moderation/reports/${r.id}/dismiss`, { method: 'POST' }); await load(); }}>Ist in Ordnung</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {confirm && (
        <div className="sheet-backdrop" onClick={() => setConfirm(null)}>
          <div className="dialog" role="alertdialog" aria-label="Zugang deaktivieren" onClick={(e) => e.stopPropagation()}>
            <h2>{confirm.displayName} deaktivieren?</h2>
            <p className="muted">Die Person wird sofort abgemeldet und kann sich nicht mehr anmelden. Beiträge bleiben erhalten. Endgültiges Löschen ist ein eigener Schritt.</p>
            <div className="row">
              <button className="btn" onClick={() => setConfirm(null)}>Abbrechen</button>
              <button className="btn warn" onClick={() => act(`/admin/users/${confirm.id}/deactivate`, confirm)}>Deaktivieren</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
