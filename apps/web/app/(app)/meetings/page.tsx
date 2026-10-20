'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { State, day, useLoad } from '@/components/work';
import { ATTENDANCE, MEETING_STATUS, ROLE, when } from '@/lib/meetings';

interface M { id: string; title: string; startsAt: string; status: string; location: string | null; items: number; mine: number; attendance: string | null; role: string | null; deadline: string | null }
interface S { id: string; title: string; rule: string | null; active: boolean; retentionYears: number }
interface D { id: string; text: string; item: string; meetingId: string; meeting: string; at: string }

const tone = (s: string) => (s === 'LIVE' ? 'warn' : s === 'LOCKED' ? 'ok' : s === 'CANCELLED' ? '' : 'info');

/** Meetings: Kommende, Archiv je Serie, Entscheidungsregister (ADR-061). */
export default function Meetings() {
  const [view, setView] = useState<'upcoming' | 'archive' | 'decisions'>('upcoming');
  const [series, setSeries] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const { data, error } = useLoad<{ canCreate: boolean; meetings: M[]; series: S[] }>(view === 'decisions' ? null : `/meetings?view=${view}&series=${series}&q=${encodeURIComponent(query)}`);
  const { data: decisions } = useLoad<D[]>(view === 'decisions' ? `/meetings/decisions?q=${encodeURIComponent(query)}` : null);
  const [list, setList] = useState<{ canCreate: boolean; series: S[] } | null>(null);
  if (data && !list) setList(data);
  if (!list) return <State error={error} loading />;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Meetings</h1>{list.canCreate && <Link className="btn pri" href="/meetings/neu"><Icon name="plus" size={18} />Neues Meeting</Link>}</div>
      <div className="tabs" role="tablist">
        {([['upcoming', 'Kommende'], ['archive', 'Archiv'], ['decisions', 'Entscheidungen']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); setQuery(''); setQ(''); }}>{l}</button>)}
      </div>
      {view !== 'upcoming' && (
        <form className="row wrap" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          {view === 'archive' && list.series.length > 0 && (
            <select className="input sm" aria-label="Serie" value={series} onChange={(e) => setSeries(e.target.value)}>
              <option value="">Alle Serien</option>{list.series.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          <input className="input sm grow" aria-label="Suchen" placeholder={view === 'decisions' ? 'Entscheidung suchen, z. B. „Schlüsselkarten“ …' : 'Thema oder Meeting suchen …'} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn sm">Suchen</button>
        </form>
      )}

      {view === 'decisions' ? (
        !decisions ? <State loading /> : decisions.length === 0 ? <div className="card empty">Keine festgeschriebenen Entscheidungen gefunden.</div> : (
          <ul className="list plain">
            {decisions.map((d) => (
              <li key={d.id} className="card stack-s">
                <strong>{d.text}</strong>
                <span className="small muted">{d.item} · <Link href={`/meetings/${d.meetingId}`}>{d.meeting} am {day(d.at)}</Link></span>
              </li>
            ))}
          </ul>
        )
      ) : !data ? <State loading /> : data.meetings.length === 0 ? (
        <div className="card empty">{view === 'archive' ? 'Noch keine festgeschriebenen Protokolle.' : 'Gerade steht kein Meeting an.'}</div>
      ) : (
        <div className="list">
          {data.meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="card listitem">
              <span className="mt-date" aria-hidden="true"><b>{new Intl.DateTimeFormat('de-DE', { day: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(m.startsAt))}</b>{new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: 'Europe/Berlin' }).format(new Date(m.startsAt))}</span>
              <span className="grow">
                <span className="row wrap gap-s"><span className={`chip ${tone(m.status)}`}>{MEETING_STATUS[m.status]}</span>{m.role && <span className="chip">{ROLE[m.role]}</span>}<strong className="title">{m.title}</strong></span>
                <span className="block muted small">{when(m.startsAt)}{m.location && ` · ${m.location}`} · {m.items} {m.items === 1 ? 'Punkt' : 'Punkte'}{m.mine > 0 && ` · ${m.mine} von dir`}
                  {m.status === 'PLANNED' && m.deadline && new Date(m.deadline) > new Date() && ` · Punkte bis ${when(m.deadline)}`}{m.attendance === 'EXCUSED' && ` · du bist ${ATTENDANCE.EXCUSED}`}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {view === 'upcoming' && list.series.length > 0 && (
        <section className="stack-s">
          <h2 className="h-sub">Deine Serien</h2>
          <div className="chips">{list.series.map((s) => <span key={s.id} className="chip">{s.title}{s.rule && ` · ${s.rule}`}{!s.active && ' · pausiert'}</span>)}</div>
        </section>
      )}
    </div>
  );
}
