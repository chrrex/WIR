'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '@/components/Icon';
import { ReadStatus } from '@/components/content/ReadStatus';
import { Back, ErrorNote, PersonPicker, State, day, dayTime, upload, useLoad, useSubmit } from '@/components/work';
import { ATTENDANCE, ITEM_STATUS, LINK_KIND, MAKE, MEETING_STATUS, ORIGIN, ROLE, makeHref, mmss, when, type I, type L, type Meeting } from '@/lib/meetings';
import { TASK_STATUS } from '@/lib/labels';
import { useTx } from '@/lib/translate';

const SOURCE: Record<string, string> = { news: 'News', uebergaben: 'Übergabe', ideen: 'Idee', aufgaben: 'Aufgabe', checklisten: 'Checkliste', chat: 'Chat' };
const linkStatus = (l: L) => (l.kind === 'TASK' ? TASK_STATUS[l.status ?? ''] : l.status === 'DRAFT' ? 'Entwurf · wartet auf Freigabe' : l.status === 'PUBLISHED' ? 'veröffentlicht' : null);

/** Uhr für laufende Timer – nur aktiv, wenn gerade ein Punkt läuft. */
function useTick(on: boolean) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => set((n) => n + 1), 1000); return () => clearInterval(t); }, [on]);
}

export default function Page() { return <Suspense><MeetingPage /></Suspense>; }

