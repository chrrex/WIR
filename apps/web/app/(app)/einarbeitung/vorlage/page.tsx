'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Back, ErrorNote, useSubmit } from '@/components/work';

interface Step { title: string; offsetDays: number; responsible: string; linkedContentId: string }
const blank = (): Step => ({ title: '', offsetDays: 0, responsible: 'SUBJECT_EMPLOYEE', linkedContentId: '' });

export default function NewTemplate() {
  const router = useRouter();
  const [content, setContent] = useState<Array<{ id: string; title: string }>>([]);
  const [f, setF] = useState({ name: '', kind: 'ONBOARDING' });
  const [steps, setSteps] = useState<Step[]>([blank()]);
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<{ content: typeof content }>('/onboarding/options').then((r) => setContent(r.content)).catch(() => null); }, []);
  const upd = (i: number, p: Partial<Step>) => setSteps(steps.map((x, n) => (n === i ? { ...x, ...p } : x)));
  return (
    <form className="stack-lg narrow-col wide" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api('/onboarding/templates', { method: 'POST', json: { ...f, steps: steps.filter((s) => s.title.trim()).map((s) => ({ ...s, linkedContentId: s.linkedContentId || null })) } }))) router.replace('/einarbeitung'); }}>
      <Back href="/einarbeitung" label="Einarbeitung" />
      <h1>Neue Vorlage</h1>
      <section className="card stack">
        <div className="row wrap">
          <div className="field grow"><label htmlFor="n">Name</label><input id="n" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="z. B. Einarbeitung Küche" /></div>
          <div className="field"><label htmlFor="k">Art</label><select id="k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="ONBOARDING">Eintritt</option><option value="OFFBOARDING">Austritt</option></select></div>
        </div>
      </section>
      <section className="card stack">
        <h2>Schritte</h2>
        <p className="small muted">Tag 0 = {f.kind === 'ONBOARDING' ? 'erster' : 'letzter'} Arbeitstag; negative Zahlen = davor.</p>
        {steps.map((s, i) => (
          <fieldset key={i} className="stack-s plain">
            <legend className="sr">Schritt {i + 1}</legend>
            <div className="row wrap">
              <input className="input grow" aria-label={`Schritt ${i + 1}`} placeholder={`Schritt ${i + 1}`} value={s.title} onChange={(e) => upd(i, { title: e.target.value })} />
              <button type="button" className="iconbtn" aria-label={`Schritt ${i + 1} entfernen`} onClick={() => setSteps(steps.filter((_, n) => n !== i))}><Icon name="trash" /></button>
            </div>
            <div className="row wrap">
              <label className="field">Tag<input type="number" className="input sm" value={s.offsetDays} onChange={(e) => upd(i, { offsetDays: Number(e.target.value) })} /></label>
              <label className="field">Wer<select className="input" value={s.responsible} onChange={(e) => upd(i, { responsible: e.target.value })}><option value="SUBJECT_EMPLOYEE">Die Person selbst</option><option value="LINE_MANAGER">Teamleitung</option></select></label>
              <label className="field grow">Pflichtlektüre (freiwillig)<select className="input" value={s.linkedContentId} onChange={(e) => upd(i, { linkedContentId: e.target.value })}><option value="">–</option>{content.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            </div>
          </fieldset>
        ))}
        <div><button type="button" className="btn" onClick={() => setSteps([...steps, blank()])}><Icon name="plus" size={16} />Schritt hinzufügen</button></div>
      </section>
      <ErrorNote error={error} />
      <div><button className="btn pri big" disabled={busy || !f.name || !steps.some((s) => s.title.trim())}>Vorlage speichern</button></div>
    </form>
  );
}
