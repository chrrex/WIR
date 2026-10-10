'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ReadStatus } from '@/components/content/ReadStatus';
import { api } from '@/lib/api';
import { Back, ErrorNote, State, dayTime, upload, useLoad, useSubmit } from '@/components/work';
import { RUN_STATUS } from '@/lib/labels';

interface Item { id: string; title: string; type: string; required: boolean; min: number | null; max: number | null; unit: string | null; done: boolean; value: string | null; outOfRange: boolean | null; note: string | null; photoFileId: string | null; by: string | null; at: string | null }
interface Run { id: string; title: string; status: string; completedAt: string | null; completedBy: string | null; items: Item[] }

function Row({ it, locked, save }: { it: Item; locked: boolean; save: (body: object) => Promise<unknown> }) {
  const [v, setV] = useState(it.value ?? '');
  const [note, setNote] = useState(it.note ?? '');
  const range = it.min != null || it.max != null ? `Soll ${it.min ?? '…'} bis ${it.max ?? '…'} ${it.unit ?? ''}` : null;
  const numeric = it.type === 'TEMPERATURE' || it.type === 'NUMBER';
  return (
    <li className={`card stack-s ${it.outOfRange ? 'deviation' : ''}`}>
      <div className="row between wrap">
        {it.type === 'CHECK'
          ? <label className="check"><input type="checkbox" checked={it.done} disabled={locked} onChange={(e) => save({ done: e.target.checked })} /><strong>{it.title}</strong></label>
          : <strong>{it.title}{!it.required && <span className="xs muted"> (freiwillig)</span>}</strong>}
        {it.done && it.by && <span className="xs muted">✓ {it.by}, {dayTime(it.at)}</span>}
      </div>
      {numeric && (
        <div className="row wrap">
          <label className="sr" htmlFor={`v${it.id}`}>{it.title} in {it.unit}</label>
          <input id={`v${it.id}`} className="input sm" inputMode="decimal" value={v} disabled={locked} onChange={(e) => setV(e.target.value)} onBlur={() => v && v !== it.value && save({ value: v })} placeholder={it.unit ?? ''} />
          {range && <span className="small muted">{range}</span>}
        </div>
      )}
      {it.type === 'YES_NO' && <div className="seg" role="group" aria-label={it.title}>{['Ja', 'Nein'].map((x) => <button type="button" key={x} disabled={locked} aria-pressed={it.value === x} onClick={() => save({ value: x })}>{x}</button>)}</div>}
      {it.type === 'TEXT' && <textarea className="input area" rows={2} aria-label={it.title} disabled={locked} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (it.value ?? '') && save({ value: v })} />}
      {it.type === 'PHOTO' && (it.photoFileId ? <a className="lnk" href={`/api/v1/files/${it.photoFileId}`} target="_blank" rel="noopener">Foto ansehen</a>
        : !locked && <input type="file" accept="image/*" capture="environment" aria-label={`Foto: ${it.title}`} onChange={async (e) => { const f = e.target.files?.[0]; if (f) await save({ photoFileId: (await upload(f, 'image')).id }); }} />)}
      {it.outOfRange && (
        <div className="stack-s">
          <p className="warn-ink small"><strong>Abweichung.</strong> Was hast du unternommen?</p>
          <input className="input" aria-label={`Maßnahme zu ${it.title}`} value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (it.note ?? '') && save({ note })} placeholder="z. B. Tür geschlossen, nach 30 Min. erneut gemessen" />
        </div>
      )}
    </li>
  );
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, setData } = useLoad<Run>(`/checklists/runs/${id}`);
  const { busy, error: err, run } = useSubmit();
  if (!r) return <State error={error} loading back={['/checklisten', 'Zu den Checklisten']} />;
  const locked = r.status === 'COMPLETED';
  const save = (itemId: string) => (body: object) => run(() => api<Run>(`/checklists/runs/${id}/items/${itemId}`, { method: 'PATCH', json: body })).then((x) => x && setData(x));
  const done = r.items.filter((i) => i.done).length;
  return (
    <div className="stack-lg narrow-col">
      <Back href="/checklisten" label="Checklisten" />
      <h1>{r.title}</h1>
      <p className="muted">{RUN_STATUS[r.status]} · {done} von {r.items.length} erledigt{r.completedBy && ` · abgeschlossen von ${r.completedBy}, ${dayTime(r.completedAt)}`}</p>
      <progress max={r.items.length} value={done} aria-label="Fortschritt" style={{ width: '100%' }} />
      <ol className="plain stack">{r.items.map((it) => <Row key={it.id + String(it.done) + String(it.outOfRange)} it={it} locked={locked} save={save(it.id)} />)}</ol>
      <ErrorNote error={err} />
      {!locked ? <button className="btn pri big" disabled={busy} onClick={() => run(() => api(`/checklists/runs/${id}/complete`, { method: 'POST' })).then((x) => x && api<Run>(`/checklists/runs/${id}`).then(setData))}>Checkliste abschließen</button>
        : <Link className="btn" href="/checklisten">Zur Übersicht</Link>}
      <ReadStatus contentId={r.id} />
    </div>
  );
}
