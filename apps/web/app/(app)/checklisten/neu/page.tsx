'use client';

import { useFromMeeting } from '@/lib/meetings';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CHECK_KIND } from '@/lib/labels';
import { Icon } from '@/components/Icon';
import { Audience, AudienceOption, Back, ErrorNote, useLoad, useSubmit } from '@/components/work';

type Type = 'CHECK' | 'YES_NO' | 'CHOICE' | 'TEXT' | 'NUMBER' | 'TEMPERATURE' | 'PHOTO' | 'SIGNATURE' | 'HEADING';
interface Item { key: string; title: string; type: Type; description: string; required: boolean; options: string[]; flagged: string[]; requireNote: boolean; requirePhoto: boolean; createTask: boolean; min: string; max: string; unit: string; showIf: { key: string; value: string } | null }
interface Form { title: string; description: string; kind: string; visibility: 'PUBLIC' | 'PRIVATE'; completionMode: 'SHARED' | 'EACH'; assignees: string[]; dueInHours: string; repeat: 'NONE' | 'DAILY' | 'WEEKDAYS'; time: string; requiresApproval: boolean; items: Item[] }

const TYPES: Array<[Type, string]> = [['CHECK', '☑ Häkchen'], ['YES_NO', 'Ja / Nein'], ['CHOICE', 'Auswahl'], ['TEXT', 'Text'], ['NUMBER', 'Zahl'], ['TEMPERATURE', 'Temperatur'], ['PHOTO', 'Foto'], ['SIGNATURE', 'Unterschrift'], ['HEADING', 'Abschnitt']];
let seq = 0;
const newItem = (type: Type = 'CHECK'): Item => ({ key: `n${++seq}`, title: '', type, description: '', required: type !== 'HEADING', options: type === 'CHOICE' ? ['In Ordnung', 'Mangel'] : [], flagged: type === 'YES_NO' ? ['Nein'] : type === 'CHOICE' ? ['Mangel'] : [], requireNote: false, requirePhoto: false, createTask: false, min: '', max: '', unit: type === 'TEMPERATURE' ? '°C' : '', showIf: null });
const answers = (i: Item) => (i.type === 'YES_NO' ? ['Ja', 'Nein'] : i.type === 'CHOICE' ? i.options : i.type === 'CHECK' ? ['erledigt'] : []);

export default function Page() { return <Suspense><Builder /></Suspense>; }

