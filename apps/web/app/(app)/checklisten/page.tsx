'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { ErrorNote, State, dayTime, useLoad, useSubmit } from '@/components/work';
import { CHECK_KIND, RUN_STATUS } from '@/lib/labels';

interface Data { canManage: boolean; templates: Array<{ id: string; title: string; kind: string; group: string; items: number }>;
  runs: Array<{ id: string; title: string; status: string; done: number; total: number; deviations: number; completedBy: string | null; completedAt: string | null; startedAt: string | null }> }

export default function Checklists() {
  const router = useRouter();
  const { data, error } = useLoad<Data>('/checklists');
  const { busy, error: err, run } = useSubmit();
  if (!data) return <State error={error} loading />;
  const start = async (id: string) => { const r = await run(() => api<{ id: string }>(`/checklists/${id}/start`, { method: 'POST' })); if (r) router.push(`/checklisten/${r.id}`); };
  const open = data.runs.filter((r) => r.status !== 'COMPLETED');
  const done = data.runs.filter((r) => r.status === 'COMPLETED');
  const Run = ({ r }: { r: Data['runs'][number] }) => (
    <Link href={`/checklisten/${r.id}`} className="card listitem">
      <span className={`udot ${r.deviations ? 'warn' : r.status === 'COMPLETED' ? 'off' : ''}`} aria-label={r.deviations ? `${r.deviations} Abweichung(en)` : undefined} />
      <span className="grow"><strong className="title">{r.title}</strong>
        <span className="block muted small">{RUN_STATUS[r.status]} · {r.done}/{r.total} erledigt{r.deviations > 0 && ` · ${r.deviations} Abweichung${r.deviations > 1 ? 'en' : ''}`}{r.completedBy && ` · ${r.completedBy}, ${dayTime(r.completedAt)}`}</span></span>
    </Link>
  );
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Checklisten</h1>{data.canManage && <Link className="btn" href="/checklisten/neu"><Icon name="plus" size={18} />Neue Vorlage</Link>}</div>
      <ErrorNote error={err} />
      <section className="stack-s">
        <h2 className="h-sub">Starten</h2>
        {data.templates.length === 0 ? <div className="card empty">Für dein Team gibt es noch keine Checklisten.</div> : (
          <div className="grid">
            {data.templates.map((t) => (
              <div key={t.id} className="card stack-s">
                <span className="chips"><span className="chip info">{CHECK_KIND[t.kind]}</span><span className="chip">{t.group}</span></span>
                <strong>{t.title}</strong><span className="small muted">{t.items} Punkte</span>
                <div><button className="btn pri" disabled={busy} onClick={() => start(t.id)}>Jetzt starten</button></div>
              </div>
            ))}
          </div>
        )}
      </section>
      {open.length > 0 && <section className="stack-s"><h2 className="h-sub">Offen</h2><div className="list">{open.map((r) => <Run key={r.id} r={r} />)}</div></section>}
      {done.length > 0 && <section className="stack-s"><h2 className="h-sub">Erledigt (7 Tage)</h2><div className="list">{done.map((r) => <Run key={r.id} r={r} />)}</div></section>}
    </div>
  );
}