function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: m, error, reload } = useLoad<Meeting>(`/meetings/${id}`);
  const [loadedAt, setLoadedAt] = useState(Date.now());
  useEffect(() => setLoadedAt(Date.now()), [m]);
  useTick(!!m?.items.some((i) => i.running));
  const { busy, error: err, run } = useSubmit();
  const fresh = useSearchParams().get('outlook') === '1';
  if (!m) return <State error={error} loading back={['/meetings', 'Zu den Meetings']} />;
  const act = (path: string, json: unknown, method = 'POST') => run(() => api(path, { method, json })).then((r) => { reload(); return r; });
  const state = (action: string, note?: string) => act(`/meetings/${id}/state`, { action, note });
  const editable = !['LOCKED', 'CANCELLED'].includes(m.status);
  const agenda = m.items.filter((i) => !['MERGED', 'PARKED'].includes(i.status));
  const parkedHere = m.items.filter((i) => i.status === 'PARKED');
  const own = agenda.filter((i) => i.origin !== 'STANDARD').length;
  const total = agenda.filter((i) => i.status !== 'POSTPONED').reduce((s, i) => s + i.durationMin, 0);
  const after = m.agendaDeadline && new Date(m.agendaDeadline) < new Date();
  const ctx = { m, act, busy, loadedAt, reload };

  return (
    <div className="stack-lg mt-page">
      <Back href="/meetings" label="Meetings" />
      <header className="card stack">
        <div className="row wrap gap-s"><span className={`chip ${m.status === 'LIVE' ? 'warn' : m.status === 'LOCKED' ? 'ok' : 'info'}`}>{MEETING_STATUS[m.status]}</span>{m.series?.rule && <span className="chip">{m.series.rule}</span>}</div>
        <h1>{m.title}</h1>
        <p className="muted">{when(m.startsAt)} · {m.durationMin} Min.{m.location && ` · ${m.location}`}</p>
        <div className="row wrap noprint">
          {m.onlineUrl && editable && <a className="btn sm" href={m.onlineUrl} target="_blank" rel="noreferrer">Online teilnehmen</a>}
          {editable && <a className="btn sm" href={`/api/v1/meetings/${id}/ics`} download><Icon name="calendar" size={16} />In meinen Kalender</a>}
          {m.status === 'LOCKED' && <Link className="btn sm" href={`/meetings/${id}/druck`}>Drucken / PDF</Link>}
          {m.status === 'LOCKED' && m.me.lead && <Link className="btn sm" href={`/meetings/${id}/druck?gaeste=1`}>PDF für Gäste</Link>}
        </div>
        {m.me.lead && editable && m.status !== 'LIVE' && <OutlookInvite id={id} highlight={fresh} />}
        {m.status === 'PLANNED' && m.agendaDeadline && !after && <p className="note info small"><Icon name="calendar" size={16} />Punkte einbringen bis {when(m.agendaDeadline)}.</p>}
        {m.status === 'CANCELLED' && <p className="note warn small">Fällt aus{m.cancelNote ? `: ${m.cancelNote}` : ''}. Offene Punkte wandern ins nächste Meeting.</p>}
        {m.status === 'REVIEW' && <p className="note info small">Eingereicht von {m.submittedBy} am {dayTime(m.submittedAt)}. {m.me.lead ? 'Bitte prüfen und festschreiben.' : 'Die Leitung prüft und schreibt fest.'}</p>}
        {m.status === 'LOCKED' && <p className="note ok small"><Icon name="lock" size={16} />Festgeschrieben am {dayTime(m.lockedAt)} von {m.lockedBy} (Protokoll: {m.submittedBy}). Änderungen nur als Nachtrag. Aufbewahrt bis {day(m.retainUntil)}.</p>}

        {m.me.lead && m.status === 'PLANNED' && after && own === 0 && (
          <div className="note warn stack-s"><strong>Es sind keine Punkte eingegangen. Meeting ausfallen lassen?</strong>
            <div className="row"><button className="btn sm warn" disabled={busy} onClick={() => state('cancel', 'Keine Themen – wir sehen uns nächste Woche.')}>Ausfallen lassen</button></div></div>
        )}
        <div className="row wrap noprint">
          {m.me.lead && ['PLANNED', 'AGENDA_SET'].includes(m.status) && <button className="btn pri" disabled={busy} onClick={() => state('set-agenda')}>{m.status === 'PLANNED' ? 'Agenda festlegen und verteilen' : 'Agenda erneut verteilen'}</button>}
          {m.me.minutes && ['PLANNED', 'AGENDA_SET'].includes(m.status) && <button className="btn" disabled={busy} onClick={() => state('start')}><Icon name="timer" size={18} />Meeting starten</button>}
          {m.me.minutes && m.status === 'LIVE' && <button className="btn pri" disabled={busy} onClick={() => state('submit')}>Protokoll einreichen</button>}
          {m.me.lead && m.status === 'REVIEW' && <><button className="btn pri" disabled={busy} onClick={() => state('lock')}><Icon name="lock" size={18} />Festschreiben</button><button className="btn" disabled={busy} onClick={() => state('reopen')}>Zurück ins Protokoll</button></>}
          {m.me.lead && ['PLANNED', 'AGENDA_SET'].includes(m.status) && !(after && own === 0) && <button className="btn warn" disabled={busy} onClick={() => state('cancel')}>Absagen</button>}
        </div>
        {m.status === 'LIVE' && <p className="xs muted">Nicht besprochene Punkte werden beim Einreichen automatisch vertagt.</p>}
        <ErrorNote error={err} />
      </header>

      <div className="mt-grid">
        <div className="stack-lg">
          {m.previous && m.previous.openTasks.length > 0 && editable && (
            <section className="card stack-s" aria-labelledby="prev-h">
              <h2 id="prev-h">Aus dem letzten Meeting</h2>
              <p className="small muted">Offene Aufgaben vom {day(m.previous.startsAt)}.</p>
              <ul className="plain stack-s">{m.previous.openTasks.map((l) => <li key={l.id} className="row between wrap"><Link href={l.href}>{l.title}</Link><span className="small muted">{l.assignee} · {linkStatus(l)}</span></li>)}</ul>
            </section>
          )}

          <section className="stack" aria-labelledby="ag-h">
            <div className="row between wrap"><h2 id="ag-h">{m.status === 'LOCKED' ? 'Ergebnisprotokoll' : 'Agenda'}</h2><span className="small muted">{agenda.length} Punkte · rund {total} Min.{m.hidden > 0 && ` · ${m.hidden} vertraulich`}</span></div>
            {agenda.map((i, k) => <ItemCard key={i.id} i={i} n={k + 1} list={agenda} ctx={ctx} />)}
            {agenda.length === 0 && <div className="card empty">Noch keine Punkte.</div>}
          </section>

          {editable && m.status !== 'REVIEW' && (m.me.attendee || m.me.lead) && (m.status !== 'LIVE' || m.me.minutes) && <AddItem m={m} onDone={reload} />}

          {(parkedHere.length > 0 || m.parked.length > 0) && (
            <section className="card stack-s" aria-labelledby="pk-h">
              <h2 id="pk-h">Parkplatz</h2>
              <p className="small muted">Themen für später – die Leitung holt sie in ein Meeting.</p>
              <ul className="plain stack-s">
                {parkedHere.map((i) => <li key={i.id} className="row between wrap"><span>{i.title}</span>{m.me.minutes && editable && <button className="btn sm" disabled={busy} onClick={() => act(`/meetings/items/${i.id}`, { status: 'SET' }, 'PATCH')}>Zurück auf die Agenda</button>}</li>)}
                {m.parked.map((p) => <li key={p.id} className="row between wrap"><span>{p.title} <span className="xs muted">· seit {day(p.from)}</span></span><button className="btn sm" disabled={busy} onClick={() => act(`/meetings/${id}/pull`, { itemId: p.id })}>Übernehmen</button></li>)}
              </ul>
            </section>
          )}

          {m.ideas.length > 0 && (
            <section className="card stack-s" aria-labelledby="id-h">
              <h2 id="id-h">Vorschläge: Ideen mit viel Zuspruch</h2>
              <ul className="plain stack-s">{m.ideas.map((x) => <li key={x.id} className="row between wrap"><Link href={`/ideen/${x.id}`}>{x.title} <span className="xs muted">· 👍 {x.likes}</span></Link>
                <button className="btn sm" disabled={busy} onClick={() => act(`/meetings/${id}/items`, { title: `Idee: ${x.title}`, sourcePath: `/ideen/${x.id}` })}>Auf die Agenda</button></li>)}</ul>
            </section>
          )}

          {m.status === 'LOCKED' && <Addenda m={m} act={act} busy={busy} />}
        </div>

        <aside className="stack-lg">
          <Attendees m={m} act={act} busy={busy} />
          <ReadStatus contentId={m.id} />
        </aside>
      </div>
    </div>
  );
}

