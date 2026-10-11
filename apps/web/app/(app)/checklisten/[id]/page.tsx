'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ReadStatus } from '@/components/content/ReadStatus';
import { Comments } from '@/components/content/Comments';
import { api } from '@/lib/api';
import { Back, ErrorNote, State, dayTime, upload, useLoad, useSubmit } from '@/components/work';
import { RUN_STATUS } from '@/lib/labels';

interface Item { id: string; title: string; type: string; description: string | null; required: boolean; options: string[]; flagged: string[]; requireNote: boolean; requirePhoto: boolean; createTask: boolean; visible: boolean;
  min: number | null; max: number | null; unit: string | null; done: boolean; value: string | null; outOfRange: boolean | null; note: string | null; photoFileId: string | null; by: string | null; at: string | null }
interface Run { id: string; title: string; status: string; completedAt: string | null; completedBy: string | null; dueAt: string | null; startedAt: string | null; approval: string; approvedBy: string | null; approvedAt: string | null;
  canApprove: boolean; canEdit: boolean; mode: string; assignee: string | null; templateId: string; items: Item[] }

/** Unterschrift: mit Finger oder Maus zeichnen, als Bild speichern. */
function SignaturePad({ label, onSave }: { label: string; onSave: (f: File) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const down = useRef(false);
  useEffect(() => { const c = ref.current!; c.width = c.offsetWidth * 2; c.height = c.offsetHeight * 2; const g = c.getContext('2d')!; g.scale(2, 2); g.lineWidth = 2.2; g.lineCap = 'round'; g.strokeStyle = '#1E2318'; }, []);
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  return (
    <div className="stack-s">
      <canvas ref={ref} className="sigpad" role="img" aria-label={`Unterschriftsfeld: ${label}`}
        onPointerDown={(e) => { down.current = true; const g = ref.current!.getContext('2d')!; g.beginPath(); g.moveTo(...pos(e)); ref.current!.setPointerCapture?.(e.pointerId); }}
        onPointerUp={() => { down.current = false; }}
        onPointerMove={(e) => { if (!down.current) return; const g = ref.current!.getContext('2d')!; g.lineTo(...pos(e)); g.stroke(); setDrawn(true); }} />
      <div className="row">
        <button type="button" className="btn sm" onClick={() => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setDrawn(false); }}>Löschen</button>
        <button type="button" className="btn sm pri" disabled={!drawn} onClick={() => ref.current!.toBlob((b) => b && onSave(new File([b], 'unterschrift.png', { type: 'image/png' })))}>Unterschrift speichern</button>
      </div>
    </div>
  );
}

function Row({ it, locked, save }: { it: Item; locked: boolean; save: (body: object) => Promise<unknown> }) {
  const [v, setV] = useState(it.value ?? '');
  const [note, setNote] = useState(it.note ?? '');
  const [showNote, setShowNote] = useState(false);
  if (!it.visible) return null;
  if (it.type === 'HEADING') return <li className="cl-item heading"><h2 className="h-sub">{it.title}</h2></li>;
  const range = it.min != null || it.max != null ? `Soll ${it.min ?? '…'} bis ${it.max ?? '…'} ${it.unit ?? ''}` : null;
  const numeric = it.type === 'TEMPERATURE' || it.type === 'NUMBER';
  const photo = async (f: File | undefined) => { if (f) await save({ photoFileId: (await upload(f, 'image')).id }); };
  const needNote = it.outOfRange || (it.requireNote && it.done);
  return (
    <li className={`card stack-s cl-item ${it.outOfRange ? 'flag deviation' : ''}`}>
      <div className="row between wrap">
        {it.type === 'CHECK'
          ? <label className="check"><input type="checkbox" checked={it.done} disabled={locked} onChange={(e) => save({ done: e.target.checked })} /><strong>{it.title}</strong></label>
          : <strong>{it.title}</strong>}
        <span className="xs muted">{!it.required && 'freiwillig'}{it.done && it.by && ` ✓ ${it.by}, ${dayTime(it.at)}`}</span>
      </div>
      {it.description && <p className="small muted">{it.description}</p>}
      {numeric && (
        <div className="row wrap">
          <label className="sr" htmlFor={`v${it.id}`}>{it.title}{it.unit ? ` in ${it.unit}` : ''}</label>
          <input id={`v${it.id}`} className="input sm" inputMode="decimal" value={v} disabled={locked} onChange={(e) => setV(e.target.value)} onBlur={() => v && v !== it.value && save({ value: v })} placeholder={it.unit ?? ''} />
          {range && <span className="small muted">{range}</span>}
        </div>
      )}
      {(it.type === 'YES_NO' || it.type === 'CHOICE') && (
        <div className="seg wrap" role="group" aria-label={it.title}>{(it.type === 'YES_NO' ? ['Ja', 'Nein', 'n. a.'] : it.options).map((x) => (
          <button type="button" key={x} disabled={locked} aria-pressed={it.value === x} onClick={() => save({ value: x })}>{x}{it.flagged.includes(x) ? ' ⚠' : ''}</button>
        ))}</div>
      )}
      {it.type === 'TEXT' && <textarea className="input area" rows={2} aria-label={it.title} disabled={locked} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (it.value ?? '') && save({ value: v })} />}
      {(it.type === 'PHOTO' || it.type === 'SIGNATURE' || it.requirePhoto) && (it.photoFileId
        ? <div className="row wrap"><a href={`/api/v1/files/${it.photoFileId}`} target="_blank" rel="noopener"><img className="sig-img" src={`/api/v1/files/${it.photoFileId}`} alt={it.type === 'SIGNATURE' ? `Unterschrift: ${it.title}` : `Foto: ${it.title}`} /></a>
            {!locked && <button type="button" className="btn sm cl-noprint" onClick={() => save(it.type === 'PHOTO' || it.type === 'SIGNATURE' ? { done: false } : { photoFileId: null })}>Ersetzen</button>}</div>
        : !locked && (it.type === 'SIGNATURE' ? <SignaturePad label={it.title} onSave={photo} />
          : <label className="btn sm cl-noprint">📷 {it.type === 'PHOTO' ? 'Foto aufnehmen' : 'Foto hinzufügen (Pflicht)'}<input className="sr" type="file" accept="image/*" capture="environment" onChange={(e) => photo(e.target.files?.[0])} /></label>))}
      {(needNote || showNote || it.note) ? (
        <div className="stack-s">
          {it.outOfRange && <p className="warn-ink small"><strong>Kritische Antwort.</strong> Was ist los bzw. was hast du unternommen?{it.createTask && ' Daraus wird beim Abschließen automatisch eine Aufgabe.'}</p>}
          <label className={it.outOfRange ? 'sr' : 'small'} htmlFor={`n${it.id}`}>{it.requireNote ? 'Text (Pflicht)' : 'Notiz'}{it.outOfRange ? ` zu ${it.title}` : ''}</label>
          <input id={`n${it.id}`} className="input" value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (it.note ?? '') && save({ note })} />
        </div>
      ) : !locked && it.type !== 'TEXT' && <button type="button" className="lnk small cl-noprint" onClick={() => setShowNote(true)}>{it.requireNote ? 'Text eingeben (Pflicht)' : 'Notiz hinzufügen'}</button>}
    </li>
  );
}

