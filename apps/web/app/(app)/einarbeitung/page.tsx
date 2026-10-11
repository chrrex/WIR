'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { State, day, useLoad } from '@/components/work';

interface Data { canStart: boolean; canManage: boolean; plans: Array<{ id: string; kind: string; template: string; person: string; mine: boolean; referenceDate: string; status: string; done: number; total: number }> }

export default function Lifecycle() {
  const { data, error } = useLoad<Data>('/onboarding');
  if (!data) return <State error={error} loading />;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Einarbeitung</h1>
        <span className="row">{data.canManage && <Link className="btn" href="/einarbeitung/vorlage">Neue Vorlage</Link>}{data.canStart && <Link className="btn pri" href="/einarbeitung/neu"><Icon name="plus" size={18} />Plan starten</Link>}</span>
      </div>
      <p className="muted">Ein Plan macht aus jedem Schritt eine Aufgabe – für die neue Person oder ihre Leitung. Pflichtlektüre wird automatisch freigegeben.</p>
      {data.plans.length === 0 ? <div className="card empty">Noch keine Pläne.</div> : (
        <div className="list">
          {data.plans.map((p) => (
            <Link key={p.id} href={`/einarbeitung/${p.id}`} className="card listitem">
              <span className="grow">
                <span className="row wrap gap-s"><span className={`chip ${p.status === 'COMPLETED' ? 'ok' : 'info'}`}>{p.kind === 'ONBOARDING' ? 'Eintritt' : 'Austritt'}</span><strong className="title">{p.mine ? 'Dein Plan' : p.person}</strong></span>
                <span className="block muted small">{p.template} · {p.kind === 'ONBOARDING' ? 'Start' : 'Letzter Tag'} {day(p.referenceDate)} · {p.done} von {p.total} erledigt</span>
              </span>
              <progress max={p.total || 1} value={p.done} aria-label={`${p.done} von ${p.total}`} style={{ width: 90 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
