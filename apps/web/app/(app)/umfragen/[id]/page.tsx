'use client';

import { BookmarkButton } from '@/components/content/Extras';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ReadStatus } from '@/components/content/ReadStatus';
import { api } from '@/lib/api';
import { Back, ErrorNote, State, day, useLoad, useSubmit } from '@/components/work';

interface Q { id: string; prompt: string; type: string; required: boolean; scaleMin: number | null; scaleMax: number | null; options: Array<{ id: string; label: string }> }
interface S { id: string; title: string; description: string | null; anonymous: boolean; closesAt: string | null; open: boolean; participated: boolean; mine: boolean; minGroupSize: number; audience: string[]; questions: Q[] }
interface R { responses: number; recipients: number; tooFew: boolean; minGroupSize?: number; questions?: Array<{ id: string; prompt: string; type: string; options: Array<{ label: string; count: number }>; average: number | null; texts: string[] }> }
type A = { optionIds: string[]; value?: number; text?: string };

function Results({ id }: { id: string }) {
  const [r, setR] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<R>(`/surveys/${id}/results`).then(setR).catch((e) => setErr(e.message)); }, [id]);
  if (err || !r) return null;
  return <section className="card stack"><h2 className="h-sub">Ergebnisse</h2><ResultBody r={r} /></section>;
}

function ResultBody({ r }: { r: R }) {
  if (r.tooFew) return <p className="note info">Bisher {r.responses} von {r.recipients} Antworten. Ergebnisse gibt es ab {r.minGroupSize} Antworten – damit niemand erkennbar ist.</p>;
  return (
    <div className="stack">
      <p className="muted">{r.responses} von {r.recipients} haben geantwortet.</p>
      {r.questions!.map((q) => {
        const total = Math.max(1, q.options.reduce((n, o) => n + o.count, 0));
        return (
          <div key={q.id} className="stack-s">
            <strong>{q.prompt}</strong>
            {q.average != null && <p>Durchschnitt: <strong>{q.average.toLocaleString('de-DE')}</strong> von 5</p>}
            {q.options.map((o) => <div key={o.label} className="stack-s"><span className="row between small"><span>{o.label}</span><span>{o.count}</span></span><progress max={total} value={o.count} aria-label={o.label} style={{ width: '100%' }} /></div>)}
            {q.texts.length > 0 && <ul className="stack-s">{q.texts.map((t, i) => <li key={i} className="small">„{t}“</li>)}</ul>}
          </div>
        );
      })}
    </div>
  );
}

export default function SurveyPage() {
  const { id } = useParams<{ id: string }>();
  const { data: s, error, reload } = useLoad<S>(`/surveys/${id}`);
  const [a, setA] = useState<Record<string, A>>({});
  const { busy, error: err, run } = useSubmit();
  if (!s) return <State error={error} loading back={['/umfragen', 'Zu den Umfragen']} />;
  const get = (q: string) => a[q] ?? { optionIds: [] };
  const set = (q: string, p: Partial<A>) => setA({ ...a, [q]: { ...get(q), ...p } });
  const canAnswer = s.open && !s.participated;
  return (
    <div className="stack-lg narrow-col">
      <Back href="/umfragen" label="Umfragen" />
      <section className="card stack">
        <h1>{s.title}</h1>
        <div className="row"><BookmarkButton contentId={s.id} /></div>
        {s.description && <p>{s.description}</p>}
        <p className="small muted">{s.anonymous ? 'Anonym: deine Antworten werden ohne deinen Namen gespeichert.' : 'Nicht anonym.'}{s.closesAt && ` Läuft bis ${day(s.closesAt)}.`} Für {s.audience.join(', ')}.</p>
      </section>
      {canAnswer && (
        <form className="card stack" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/surveys/${id}/responses`, { method: 'POST', json: { answers: Object.entries(a).map(([questionId, x]) => ({ questionId, ...x })) } }))) reload(); }}>
          {s.questions.map((q) => (
            <fieldset key={q.id} className="stack-s plain">
              <legend><strong>{q.prompt}</strong>{!q.required && <span className="xs muted"> (freiwillig)</span>}</legend>
              {q.type === 'SINGLE_CHOICE' && q.options.map((o) => <label key={o.id} className="check"><input type="radio" name={q.id} checked={get(q.id).optionIds[0] === o.id} onChange={() => set(q.id, { optionIds: [o.id] })} />{o.label}</label>)}
              {q.type === 'MULTIPLE_CHOICE' && q.options.map((o) => { const on = get(q.id).optionIds.includes(o.id); return <label key={o.id} className="check"><input type="checkbox" checked={on} onChange={() => set(q.id, { optionIds: on ? get(q.id).optionIds.filter((x) => x !== o.id) : [...get(q.id).optionIds, o.id] })} />{o.label}</label>; })}
              {q.type === 'SCALE' && <div className="seg" role="group" aria-label={q.prompt}>{Array.from({ length: (q.scaleMax ?? 5) - (q.scaleMin ?? 1) + 1 }, (_, i) => i + (q.scaleMin ?? 1)).map((n) => <button type="button" key={n} aria-pressed={get(q.id).value === n} onClick={() => set(q.id, { value: n })}>{n}</button>)}</div>}
              {q.type === 'SCALE' && <span className="xs muted">1 = gar nicht · 5 = sehr</span>}
              {q.type === 'FREE_TEXT' && <textarea className="input area" rows={3} aria-label={q.prompt} value={get(q.id).text ?? ''} onChange={(e) => set(q.id, { text: e.target.value })} />}
            </fieldset>
          ))}
          <ErrorNote error={err} />
          <div><button className="btn pri big" disabled={busy}>Absenden</button></div>
        </form>
      )}
      {s.participated && <div className="note ok">Danke! Deine Antwort ist angekommen.</div>}
      {!s.open && !s.participated && <div className="note info">Diese Umfrage ist geschlossen.</div>}
      <Results key={String(s.participated)} id={id} />
      <ReadStatus contentId={s.id} label="teilgenommen" />
    </div>
  );
}
