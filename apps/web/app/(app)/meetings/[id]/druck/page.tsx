'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Back, State, day, dayTime, useLoad } from '@/components/work';
import { ATTENDANCE, LINK_KIND, ROLE, when, type Meeting } from '@/lib/meetings';
import { TASK_STATUS } from '@/lib/labels';

/** Ergebnisprotokoll zum Drucken / als PDF. Fassung für Gäste: ohne vertrauliche Punkte und ohne interne Hinweise. */
function Print() {
  const { id } = useParams<{ id: string }>();
  const guests = useSearchParams().get('gaeste') === '1';
  const { data: m, error } = useLoad<Meeting>(`/meetings/${id}`);
  if (!m) return <State error={error} loading />;
  const items = m.items.filter((i) => !['MERGED', 'PARKED'].includes(i.status) && !(guests && i.confidential));
  const mails = m.attendees.filter((a) => a.guest && a.email).map((a) => a.email!);
  const subject = `Protokoll: ${m.title} vom ${day(m.startsAt)}`;
  return (
    <div className="stack-lg protocol">
      <div className="noprint stack-s">
        <Back href={`/meetings/${id}`} label="Zum Meeting" />
        <div className="row wrap">
          <button className="btn pri" onClick={() => window.print()}>Drucken / als PDF speichern</button>
          {guests && mails.length > 0 && <a className="btn" href={`mailto:${mails.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Guten Tag,\n\nanbei das Protokoll unseres Termins am ${day(m.startsAt)}.\n\nViele Grüße`)}`}>E-Mail an Gäste vorbereiten</a>}
        </div>
        {guests && <p className="small muted">Fassung für Gäste: ohne vertrauliche Punkte und ohne interne Verweise. Im Druckdialog „Als PDF speichern“ wählen und die Datei an die E-Mail hängen.</p>}
      </div>
      <header>
        <h1>{m.title}</h1>
        <p>{when(m.startsAt)} · {m.durationMin} Min.{m.location && ` · ${m.location}`}</p>
        {m.status === 'LOCKED' ? <p className="small">Festgeschrieben am {dayTime(m.lockedAt)} · Protokoll: {m.submittedBy} · bestätigt: {m.lockedBy}</p> : <p className="small"><strong>Entwurf – noch nicht festgeschrieben</strong></p>}
      </header>
      <section>
        <h2>Teilnehmende</h2>
        <p>{m.attendees.map((a) => `${a.name}${a.guest ? ` (Gast${a.org ? `, ${a.org}` : ''})` : ''}${a.role ? ` – ${ROLE[a.role]}` : ''}: ${ATTENDANCE[a.status]}`).join(' · ')}</p>
      </section>
      <section>
        <h2>Ergebnisse</h2>
        <ol className="stack">
          {items.map((i) => (
            <li key={i.id} className="stack-s">
              <strong>{i.title}</strong>{i.status === 'POSTPONED' && ' – vertagt'}
              {i.notes && <p className="pre">{i.notes}</p>}
              {i.decisions.map((d) => <p key={d.id}><strong>Entscheidung:</strong> {d.text}</p>)}
              {i.links.filter((l) => l.kind === 'TASK').map((l) => <p key={l.id}><strong>Aufgabe:</strong> {l.title} – {l.assignee}{l.dueAt && `, bis ${day(l.dueAt)}`} ({TASK_STATUS[l.status ?? '']})</p>)}
              {!guests && i.links.filter((l) => l.kind !== 'TASK').map((l) => <p key={l.id} className="small">{LINK_KIND[l.kind]}: {l.title}</p>)}
            </li>
          ))}
        </ol>
      </section>
      {m.addenda.length > 0 && (
        <section><h2>Nachträge</h2>{m.addenda.map((a) => <p key={a.id}><span className="small">{dayTime(a.at)}, {a.author}:</span> {a.text}</p>)}</section>
      )}
    </div>
  );
}

export default function Page() { return <Suspense><Print /></Suspense>; }
