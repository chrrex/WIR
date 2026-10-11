'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { Back, ErrorNote, useSubmit } from '@/components/work';
import { CHECK_KIND, RESPONSE } from '@/lib/labels';

interface It { title: string; responseType: string; required: boolean; min: string; max: string; unit: string }
const blank = (): It => ({ title: '', responseType: 'CHECK', required: true, min: '', max: '', unit: '' });

export default function NewTemplate() {
  const router = useRouter();
  const [o, setO] = useState<{ kinds: string[]; responseTypes: string[]; groups: Array<{ id: string; name: string }> } | null>(null);
  const [f, setF] = useState({ title: '', kind: 'SHIFT', groupId: '', repeat: 'NONE', time: '06:00', requiresApproval: false });
  const [items, setItems] = useState<It[]>([blank()]);
  const { busy, error, run } = useSubmit();
  useEffect(() => { api<NonNullable<typeof o>>('/checklists/options').then((r) => { setO(r); setF((x) => ({ ...x, groupId: r.groups[0]?.id ?? '' })); }); }, []);
  const upd = (i: number, p: Partial<It>) => setItems(items.map((x, n) => (n === i ? { ...x, ...p } : x)));
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await run(() => api('/checklists/templates', { method: 'POST', json: { ...f, items: items.filter((i) => i.title.trim()).map((i) => ({ title: i.title, responseType: i.responseType, required: i.required, min: num(i.min), max: num(i.max), unit: i.unit || null })) } }));
    if (r) router.replace('/checklisten');
  }
  if (!o) return <div className="loading">Lade …</div>;
  return (
    <form className="stack-lg narrow-col wide" onSubmit={submit}>
      <Back href="/checklisten" label="Checklisten" />
      <h1>Neue Checklisten-Vorlage</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="t">Name</label><input id="t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="z. B. Bankett Aufbau" /></div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="k">Art</label><select id="k" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{o.kinds.map((k) => <option key={k} value={k}>{CHECK_KIND[k]}</option>)}</select></div>
          <div className="field grow"><label htmlFor="g">Team</label><select id="g" className="input" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}>{o.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        </div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="r">Wiederholen</label><select id="r" className="input" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })}><option value="NONE">Nur von Hand starten</option><option value="DAILY">Täglich automatisch</option><option value="WEEKDAYS">Mo–Fr automatisch</option></select></div>
          {f.repeat !== 'NONE' && <div className="field"><label htmlFor="ti">Um</label><input id="ti" type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>}
        </div>
        {f.repeat !== 'NONE' && <p className="small muted">Das Team bekommt dann eine Benachrichtigung; nach 4 Stunden ist die Checkliste überfällig und die Teamleitung wird informiert.</p>}
        <label className="check"><input type="checkbox" checked={f.requiresApproval} onChange={(e) => setF({ ...f, requiresApproval: e.target.checked })} />Nach dem Abschluss von der Teamleitung freigeben lassen (Vier-Augen-Prinzip)</label>
      </section>
      <section className="card stack">
        <h2>Punkte</h2>
        {items.map((it, i) => (
          <fieldset key={i} className="stack-s plain">
            <legend className="sr">Punkt {i + 1}</legend>
            <div className="row wrap">
              <input className="input grow" aria-label={`Punkt ${i + 1}`} value={it.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder={`Punkt ${i + 1}`} />
              <select className="input" aria-label="Antwort" value={it.responseType} onChange={(e) => upd(i, { responseType: e.target.value, unit: e.target.value === 'TEMPERATURE' ? '°C' : it.unit })}>{o.responseTypes.map((t) => <option key={t} value={t}>{RESPONSE[t]}</option>)}</select>
              <button type="button" className="iconbtn" aria-label={`Punkt ${i + 1} entfernen`} onClick={() => setItems(items.filter((_, n) => n !== i))}><Icon name="trash" /></button>
            </div>
            {(it.responseType === 'TEMPERATURE' || it.responseType === 'NUMBER') && (
              <div className="row wrap">
                <input className="input sm" aria-label="Mindestwert" inputMode="decimal" placeholder="min" value={it.min} onChange={(e) => upd(i, { min: e.target.value })} />
                <input className="input sm" aria-label="Höchstwert" inputMode="decimal" placeholder="max" value={it.max} onChange={(e) => upd(i, { max: e.target.value })} />
                <input className="input sm" aria-label="Einheit" placeholder="Einheit" value={it.unit} onChange={(e) => upd(i, { unit: e.target.value })} />
              </div>
            )}
            <label className="check small"><input type="checkbox" checked={it.required} onChange={(e) => upd(i, { required: e.target.checked })} />Pflichtpunkt</label>
          </fieldset>
        ))}
        <div><button type="button" className="btn" onClick={() => setItems([...items, blank()])}><Icon name="plus" size={16} />Punkt hinzufügen</button></div>
      </section>
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri big" disabled={busy || !f.title || !f.groupId || !items.some((i) => i.title.trim())}>Vorlage speichern</button></div>
    </form>
  );
}