type Ctx = { m: Meeting; act: (p: string, j: unknown, method?: string) => Promise<unknown>; busy: boolean; loadedAt: number; reload: () => void };

function ItemCard({ i, n, list, ctx }: { i: I; n: number; list: I[]; ctx: Ctx }) {
  const { m, act, busy, loadedAt } = ctx;
  const title = useTx('AGENDA_ITEM', i.id, 'title', i.title);
  const notesTx = useTx('AGENDA_ITEM', i.id, 'body', i.notes ?? '');
  const open = !['LOCKED', 'CANCELLED'].includes(m.status);
  const planning = ['PLANNED', 'AGENDA_SET'].includes(m.status);
  const live = ['LIVE', 'REVIEW'].includes(m.status) && m.me.minutes;
  const mine = i.authorId === m.me.id && i.status === 'PROPOSED' && planning;
  const spent = i.spentSec + (i.running ? Math.round((Date.now() - loadedAt) / 1000) : 0);
  const over = spent > i.durationMin * 60;
  const move = (d: number) => { const ids = list.map((x) => x.id); const k = ids.indexOf(i.id); [ids[k], ids[k + d]] = [ids[k + d], ids[k]]; return act(`/meetings/${m.id}/order`, { ids }); };
  const patch = (json: unknown) => act(`/meetings/items/${i.id}`, json, 'PATCH');
  const src = i.sourcePath?.split('/')[1];
  return (
    <article id={`p-${i.id}`} className={`card stack mt-item ${i.running ? 'running' : ''} ${i.status === 'POSTPONED' ? 'dim' : ''}`}>
      <div className="row between wrap gap-s">
        <div className="row gap-s grow"><span className="mt-n" aria-hidden="true">{n}</span><h3 className="grow" lang={title.lang}>{title.text}</h3></div>
        <div className="chips">
          {i.confidential && <span className="chip warn" title={`Sichtbar für: ${i.viewers.map((v) => v.name).join(', ') || 'Leitung und Protokoll'}`}>🔒 vertraulich</span>}
          {i.origin && ORIGIN[i.origin] && <span className="chip info">{ORIGIN[i.origin]}</span>}
          {i.status !== 'SET' && <span className={`chip ${i.status === 'DONE' ? 'ok' : ''}`}>{ITEM_STATUS[i.status]}</span>}
        </div>
      </div>
      <p className="small muted">{i.owner && `${i.owner} · `}{i.durationMin} Min.{src && <> · aus {SOURCE[src]}: <Link href={i.sourcePath!}>ansehen</Link></>}{i.followUpOn && ` · Wiedervorlage ${day(i.followUpOn)}`}</p>
      {i.description && <p className="pre">{i.description}</p>}

      {live && m.status === 'LIVE' && m.me.timekeeper && i.status !== 'POSTPONED' && (
        <div className="row wrap gap-s mt-timer">
          <button className={`btn sm ${i.running ? 'pri' : ''}`} disabled={busy} onClick={() => act(`/meetings/items/${i.id}/timer`, { run: !i.running })}><Icon name="timer" size={16} />{i.running ? 'Pause' : spent ? 'Weiter' : 'Start'}</button>
          <span className={`mt-clock ${over ? 'warn-ink' : ''}`} role="timer" aria-live="off">{mmss(spent)} / {i.durationMin}:00</span>
        </div>
      )}
      {!live && i.spentSec > 0 && <p className="xs muted">Besprochen in {Math.round(i.spentSec / 60)} Min.</p>}

      {live ? <Notes i={i} save={(notes) => patch({ notes })} /> : i.notes && <div className="pre mt-notes" lang={notesTx.lang}>{notesTx.text}</div>}

      {i.photos.length > 0 && <div className="row wrap gap-s">{i.photos.map((p) => <a key={p} href={`/api/v1/files/${p}`} target="_blank" rel="noreferrer"><img className="mt-photo" src={`/api/v1/files/${p}`} alt="Flipchart-Foto" loading="lazy" /></a>)}</div>}

      {(i.decisions.length > 0 || live) && (
        <div className="stack-s">
          <h4 className="label">Entscheidungen</h4>
          <ul className="plain stack-s">{i.decisions.map((d) => <Decision key={d.id} d={d} i={i} ctx={ctx} live={live} />)}</ul>
          {live && <InlineAdd label="Entscheidung festhalten" placeholder="z. B. Ab 1. November nur noch neue Karten" onAdd={(text) => act(`/meetings/items/${i.id}/decisions`, { text })} />}
        </div>
      )}

      {i.links.filter((l) => !l.decisionId).length > 0 && <Results links={i.links.filter((l) => !l.decisionId)} />}

      {live && (
        <div className="row wrap gap-s noprint">
          <Make i={i} ctx={ctx} />
          {i.status !== 'DONE' && <button className="btn sm pri" disabled={busy} onClick={() => patch({ status: 'DONE' })}><Icon name="check" size={16} />Besprochen</button>}
          {i.status !== 'POSTPONED' && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'POSTPONED' })}>Vertagen</button>}
          {i.status === 'POSTPONED' && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'SET' })}>Doch besprechen</button>}
          <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'PARKED' })}>Parkplatz</button>
          <label className="btn sm"><Icon name="camera" size={16} />Foto<input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const up = await upload(f, 'image'); await patch({ photoFileIds: [...i.photos, up.id] }); } }} /></label>
          <label className="row gap-s small">Wiedervorlage<input type="date" className="input sm" value={i.followUpOn?.slice(0, 10) ?? ''} onChange={(e) => patch({ followUpOn: e.target.value || null })} /></label>
        </div>
      )}

      {open && planning && (m.me.lead || mine) && (
        <div className="row wrap gap-s noprint">
          {m.me.lead && <><button className="btn sm" aria-label="Nach oben" disabled={busy || n === 1} onClick={() => move(-1)}>↑</button><button className="btn sm" aria-label="Nach unten" disabled={busy || n === list.length} onClick={() => move(1)}>↓</button></>}
          {m.me.lead && i.status !== 'POSTPONED' && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'POSTPONED' })}>Vertagen</button>}
          {m.me.lead && i.status === 'POSTPONED' && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'SET' })}>Wieder aufnehmen</button>}
          {m.me.lead && <button className="btn sm" disabled={busy} onClick={() => patch({ status: 'PARKED' })}>Parken</button>}
          {m.me.lead && list.length > 1 && i.origin !== 'STANDARD' && (
            <select className="input sm" aria-label="Zusammenlegen mit" value="" onChange={(e) => e.target.value && act(`/meetings/items/${i.id}/merge`, { intoId: e.target.value })}>
              <option value="">Zusammenlegen mit …</option>{list.filter((x) => x.id !== i.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </select>
          )}
          {(m.me.lead || mine) && i.origin !== 'STANDARD' && !i.decisions.length && !i.links.length && <button className="btn sm warn" disabled={busy} aria-label={`${i.title} löschen`} onClick={() => act(`/meetings/items/${i.id}`, {}, 'DELETE')}><Icon name="trash" size={16} /></button>}
        </div>
      )}
    </article>
  );
}