function Approve({ id, onDone }: { id: string; onDone: (r: Run) => void }) {
  const [note, setNote] = useState('');
  const { busy, error, run } = useSubmit();
  const send = (approve: boolean) => run(() => api<Run>(`/checklists/runs/${id}/approve`, { method: 'POST', json: { approve, note: note || null } })).then((r) => r && onDone(r));
  return (
    <section className="card stack cl-noprint">
      <h2>Abnahme</h2>
      <input className="input" aria-label="Hinweis (bei Zurückweisen empfohlen)" placeholder="Hinweis (bei Zurückweisen empfohlen)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row"><button className="btn pri" disabled={busy} onClick={() => send(true)}>Abnehmen</button><button className="btn warn" disabled={busy} onClick={() => send(false)}>Zurück zum Nacharbeiten</button></div>
      <ErrorNote error={error} />
    </section>
  );
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, setData } = useLoad<Run>(`/checklists/runs/${id}`);
  const { busy, error: err, run } = useSubmit();
  if (!r) return <State error={error} loading back={['/checklisten', 'Zu den Checklisten']} />;
  const locked = r.status === 'COMPLETED' || !r.canEdit;
  const save = (itemId: string) => (body: object) => run(() => api<Run>(`/checklists/runs/${id}/items/${itemId}`, { method: 'PATCH', json: body })).then((x) => x && setData(x));
  const items = r.items.filter((i) => i.visible && i.type !== 'HEADING');
  const done = items.filter((i) => i.done).length;
  const overdue = r.dueAt && new Date(r.dueAt) < new Date() && r.status !== 'COMPLETED';
  return (
    <div className="stack-lg narrow-col">
      <span className="cl-noprint"><Back href="/checklisten" label="Checklisten" /></span>
      <div className="row between wrap"><h1>{r.title}</h1><button className="btn sm cl-noprint" onClick={() => window.print()}>Drucken / PDF</button></div>
      <p className="muted">{RUN_STATUS[r.status]} · {done} von {items.length} erledigt{r.assignee && ` · für ${r.assignee}`}{r.mode === 'SHARED' && ' · gemeinsame Liste'}{r.completedBy && ` · abgeschlossen von ${r.completedBy}, ${dayTime(r.completedAt)}`}</p>
      <span className="progress" aria-hidden="true" style={{ maxWidth: 'none' }}><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></span>
      {r.dueAt && r.status !== 'COMPLETED' && <p className={overdue ? 'warn-ink' : 'small muted'}>{overdue ? 'Überfällig seit' : 'Fällig bis'} {dayTime(r.dueAt)}</p>}
      {!r.canEdit && r.status !== 'COMPLETED' && <div className="note info">Diese Liste füllt {r.assignee ?? 'die zugewiesene Person'} selbst aus – du siehst den Stand.</div>}
      {r.approval === 'PENDING' && <div className="note info">Wartet auf Abnahme durch die Teamleitung.</div>}
      {r.approval === 'APPROVED' && <div className="note ok">Abgenommen von {r.approvedBy}, {dayTime(r.approvedAt)}.</div>}
      {r.canApprove && <Approve id={id} onDone={setData} />}
      <ol className="plain stack">{r.items.map((it) => <Row key={`${it.id}-${it.done}-${it.value}-${it.photoFileId}-${it.visible}`} it={it} locked={locked} save={save(it.id)} />)}</ol>
      <ErrorNote error={err} />
      <div className="row wrap cl-noprint">
        {!locked && <button className="btn pri big" disabled={busy} onClick={() => run(() => api(`/checklists/runs/${id}/complete`, { method: 'POST' })).then((x) => x && api<Run>(`/checklists/runs/${id}`).then(setData))}>Checkliste abschließen</button>}
        {locked && <Link className="btn" href="/checklisten">Zur Übersicht</Link>}
        <Link className="btn" href={`/checklisten/neu?copy=${r.templateId}`}>Als Vorlage kopieren</Link>
      </div>
      <section className="card cmts"><h2 className="h-sub">Rückfragen</h2><Comments contentId={r.id} /></section>
      <span className="cl-noprint"><ReadStatus contentId={r.id} /></span>
    </div>
  );
}
