'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Audience, AudienceOption, ErrorNote, State, dayTime, useLoad, useSubmit } from '@/components/work';
import { CHECK_KIND, RUN_STATUS } from '@/lib/labels';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface T { id: string; title: string; kind: string; items: number; repeat: string | null; approval: boolean; visibility: string; mode: string; owner: string; mine: boolean; canEdit: boolean; assignees: string[] }
interface R { id: string; title: string; status: string; approval: string; done: number; total: number; deviations: number; completedBy: string | null; completedAt: string | null; startedAt: string | null; dueAt: string | null; overdue: boolean; assignee: string | null; mine: boolean }

/** Checklisten (ADR-056): offene Listen, Erledigtes, Vorlagen – für alle. */
export default function Checklists() {
  const router = useRouter();
  const { data, error, reload } = useLoad<{ templates: T[]; runs: R[] }>('/checklists');
  const { data: o } = useLoad<{ audiences: AudienceOption[] }>('/checklists/options');
  const [tab, setTab] = useState<'offen' | 'erledigt' | 'vorlagen'>('offen');
  const [assign, setAssign] = useState<{ id: string; keys: string[]; due: string } | null>(null);
  const { busy, error: err, run } = useSubmit();
  const counts = useReadCounts((data?.runs ?? []).map((r) => r.id));
  if (!data) return <State error={error} loading />;
  const start = async (id: string, keys?: string[], due?: string) => {
    const r = await run(() => api<{ id: string; runs: number }>(`/checklists/${id}/start`, { method: 'POST', json: { assignees: keys?.length ? keys : undefined, dueAt: due ? new Date(due).toISOString() : null } }));
    if (!r) return;
    if (keys?.length) { setAssign(null); setTab('offen'); reload(); } else router.push(`/checklisten/${r.id}`);
  };
  const open = data.runs.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED').sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.overdue) - Number(a.overdue));
  const done = data.runs.filter((r) => r.status === 'COMPLETED');
  const Run = ({ r }: { r: R }) => (
    <Link href={`/checklisten/${r.id}`} className="card listitem">
      <span className={`udot ${r.deviations || r.overdue ? 'warn' : r.status === 'COMPLETED' ? 'off' : ''}`} aria-label={r.deviations ? `${r.deviations} kritische Antwort(en)` : r.overdue ? 'überfällig' : undefined} />
      <span className="grow"><strong className="title">{r.title}</strong>
        <span className="progress" aria-hidden="true"><span style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} /></span>
        <span className="block muted small">{r.assignee && `${r.assignee} · `}{r.overdue ? <span className="warn-ink">überfällig seit {dayTime(r.dueAt)}</span> : RUN_STATUS[r.status]}{!r.overdue && r.dueAt && r.status !== 'COMPLETED' && ` · fällig ${dayTime(r.dueAt)}`}
          {r.approval === 'PENDING' && ' · wartet auf Freigabe'}{r.approval === 'APPROVED' && ' · freigegeben'} · {r.done}/{r.total}{r.deviations > 0 && ` · ${r.deviations} kritisch`}{r.completedBy && ` · ${r.completedBy}, ${dayTime(r.completedAt)}`} <ReadChip c={counts[r.id]} /></span></span>
    </Link>
  );
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Checklisten</h1><Link className="btn pri" href="/checklisten/neu"><Icon name="plus" size={18} />Neue Checkliste</Link></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'offen'} onClick={() => setTab('offen')}>Offen ({open.length})</button>
        <button role="tab" aria-selected={tab === 'erledigt'} onClick={() => setTab('erledigt')}>Erledigt</button>
        <button role="tab" aria-selected={tab === 'vorlagen'} onClick={() => setTab('vorlagen')}>Vorlagen ({data.templates.length})</button>
      </div>
      <ErrorNote error={err} />
      {tab === 'offen' && (open.length ? <div className="list">{open.map((r) => <Run key={r.id} r={r} />)}</div> : <div className="card empty">Nichts offen. Unter „Vorlagen“ startest du eine Checkliste – oder legst eine neue an.</div>)}
      {tab === 'erledigt' && (done.length ? <div className="list">{done.map((r) => <Run key={r.id} r={r} />)}</div> : <div className="card empty">In den letzten 30 Tagen nichts abgeschlossen.</div>)}
      {tab === 'vorlagen' && (data.templates.length === 0 ? <div className="card empty">Noch keine Vorlagen. Leg die erste an!</div> : (
        <div className="grid">
          {data.templates.map((t) => (
            <div key={t.id} className="card stack-s">
              <span className="chips"><span className="chip info">{CHECK_KIND[t.kind] ?? t.kind}</span><span className="chip">{t.visibility === 'PRIVATE' ? 'privat' : 'öffentlich'}</span>
                <span className="chip">{t.mode === 'EACH' ? 'jede:r einzeln' : 'gemeinsam'}</span>{t.repeat && <span className="chip">{t.repeat}</span>}{t.approval && <span className="chip">mit Abnahme</span>}</span>
              <strong>{t.title}</strong>
              <span className="small muted">{t.items} Punkte · von {t.mine ? 'dir' : t.owner}{t.assignees.length > 0 && ` · für ${t.assignees.join(', ')}`}</span>
              {assign?.id === t.id ? (
                <div className="stack-s">
                  {o && <Audience options={o.audiences} value={assign.keys} onChange={(keys) => setAssign({ ...assign, keys })} persons />}
                  <div className="field"><label htmlFor={`due-${t.id}`}>Fällig bis (optional)</label><input id={`due-${t.id}`} type="datetime-local" className="input" value={assign.due} onChange={(e) => setAssign({ ...assign, due: e.target.value })} /></div>
                  <div className="row"><button className="btn" onClick={() => setAssign(null)}>Abbrechen</button><button className="btn pri" disabled={busy || !assign.keys.length} onClick={() => start(t.id, assign.keys, assign.due)}>Zuweisen</button></div>
                </div>
              ) : (
                <div className="row wrap">
                  <button className="btn pri sm" disabled={busy} onClick={() => start(t.id)}>Starten</button>
                  <button className="btn sm" onClick={() => setAssign({ id: t.id, keys: [], due: '' })}>Zuweisen …</button>
                  {t.canEdit && <Link className="btn sm" href={`/checklisten/neu?id=${t.id}`}>Bearbeiten</Link>}
                  <Link className="btn sm" href={`/checklisten/neu?copy=${t.id}`}>Kopieren</Link>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
