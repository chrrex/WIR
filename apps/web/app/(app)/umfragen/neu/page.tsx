'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Audience, AudienceOption, Back, ErrorNote, useSubmit } from '@/components/work';
import { QUESTION } from '@/lib/labels';

interface Q { prompt: string; type: string; options: string; required: boolean }

export default function NewSurvey() {
  const router = useRouter();
  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [f, setF] = useState({ title: '', description: '', anonymous: true, resultsForAll: false, closes: '' });
  const [audience, setAudience] = useState<string[]>([]);
  const [qs, setQs] = useState<Q[]>([{ prompt: '', type: 'SCALE', options: '', required: true }]);
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<{ audiences: AudienceOption[] }>('/surveys/options').then((r) => setAudiences(r.audiences)); }, []);
  const upd = (i: number, p: Partial<Q>) => setQs(qs.map((x, n) => (n === i ? { ...x, ...p } : x)));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api<{ id: string }>('/surveys', { method: 'POST', json: { title: f.title, description: f.description || null, anonymous: f.anonymous, resultsForAll: f.resultsForAll,
      closesAt: f.closes ? new Date(`${f.closes}T23:59:00`).toISOString() : null, audience,
      questions: qs.filter((q) => q.prompt.trim()).map((q) => ({ prompt: q.prompt, type: q.type, required: q.required, options: q.options.split('\n').map((o) => o.trim()).filter(Boolean) })) } }));
    if (r) router.replace(`/umfragen/${r.id}`);
  }
  return (
    <form className="stack-lg narrow-col wide" onSubmit={submit}>
      <Back href="/umfragen" label="Umfragen" />
      <h1>Neue Umfrage</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="t">Titel</label><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
        <div className="field"><label htmlFor="d">Worum geht es? (freiwillig)</label><input id="d" className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="field"><label htmlFor="c">Läuft bis (freiwillig)</label><input id="c" type="date" className="input" value={f.closes} onChange={(e) => setF({ ...f, closes: e.target.value })} /></div>
        <label className="check"><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />Anonym – Antworten ohne Namen</label>
        <label className="check"><input type="checkbox" checked={f.resultsForAll} onChange={(e) => setF({ ...f, resultsForAll: e.target.checked })} />Teilnehmende sehen die Ergebnisse nach ihrer Abgabe</label>
        <p className="small muted">Ergebnisse gibt es erst ab 5 Antworten.</p>
      </section>
      <section className="card stack">
        <h2>Fragen</h2>
        {qs.map((q, i) => (
          <fieldset key={i} className="stack-s plain">
            <legend className="sr">Frage {i + 1}</legend>
            <div className="row wrap">
              <input className="input grow" aria-label={`Frage ${i + 1}`} placeholder={`Frage ${i + 1}`} value={q.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} />
              <select className="input" aria-label="Art der Frage" value={q.type} onChange={(e) => upd(i, { type: e.target.value })}>{Object.entries(QUESTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <button type="button" className="iconbtn" aria-label={`Frage ${i + 1} entfernen`} onClick={() => setQs(qs.filter((_, n) => n !== i))}><Icon name="trash" /></button>
            </div>
            {q.type.endsWith('CHOICE') && <textarea className="input area" rows={3} aria-label="Antworten, eine pro Zeile" placeholder="Antworten – eine pro Zeile" value={q.options} onChange={(e) => upd(i, { options: e.target.value })} />}
            <label className="check small"><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { required: e.target.checked })} />Pflichtfrage</label>
          </fieldset>
        ))}
        <div><button type="button" className="btn" onClick={() => setQs([...qs, { prompt: '', type: 'SINGLE_CHOICE', options: '', required: true }])}><Icon name="plus" size={16} />Frage hinzufügen</button></div>
      </section>
      <section className="card stack"><Audience options={audiences} value={audience} onChange={setAudience} /></section>
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri big" disabled={busy || !f.title || !audience.length || !qs.some((q) => q.prompt.trim())}>Umfrage starten</button></div>
    </form>
  );
}