function Decision({ d, i, ctx, live }: { d: { id: string; text: string }; i: I; ctx: Ctx; live: boolean }) {
  const text = useTx('MEETING_DECISION', d.id, 'title', d.text);
  const links = i.links.filter((l) => l.decisionId === d.id);
  return (
    <li className="mt-decision stack-s">
      <div className="row between gap-s"><span><span aria-hidden="true">✔ </span><strong lang={text.lang}>{text.text}</strong></span>
        {live && ctx.m.status !== 'LOCKED' && <button className="lnk small" aria-label="Entscheidung entfernen" onClick={() => ctx.act(`/meetings/decisions/${d.id}`, {}, 'DELETE')}>entfernen</button>}</div>
      {links.length > 0 && <Results links={links} />}
      {live && <Make i={i} ctx={ctx} decision={d} />}
    </li>
  );
}

function Results({ links }: { links: L[] }) {
  return (
    <ul className="plain mt-results">
      {links.map((l) => (
        <li key={l.id} className="row wrap gap-s small">
          <span className="chip">{LINK_KIND[l.kind]}</span><Link href={l.href}>{l.title}</Link>
          <span className="muted">{[l.assignee, l.dueAt && `bis ${day(l.dueAt)}`, linkStatus(l)].filter(Boolean).join(' · ')}</span>
          {l.kind === 'TASK' && l.status === 'DONE' && <span aria-label="erledigt">✓</span>}
        </li>
      ))}
    </ul>
  );
}

