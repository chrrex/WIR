'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';
import { ErrorNote, PersonPicker, State, dayTime, useLoad, useSubmit } from '@/components/work';
import { PRIORITY, TASK_STATUS } from '@/lib/labels';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface T { id: string; title: string; status: string; priority: string; dueAt: string | null; assignee: string; author: string }

function NewTask({ onDone }: { onDone: () => void }) {
  const { me, can } = useMe();
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [f, setF] = useState({ title: '', description: '', due: '', priority: 'NORMAL', to: 'me' });
  const [person, setPerson] = useState<{ id: string; name: string } | null>(null);
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<{ groups: typeof groups }>('/tasks/options').then((r) => setGroups(r.groups)); }, []);
  const target = f.to === 'me' ? { userId: me!.user.id } : f.to === 'person' ? { userId: person?.id } : { groupId: f.to };
  return (
    <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/tasks', { method: 'POST', json: { title: f.title, description: f.description || null, priority: f.priority, dueAt: f.due ? new Date(f.due).toISOString() : null, ...target } }))) onDone(); }}>
      <h2>Neue Aufgabe</h2>
      <div className="field"><label htmlFor="tt">Was ist zu tun?</label><input id="tt" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} /></div>
      <div className="field"><label htmlFor="td">Details (freiwillig)</label><textarea id="td" className="input area" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="row wrap">
        <div className="field grow"><label htmlFor="to">Für</label>
          <select id="to" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}>
            <option value="me">Mich selbst</option>
            {can('tasks.assign') && <option value="person">Eine Person …</option>}
            {groups.map((g) => <option key={g.id} value={g.id}>Team {g.name}</option>)}
          </select></div>
        <div className="field grow"><label htmlFor="du">Fällig</label><input id="du" type="datetime-local" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
        <div className="field grow"><label htmlFor="pr">Priorität</label><select id="pr" className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      {f.to === 'person' && <PersonPicker value={person} onChange={setPerson} />}
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri" disabled={busy || !f.title || (f.to === 'person' && !person)}>Aufgabe anlegen</button></div>
    </form>
  );
}

export default function Tasks() {
  const [view, setView] = useState('mine');
  const { data, error, reload } = useLoad<{ canCreate: boolean; tasks: T[] }>(`/tasks?view=${view}`);
  const [adding, setAdding] = useState(false);
  const counts = useReadCounts((data?.tasks ?? []).map((t) => t.id));
  if (!data) return <State error={error} loading />;
  const overdue = (t: T) => t.dueAt && new Date(t.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(t.status);
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Aufgaben</h1>{data.canCreate && <button className="btn pri" onClick={() => setAdding(!adding)}><Icon name="plus" size={18} />Neue Aufgabe</button>}</div>
      {adding && <NewTask onDone={() => { setAdding(false); reload(); }} />}
      <div className="tabs" role="tablist">
        {[['mine', 'Für mich'], ['created', 'Von mir vergeben'], ['done', 'Erledigt']].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>)}
      </div>
      {data.tasks.length === 0 ? <div className="card empty">Nichts offen. 🎉</div> : (
        <div className="list">
          {data.tasks.map((t) => (
            <Link key={t.id} href={`/aufgaben/${t.id}`} className="card listitem">
              <span className={`udot ${overdue(t) || t.priority === 'URGENT' ? 'warn' : 'off'}`} aria-label={overdue(t) ? 'überfällig' : undefined} />
              <span className="grow">
                <span className="row wrap gap-s"><span className={`chip ${t.status === 'DONE' ? 'ok' : 'info'}`}>{TASK_STATUS[t.status]}</span>{t.priority !== 'NORMAL' && <span className={`chip ${t.priority === 'URGENT' || t.priority === 'HIGH' ? 'warn' : ''}`}>{PRIORITY[t.priority]}</span>}<strong className="title">{t.title}</strong></span>
                <span className="block muted small">{view === 'created' ? `für ${t.assignee}` : `von ${t.author}`}{t.dueAt && ` · fällig ${dayTime(t.dueAt)}`}{overdue(t) && ' · überfällig'} <ReadChip c={counts[t.id]} /></span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
