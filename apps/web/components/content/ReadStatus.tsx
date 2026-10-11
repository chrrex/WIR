'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '../Icon';

interface Status {
  enabled: boolean; visible?: boolean; read?: number; total?: number; canRemind?: boolean;
  people?: Array<{ id: string; name: string; group: string; readOn: string | null }> | null;
}

/**
 * Markiert den Inhalt als gelesen und zeigt – nur Autor:in und Leitungen – wer gelesen hat und wer nicht
 * (ADR-012/042). Keine Uhrzeiten. Bei Umfragen: Teilnahme statt Lesen.
 */
export function ReadStatus({ contentId, onSeen, label = 'gelesen' }: { contentId: string; onSeen?: () => void; label?: string }) {
  const [s, setS] = useState<Status | null>(null);
  const [tab, setTab] = useState<'open' | 'read'>('open');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api(`/content/${contentId}/seen`, { method: 'POST' }).then(() => onSeen?.()).catch(() => null)
      .finally(() => api<Status>(`/content/${contentId}/read-status?details=1`).then(setS).catch(() => null));
  }, [contentId, onSeen]);
  if (!s?.enabled || !s.visible || s.total === undefined) return null;
  const pct = s.total ? Math.round(((s.read ?? 0) / s.total) * 100) : 0;
  const open = s.people?.filter((p) => !p.readOn) ?? [];
  const read = s.people?.filter((p) => p.readOn) ?? [];

  return (
    <section className="card stack" aria-labelledby="rs-h">
      <h2 id="rs-h">{label === 'gelesen' ? 'Lesestatus' : 'Teilnahme'}</h2>
      <div className="row">
        <div className="donut" role="img" aria-label={`${s.read} von ${s.total} haben ${label}`} style={{ background: `conic-gradient(var(--brand) 0 ${pct}%, var(--line) ${pct}% 100%)` }}>
          <div><strong>{s.read}</strong><span className="small muted">von {s.total}</span></div>
        </div>
        <div className="small muted">Nur „{label}“ oder „noch nicht“ – ohne Uhrzeit. Diese Übersicht sehen nur Autor:in und Leitungen.</div>
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
            <button role="tab" aria-selected={tab === 'read'} onClick={() => setTab('read')}>{label[0].toUpperCase() + label.slice(1)} ({read.length})</button>
          </div>
          <ul className="plain">
            {(tab === 'open' ? open : read).map((p) => <li key={p.id} className="row between"><span>{p.name}</span><span className="small muted">{p.group}</span></li>)}
          </ul>
        </>
      )}
    </section>
  );
}

export type ReadCounts = Record<string, { read: number; total: number }>;

/** Lesestatus für eine Liste laden – liefert nur Einträge, die die Person sehen darf (Autor:in, Leitung). */
export function useReadCounts(ids: string[]) {
  const [counts, setCounts] = useState<ReadCounts>({});
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    api<ReadCounts>('/content/read-summaries', { method: 'POST', json: { ids: key.split(',').slice(0, 100) } }).then(setCounts).catch(() => null);
  }, [key]);
  return counts;
}

/** Kleiner Hinweis „8/12 gelesen“ für Listen. */
export function ReadChip({ c, label = 'gelesen' }: { c?: { read: number; total: number }; label?: string }) {
  if (!c || !c.total) return null;
  const all = c.read >= c.total;
  return <span className={`chip ${all ? 'ok' : ''}`} title={`${c.read} von ${c.total} haben ${label}`}><span aria-hidden="true">{all ? '✓ ' : ''}</span>{c.read}/{c.total} {label}</span>;
}
