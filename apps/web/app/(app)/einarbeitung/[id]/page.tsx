'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Back, State, day, useLoad } from '@/components/work';
import { TASK_STATUS } from '@/lib/labels';

interface P { id: string; kind: string; template: string; person: string; referenceDate: string; startedBy: string | null; status: string;
  steps: Array<{ id: string; title: string; dueAt: string | null; status: string; forPerson: boolean; assignee: string; mine: boolean }> }

export default function Plan() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error } = useLoad<P>(`/onboarding/${id}`);
  if (!p) return <State error={error} loading back={['/', 'Zur Startseite']} />;
  const done = p.steps.filter((s) => s.status === 'DONE').length;
  return (
    <div className="stack-lg narrow-col wide">
      <Back href="/einarbeitung" label="Einarbeitung" />
      <section className="card stack">
        <div className="chips"><span className="chip info">{p.kind === 'ONBOARDING' ? 'Eintritt' : 'Austritt'}</span>{p.status === 'COMPLETED' && <span className="chip ok">abgeschlossen</span>}</div>
        <h1>{p.person}</h1>
        <p className="muted">{p.template} · {p.kind === 'ONBOARDING' ? 'Start' : 'Letzter Tag'} {day(p.referenceDate)}{p.startedBy && ` · gestartet von ${p.startedBy}`}</p>
        <progress max={p.steps.length || 1} value={done} aria-label={`${done} von ${p.steps.length} erledigt`} style={{ width: '100%' }} />
        <p className="small">{done} von {p.steps.length} Schritten erledigt</p>
      </section>
      <ol className="plain list">
        {p.steps.map((s) => (
          <li key={s.id}>
            <Link href={`/aufgaben/${s.id}`} className="card listitem">
              <span className={`udot ${s.status === 'DONE' ? 'off' : s.mine ? '' : 'off'}`} aria-label={s.mine && s.status !== 'DONE' ? 'deine Aufgabe' : undefined} />
              <span className="grow">
                <span className="row wrap gap-s"><span className={`chip ${s.status === 'DONE' ? 'ok' : ''}`}>{TASK_STATUS[s.status]}</span><strong className="title">{s.title}</strong></span>
                <span className="block muted small">{s.forPerson ? (p.kind === 'ONBOARDING' ? 'Neue:r' : 'Person') : 'Leitung'}: {s.assignee}{s.dueAt && ` · bis ${day(s.dueAt)}`}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
