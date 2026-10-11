'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Back, ErrorNote, useSubmit } from '@/components/work';

interface O { templates: Array<{ id: string; name: string; kind: string; steps: number }>; people: Array<{ id: string; name: string; job: string | null; new: boolean }> }

function StartPlan() {
  const router = useRouter();
  const pre = useSearchParams().get('person') ?? '';
  const [o, setO] = useState<O | null>(null);
  const [f, setF] = useState({ templateId: '', userId: pre, referenceDate: new Date().toISOString().slice(0, 10) });
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<O>('/onboarding/options').then((r) => { setO(r); setF((x) => ({ ...x, templateId: r.templates[0]?.id ?? '' })); }); }, []);
  if (!o) return <div className="loading">Lade …</div>;
  const kind = o.templates.find((t) => t.id === f.templateId)?.kind;
  return (
    <form className="stack-lg narrow-col" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => api<{ id: string }>('/onboarding', { method: 'POST', json: f })); if (r) router.replace(`/einarbeitung/${r.id}`); }}>
      <Back href="/einarbeitung" label="Einarbeitung" />
      <h1>Plan starten</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="t">Vorlage</label><select id="t" className="input" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{o.templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps} Schritte)</option>)}</select></div>
        <div className="field"><label htmlFor="p">Für wen?</label><select id="p" className="input" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required>
          <option value="">Bitte wählen …</option>{o.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ''}{p.new ? ' (neu)' : ''}</option>)}</select></div>
        <div className="field"><label htmlFor="d">{kind === 'OFFBOARDING' ? 'Letzter Arbeitstag' : 'Erster Arbeitstag'}</label><input id="d" type="date" className="input" value={f.referenceDate} onChange={(e) => setF({ ...f, referenceDate: e.target.value })} required /></div>
      </section>
      <ErrorNote error={error} />
      <div><button className="btn pri big" disabled={busy || !f.templateId || !f.userId}>Plan starten</button></div>
    </form>
  );
}

export default function Page() { return <Suspense><StartPlan /></Suspense>; }