/** „Daraus machen …“: Aufgabe direkt hier, alles andere im passenden Formular – vorbefüllt und verknüpft. */
function Make({ i, ctx, decision }: { i: I; ctx: Ctx; decision?: { id: string; text: string } }) {
  const { m, act, busy } = ctx;
  const [task, setTask] = useState(false);
  const router = useRouter();
  const [f, setF] = useState({ title: decision?.text ?? '', userId: '', due: '' });
  const people = m.attendees.filter((a) => a.userId);
  const text = [decision ? `Entscheidung: ${decision.text}` : i.notes || i.description || '', '', `Aus dem ${m.title} am ${day(m.startsAt)} – Punkt „${i.title}“.`].join('\n').trim();
  return (
    <div className="stack-s noprint">
      <select className="input sm mt-make" aria-label={decision ? 'Aus der Entscheidung machen' : 'Aus dem Punkt machen'} value="" onChange={(e) => {
        const v = e.target.value;
        if (v === 'TASK') setTask(true);
        else if (v) router.push(makeHref(MAKE.find((x) => x.kind === v)!.href, i.id, decision?.text ?? i.title, text, decision?.id));
      }}>
        <option value="">Daraus machen …</option><option value="TASK">Aufgabe</option>{MAKE.map((x) => <option key={x.kind} value={x.kind}>{x.label}</option>)}
      </select>
      {task && (
        <form className="row wrap gap-s mt-task" onSubmit={async (e) => { e.preventDefault(); await act(`/meetings/items/${i.id}/tasks`, { title: f.title, userId: f.userId, dueAt: f.due ? new Date(f.due).toISOString() : null, decisionId: decision?.id ?? null, description: text }); setTask(false); setF({ title: '', userId: '', due: '' }); }}>
          <input className="input sm grow" aria-label="Aufgabe" placeholder="Was ist zu tun?" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} />
          <select className="input sm" aria-label="Für wen" value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required><option value="">Für …</option>{people.map((p) => <option key={p.id} value={p.userId!}>{p.name}</option>)}</select>
          <input className="input sm" type="date" aria-label="Fällig am" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
          <button className="btn sm pri" disabled={busy}>Vergeben</button>
        </form>
      )}
    </div>
  );
}

function Notes({ i, save }: { i: I; save: (s: string) => Promise<unknown> }) {
  const [v, setV] = useState(i.notes ?? '');
  const [saved, setSaved] = useState(false);
  return (
    <div className="field">
      <label htmlFor={`n-${i.id}`} className="label">Notizen{saved && <span className="xs muted"> · gespeichert</span>}</label>
      <textarea id={`n-${i.id}`} className="input area" rows={3} value={v} onChange={(e) => { setV(e.target.value); setSaved(false); }} onBlur={async () => { if (v !== (i.notes ?? '')) { await save(v); setSaved(true); } }} placeholder="Was wurde besprochen?" />
    </div>
  );
}