/** Checklisten-Baukasten (ADR-056): Feldtypen, Pflicht, Text-/Fotopflicht, kritische Antworten, Folgeaufgaben, Bedingungen. */
function Builder() {
  const router = useRouter();
  const q = useSearchParams();
  const editId = q.get('id');
  const copyId = q.get('copy');
  const meeting = useFromMeeting();
  const { data: o } = useLoad<{ kinds: string[]; audiences: AudienceOption[] }>('/checklists/options');
  const [f, setF] = useState<Form>({ title: meeting.title.slice(0, 140), description: meeting.text.slice(0, 1000), kind: 'GENERAL', visibility: 'PUBLIC', completionMode: 'SHARED', assignees: [], dueInHours: '', repeat: 'NONE', time: '06:00', requiresApproval: false, items: [newItem()] });
  const [startNow, setStartNow] = useState(true);
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    const src = editId ?? copyId;
    if (!src) return;
    api<Form & { items: Array<Omit<Item, 'min' | 'max' | 'unit' | 'description'> & { min: number | null; max: number | null; unit: string | null; description: string | null }>; dueInHours: number | null; description: string | null }>(`/checklists/templates/${src}`).then((t) => {
      setF({ ...t, title: copyId ? `${t.title} (Kopie)` : t.title, description: t.description ?? '', dueInHours: t.dueInHours ? String(t.dueInHours) : '',
        items: t.items.map((i) => ({ ...i, description: i.description ?? '', min: i.min != null ? String(i.min) : '', max: i.max != null ? String(i.max) : '', unit: i.unit ?? '' })) });
      setStartNow(false);
    }).catch(() => null);
  }, [editId, copyId]);
  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const setItem = (k: string, p: Partial<Item>) => set({ items: f.items.map((i) => (i.key === k ? { ...i, ...p } : i)) });
  const move = (n: number, d: number) => { const a = [...f.items]; [a[n], a[n + d]] = [a[n + d], a[n]]; set({ items: a }); };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, dueInHours: f.dueInHours ? Number(f.dueInHours) : null, startNow: !editId && startNow,
      items: f.items.map((i) => ({ ...i, min: i.min === '' ? null : Number(i.min.replace(',', '.')), max: i.max === '' ? null : Number(i.max.replace(',', '.')), unit: i.unit || null, description: i.description || null,
        showIf: i.showIf && f.items.some((x) => x.key === i.showIf!.key) ? i.showIf : null })) };
    const r = await run(() => api<{ id: string; runId: string | null }>(editId ? `/checklists/templates/${editId}` : '/checklists/templates', { method: editId ? 'PUT' : 'POST', json: body }));
    if (r && !editId) await meeting.link({ checklistId: r.id });
    if (r) router.replace(r.runId ? `/checklisten/${r.runId}` : '/checklisten');
  }
  return (
    <form className="stack-lg narrow-col cl-builder" onSubmit={submit}>
      <Back href="/checklisten" label="Checklisten" />
      <h1>{editId ? 'Checkliste bearbeiten' : 'Neue Checkliste'}</h1>
      {editId && <p className="small muted">Änderungen gelten für neue Listen. Bereits laufende Listen bleiben, wie sie sind.</p>}
      <section className="card stack">
        <div className="field"><label htmlFor="ct">Titel</label><input id="ct" className="input" required minLength={3} maxLength={140} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Zimmerkontrolle nach Abreise" /></div>
        <div className="grid">
          <div className="field"><label htmlFor="ck">Art</label><select id="ck" className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{(o?.kinds ?? ['GENERAL']).map((k) => <option key={k} value={k}>{CHECK_KIND[k] ?? k}</option>)}</select></div>
          <div className="field"><label htmlFor="cd">Beschreibung (optional)</label><input id="cd" className="input" maxLength={1000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></div>
        </div>
      </section>

      <section className="card stack">
        <h2>Punkte</h2>
        <ol className="plain stack">
          {f.items.map((i, n) => {
            const earlier = f.items.slice(0, n).filter((x) => answers(x).length);
            return (
              <li key={i.key} className="cl-row stack-s">
                <div className="row wrap">
                  <span className="xs muted">{n + 1}.</span>
                  <label className="sr" htmlFor={`it-${i.key}`}>Punkt {n + 1}</label>
                  <input id={`it-${i.key}`} className="input grow" required value={i.title} maxLength={200} onChange={(e) => setItem(i.key, { title: e.target.value })} placeholder={i.type === 'HEADING' ? 'Abschnitt, z. B. Bad' : 'Was ist zu tun oder zu prüfen?'} />
                  <label className="sr" htmlFor={`ty-${i.key}`}>Feldtyp</label>
                  <select id={`ty-${i.key}`} className="input" value={i.type} onChange={(e) => { const t = e.target.value as Type; const d = newItem(t); setItem(i.key, { type: t, options: d.options, flagged: d.flagged, unit: d.unit, required: t !== 'HEADING' }); }}>
                    {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  <button type="button" className="iconbtn" aria-label="Nach oben" disabled={n === 0} onClick={() => move(n, -1)}>↑</button>
                  <button type="button" className="iconbtn" aria-label="Nach unten" disabled={n === f.items.length - 1} onClick={() => move(n, 1)}>↓</button>
                  <button type="button" className="iconbtn" aria-label={`Punkt ${n + 1} entfernen`} disabled={f.items.length === 1} onClick={() => set({ items: f.items.filter((x) => x.key !== i.key) })}><Icon name="trash" size={16} /></button>
                </div>
                {i.type !== 'HEADING' && (
                  <details className="stack-s">
                    <summary className="small lnk">Optionen{[i.required && 'Pflicht', i.requireNote && 'Text', i.requirePhoto && 'Foto', i.flagged.length > 0 && 'kritisch', i.createTask && 'Aufgabe', i.showIf && 'bedingt'].filter(Boolean).map((x) => ` · ${x}`).join('')}</summary>
                    <div className="field"><label htmlFor={`de-${i.key}`}>Hinweis / Anleitung (optional)</label><input id={`de-${i.key}`} className="input" maxLength={500} value={i.description} onChange={(e) => setItem(i.key, { description: e.target.value })} /></div>
                    {i.type === 'CHOICE' && (
                      <div className="field"><label htmlFor={`op-${i.key}`}>Antworten (mit Komma trennen)</label><input id={`op-${i.key}`} className="input" value={i.options.join(', ')} onChange={(e) => { const opts = e.target.value.split(',').map((x) => x.trim()).filter(Boolean); setItem(i.key, { options: opts, flagged: i.flagged.filter((x) => opts.includes(x)) }); }} /></div>
                    )}
                    {(i.type === 'CHOICE' || i.type === 'YES_NO') && (
                      <fieldset className="row wrap"><legend className="small">Kritische Antworten (Notiz Pflicht, Leitung wird informiert):</legend>
                        {answers(i).map((a) => <label key={a} className="check small"><input type="checkbox" checked={i.flagged.includes(a)} onChange={(e) => setItem(i.key, { flagged: e.target.checked ? [...i.flagged, a] : i.flagged.filter((x) => x !== a) })} />{a}</label>)}
                      </fieldset>
                    )}
                    {(i.type === 'NUMBER' || i.type === 'TEMPERATURE') && (
                      <div className="row wrap">
                        <div className="field"><label htmlFor={`mi-${i.key}`}>Min</label><input id={`mi-${i.key}`} className="input sm" inputMode="decimal" value={i.min} onChange={(e) => setItem(i.key, { min: e.target.value })} /></div>
                        <div className="field"><label htmlFor={`ma-${i.key}`}>Max</label><input id={`ma-${i.key}`} className="input sm" inputMode="decimal" value={i.max} onChange={(e) => setItem(i.key, { max: e.target.value })} /></div>
                        <div className="field"><label htmlFor={`un-${i.key}`}>Einheit</label><input id={`un-${i.key}`} className="input sm" maxLength={10} value={i.unit} onChange={(e) => setItem(i.key, { unit: e.target.value })} /></div>
                      </div>
                    )}
                    <div className="row wrap">
                      <label className="check small"><input type="checkbox" checked={i.required} onChange={(e) => setItem(i.key, { required: e.target.checked })} />Pflicht</label>
                      {i.type !== 'TEXT' && <label className="check small"><input type="checkbox" checked={i.requireNote} onChange={(e) => setItem(i.key, { requireNote: e.target.checked })} />Text muss eingegeben werden</label>}
                      {i.type !== 'PHOTO' && i.type !== 'SIGNATURE' && <label className="check small"><input type="checkbox" checked={i.requirePhoto} onChange={(e) => setItem(i.key, { requirePhoto: e.target.checked })} />Foto ist Pflicht</label>}
                      {(i.flagged.length > 0 || i.type === 'NUMBER' || i.type === 'TEMPERATURE') && <label className="check small"><input type="checkbox" checked={i.createTask} onChange={(e) => setItem(i.key, { createTask: e.target.checked })} />Bei kritischer Antwort Aufgabe anlegen</label>}
                    </div>
                    {earlier.length > 0 && (
                      <div className="row wrap">
                        <label className="small" htmlFor={`si-${i.key}`}>Nur zeigen, wenn</label>
                        <select id={`si-${i.key}`} className="input" value={i.showIf?.key ?? ''} onChange={(e) => { const dep = f.items.find((x) => x.key === e.target.value); setItem(i.key, { showIf: dep ? { key: dep.key, value: answers(dep)[0] ?? '' } : null }); }}>
                          <option value="">immer zeigen</option>{earlier.map((x) => <option key={x.key} value={x.key}>„{x.title || 'Punkt'}“</option>)}</select>
                        {i.showIf && <><label className="sr" htmlFor={`sv-${i.key}`}>Antwort</label><select id={`sv-${i.key}`} className="input" value={i.showIf.value} onChange={(e) => setItem(i.key, { showIf: { ...i.showIf!, value: e.target.value } })}>
                          {answers(f.items.find((x) => x.key === i.showIf!.key)!).map((a) => <option key={a} value={a}>= {a}</option>)}</select></>}
                      </div>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        <div className="row wrap">{TYPES.map(([t, l]) => <button type="button" key={t} className="btn sm" onClick={() => set({ items: [...f.items, newItem(t)] })}><Icon name="plus" size={14} />{l}</button>)}</div>
      </section>

      <section className="card stack">
        <h2>Wer und wann</h2>
        <fieldset className="stack-s"><legend className="label">Sichtbarkeit</legend>
          <label className="check"><input type="radio" name="vis" checked={f.visibility === 'PUBLIC'} onChange={() => set({ visibility: 'PUBLIC' })} />Öffentlich – alle im Haus sehen die Vorlage und können sie für sich starten</label>
          <label className="check"><input type="radio" name="vis" checked={f.visibility === 'PRIVATE'} onChange={() => set({ visibility: 'PRIVATE' })} />Privat – nur du und die Zugewiesenen</label>
        </fieldset>
        {o && <Audience options={o.audiences} value={f.assignees} onChange={(assignees) => set({ assignees })} persons />}
        <p className="small muted">Niemand ausgewählt? Dann ist die Liste für dich selbst.</p>
        <fieldset className="stack-s"><legend className="label">Wer bearbeitet?</legend>
          <label className="check"><input type="radio" name="mode" checked={f.completionMode === 'SHARED'} onChange={() => set({ completionMode: 'SHARED' })} />Gemeinsam – eine Liste, eine oder mehrere Personen haken ab</label>
          <label className="check"><input type="radio" name="mode" checked={f.completionMode === 'EACH'} onChange={() => set({ completionMode: 'EACH' })} />Jede:r einzeln – alle Zugewiesenen füllen ihre eigene Liste aus</label>
        </fieldset>
        <div className="grid">
          <div className="field"><label htmlFor="cdh">Fällig nach … Stunden (optional)</label><input id="cdh" className="input" inputMode="numeric" value={f.dueInHours} onChange={(e) => set({ dueInHours: e.target.value.replace(/\D/g, '') })} placeholder="z. B. 4" /></div>
          <div className="field"><label htmlFor="crp">Wiederholen</label><select id="crp" className="input" value={f.repeat} onChange={(e) => set({ repeat: e.target.value as Form['repeat'] })}><option value="NONE">nicht</option><option value="DAILY">täglich</option><option value="WEEKDAYS">werktags (Mo–Fr)</option></select></div>
          {f.repeat !== 'NONE' && <div className="field"><label htmlFor="ctm">um</label><input id="ctm" type="time" className="input" value={f.time} onChange={(e) => set({ time: e.target.value })} /></div>}
        </div>
        <label className="check"><input type="checkbox" checked={f.requiresApproval} onChange={(e) => set({ requiresApproval: e.target.checked })} />Abnahme durch die Teamleitung (Vier-Augen-Prinzip)</label>
        {!editId && <label className="check"><input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />Gleich starten und zuweisen</label>}
      </section>
      <ErrorNote error={error} />
      <div className="row"><button type="button" className="btn" onClick={() => router.back()}>Abbrechen</button><button className="btn pri big" disabled={busy}>{editId ? 'Speichern' : startNow ? 'Anlegen & starten' : 'Vorlage speichern'}</button></div>
    </form>
  );
}
