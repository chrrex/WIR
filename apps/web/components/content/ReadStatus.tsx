'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '../Icon';

interface Status {
  enabled: boolean; visible?: boolean; read?: number; total?: number; canRemind?: boolean;
  people?: Array<{ id: string; name: string; group: string; readOn: string | null }> | null;
}

/** Lesestatus – nur sichtbar, wenn eingeschaltet und berechtigt (ADR-012). Keine Uhrzeiten, nur „gelesen“. */
export function ReadStatus({ contentId }: { contentId: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [tab, setTab] = useState<'open' | 'read'>('open');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api<Status>(`/content/${contentId}/read-status?details=1`).then(setS).catch(() => null); }, [contentId]);
  if (!s?.enabled || !s.visible || s.total === undefined) return null;
  const pct = s.total ? Math.round(((s.read ?? 0) / s.total) * 100) : 0;
  const open = s.people?.filter((p) => !p.readOn) ?? [];
  const read = s.people?.filter((p) => p.readOn) ?? [];

  return (
    <section className="card stack" aria-labelledby="rs-h">
      <h2 id="rs-h">Lesestatus</h2>
      <div className="row">
        <div className="donut" role="img" aria-label={`${s.read} von ${s.total} haben gelesen`} style={{ background: `conic-gradient(var(--brand) 0 ${pct}%, var(--line) ${pct}% 100%)` }}>
          <div><strong>{s.read}</strong><span className="small muted">von {s.total}</span></div>
        </div>
        <div className="small muted">Nur „gelesen“ oder „noch nicht“ – ohne Uhrzeit. Diese Übersicht sehen nur Autor:in und Leitungen.</div>
      </div>
      {s.canRemind && open.length > 0 && (
        <button className="btn pri" onClick={async () => {
          try { const r = await api<{ reminded: number; skipped: number }>(`/content/${contentId}/remind`, { method: 'POST' }); setMsg(`${r.reminded} erinnert${r.skipped ? `, ${r.skipped} haben schon zwei Erinnerungen` : ''}.`); }
          catch (e) { setMsg(e instanceof ApiError ? e.message : 'Hat nicht geklappt.'); }
        }}><Icon name="bellring" size={18} />An {open.length} erinnern</button>
      )}
      {msg && <div className="note ok small" role="status">{msg}</div>}
      {s.people && (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>Noch nicht ({open.length})</button>
            <button role="tab" aria-selected={tab === 'read'} onClick={() => setTab('read')}>Gelesen ({read.length})</button>
          </div>
          <ul className="plain">
            {(tab === 'open' ? open : read).map((p) => <li key={p.id} className="row between"><span>{p.name}</span><span className="small muted">{p.group}</span></li>)}
          </ul>
        </>
      )}
    </section>
  );
}