function InlineAdd({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (t: string) => Promise<unknown> }) {
  const [v, setV] = useState('');
  return (
    <form className="row gap-s noprint" onSubmit={async (e) => { e.preventDefault(); await onAdd(v); setV(''); }}>
      <input className="input sm grow" aria-label={label} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} minLength={3} required />
      <button className="btn sm">{label.split(' ')[0]}</button>
    </form>
  );
}

function AddItem({ m, onDone }: { m: Meeting; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', description: '', durationMin: 10, ownerId: m.me.id, confidential: false, viewerIds: [] as string[] });
  const { busy, error, run } = useSubmit();
  const people = m.attendees.filter((a) => a.userId);
  if (!open) return <button className="btn pri noprint" onClick={() => setOpen(true)}><Icon name="plus" size={18} />Punkt einbringen</button>;
  return (
    <form className="card stack noprint" onSubmit={async (e) => { e.preventDefault(); if (await run(() => api(`/meetings/${m.id}/items`, { method: 'POST', json: f }))) { setOpen(false); setF({ ...f, title: '', description: '' }); onDone(); } }}>
      <h2>Punkt einbringen</h2>
      <div className="field"><label htmlFor="ai-t">Thema</label><input id="ai-t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={160} /></div>
      <div className="field"><label htmlFor="ai-d">Worum geht es? (freiwillig)</label><textarea id="ai-d" className="input area" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="row wrap">
        <div className="field grow"><label htmlFor="ai-o">Wer stellt es vor?</label><select id="ai-o" className="input" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.userId!}>{p.name}</option>)}</select></div>
        <div className="field"><label htmlFor="ai-m">Dauer (Min.)</label><input id="ai-m" type="number" min={1} max={240} className="input" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={f.confidential} onChange={(e) => setF({ ...f, confidential: e.target.checked })} />Vertraulich – nur für ausgewählte Personen</label>
      {f.confidential && (
        <div className="stack-s"><span className="xs muted">Leitung und Protokoll sehen den Punkt immer. Zusätzlich:</span>
          <div className="chips">{people.filter((p) => p.userId !== m.me.id).map((p) => { const on = f.viewerIds.includes(p.userId!); return <label key={p.id} className={`fchip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => setF({ ...f, viewerIds: on ? f.viewerIds.filter((x) => x !== p.userId) : [...f.viewerIds, p.userId!] })} />{p.name}</label>; })}</div></div>
      )}
      <ErrorNote error={error} />
      <div className="row"><button type="button" className="btn" onClick={() => setOpen(false)}>Abbrechen</button><button className="btn pri" disabled={busy}>Eintragen</button></div>
    </form>
  );
}

function Attendees({ m, act, busy }: { m: Meeting; act: Ctx['act']; busy: boolean }) {
  const [adding, setAdding] = useState<'' | 'person' | 'guest'>('');
  const [g, setG] = useState({ name: '', org: '', email: '' });
  const open = !['LOCKED', 'CANCELLED'].includes(m.status);
  const me = m.attendees.find((a) => a.userId === m.me.id);
  const count = (s: string[]) => m.attendees.filter((a) => s.includes(a.status)).length;
  return (
    <section className="card stack" aria-labelledby="at-h">
      <h2 id="at-h">Teilnehmende</h2>
      {['LIVE', 'REVIEW', 'LOCKED'].includes(m.status) && <p className="small muted">{count(['PRESENT', 'ONLINE'])} da · {count(['EXCUSED'])} entschuldigt · {count(['ABSENT'])} abwesend</p>}
      <ul className="plain stack-s">
        {m.attendees.map((a) => (
          <li key={a.id} className="row between wrap gap-s">
            <span>{a.name}{a.guest && <span className="chip xs">Gast</span>}{a.role && <span className="chip xs info">{ROLE[a.role]}</span>}{a.org && <span className="block xs muted">{a.org}</span>}</span>
            {m.me.minutes && open && m.status !== 'PLANNED' && m.status !== 'AGENDA_SET' ? (
              <select className="input sm" aria-label={`Anwesenheit ${a.name}`} value={a.status} onChange={(e) => act(`/meetings/${m.id}/attendees/${a.id}`, { status: e.target.value }, 'PATCH')}>
                {Object.entries(ATTENDANCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            ) : <span className={`chip ${a.status === 'PRESENT' || a.status === 'ONLINE' ? 'ok' : a.status === 'ABSENT' ? 'warn' : ''}`}>{ATTENDANCE[a.status]}</span>}
          </li>
        ))}
      </ul>
      {me && open && ['PLANNED', 'AGENDA_SET'].includes(m.status) && (
        <button className="btn sm noprint" disabled={busy} onClick={() => act(`/meetings/${m.id}/attendees/${me.id}`, { status: me.status === 'EXCUSED' ? 'INVITED' : 'EXCUSED' }, 'PATCH')}>{me.status === 'EXCUSED' ? 'Ich bin doch dabei' : 'Ich kann nicht (entschuldigen)'}</button>
      )}
      {m.me.minutes && open && (
        <div className="stack-s noprint">
          <div className="row wrap gap-s"><button className="btn sm" onClick={() => setAdding(adding === 'person' ? '' : 'person')}>+ Person</button><button className="btn sm" onClick={() => setAdding(adding === 'guest' ? '' : 'guest')}>+ Gast</button></div>
          {adding === 'person' && <PersonPicker value={null} onChange={(p) => { if (p) { act(`/meetings/${m.id}/attendees`, { userId: p.id }); setAdding(''); } }} />}
          {adding === 'guest' && (
            <form className="stack-s" onSubmit={async (e) => { e.preventDefault(); await act(`/meetings/${m.id}/attendees`, { name: g.name, org: g.org || null, email: g.email || null }); setG({ name: '', org: '', email: '' }); setAdding(''); }}>
              <input className="input sm" aria-label="Name" placeholder="Name" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} required minLength={2} />
              <input className="input sm" aria-label="Firma oder Funktion" placeholder="Firma / Funktion" value={g.org} onChange={(e) => setG({ ...g, org: e.target.value })} />
              <input className="input sm" type="email" aria-label="E-Mail (freiwillig)" placeholder="E-Mail (freiwillig)" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} />
              <button className="btn sm pri">Gast hinzufügen</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Addenda({ m, act, busy }: { m: Meeting; act: Ctx['act']; busy: boolean }) {
  const [v, setV] = useState('');
  if (!m.addenda.length && !m.me.minutes) return null;
  return (
    <section className="card stack-s" aria-labelledby="ad-h">
      <h2 id="ad-h">Nachträge</h2>
      <ul className="plain stack-s">{m.addenda.map((a) => <li key={a.id}><span className="xs muted">{dayTime(a.at)} · {a.author}</span><p className="pre">{a.text}</p></li>)}</ul>
      {m.me.minutes && (
        <form className="stack-s noprint" onSubmit={async (e) => { e.preventDefault(); await act(`/meetings/${m.id}/addenda`, { text: v }); setV(''); }}>
          <label htmlFor="ad-t" className="label">Nachtrag schreiben</label>
          <textarea id="ad-t" className="input area" rows={2} value={v} onChange={(e) => setV(e.target.value)} minLength={3} required />
          <div><button className="btn sm" disabled={busy}>Nachtrag speichern</button></div>
        </form>
      )}
    </section>
  );
}

/** Outlook-Einladung: Termin in Outlook mit allen Teilnehmenden vorausgefüllt – dort nur noch „Senden“ (ADR-061). */
function OutlookInvite({ id, highlight }: { id: string; highlight: boolean }) {
  const [info, setInfo] = useState<{ url: string; to: number; missing: string[] } | null>(null);
  useEffect(() => { api<typeof info>(`/meetings/${id}/outlook`).then(setInfo).catch(() => null); }, [id]);
  if (!info) return null;
  const body = (
    <>
      <div className="row wrap gap-s">
        <a className={`btn sm ${highlight ? 'pri' : ''}`} href={info.url} target="_blank" rel="noreferrer"><Icon name="send" size={16} />In Outlook einladen ({info.to})</a>
        <a className="btn sm" href={`/api/v1/meetings/${id}/ics`} download>Kalenderdatei für Outlook am PC</a>
      </div>
      {info.missing.length > 0 && <p className="xs muted">Ohne E-Mail-Adresse: {info.missing.join(', ')} – sie sehen den Termin im WIR und bekommen die Erinnerungen dort.</p>}
    </>
  );
  return highlight
    ? <div className="note info stack-s noprint"><strong>Meeting angelegt. Jetzt noch die Outlook-Einladung verschicken:</strong><span className="small">Outlook öffnet den Termin mit allen Teilnehmenden – du klickst nur noch auf „Senden“.</span>{body}</div>
    : <details className="noprint"><summary className="small">Outlook-Einladung</summary><div className="stack-s">{body}</div></details>;
}
