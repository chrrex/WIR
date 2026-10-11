'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '../Icon';

// ---- Abstimmung (ADR-050) ----------------------------------------------------

export interface PollDraft { question: string; options: string[]; multiple: boolean; closesAt: string }
export interface Poll { question: string; multiple: boolean; closesAt: string | null; closed: boolean; voters: number; voted: boolean; options: Array<{ id: string; label: string; count: number; mine: boolean; names: string[] }> }

/** datetime-local → ISO mit Zeitzone (oder null) */
export const iso = (local: string) => (local ? new Date(local).toISOString() : null);
export const pollJson = (p: PollDraft | null) => (p ? { question: p.question, options: p.options.map((o) => o.trim()).filter(Boolean), multiple: p.multiple, closesAt: iso(p.closesAt) } : null);

/** Abstimmung beim Schreiben anhängen: Frage, 2–10 Antworten, optional mehrere Antworten und Ende. */
export function PollEditor({ value, onChange }: { value: PollDraft | null; onChange: (p: PollDraft | null) => void }) {
  if (!value) return <button type="button" className="btn sm" onClick={() => onChange({ question: '', options: ['', ''], multiple: false, closesAt: '' })}><Icon name="poll" size={16} />Abstimmung hinzufügen</button>;
  const set = (p: Partial<PollDraft>) => onChange({ ...value, ...p });
  return (
    <fieldset className="stack-s poll-edit">
      <legend className="label">Abstimmung</legend>
      <div className="field"><label htmlFor="pq">Frage</label><input id="pq" className="input" maxLength={200} value={value.question} onChange={(e) => set({ question: e.target.value })} required placeholder="z. B. Welcher Termin passt euch?" /></div>
      {value.options.map((o, i) => (
        <div className="row" key={i}>
          <label className="sr" htmlFor={`po${i}`}>Antwort {i + 1}</label>
          <input id={`po${i}`} className="input grow" maxLength={100} value={o} placeholder={`Antwort ${i + 1}`} required={i < 2} onChange={(e) => set({ options: value.options.map((x, j) => (j === i ? e.target.value : x)) })} />
          {value.options.length > 2 && <button type="button" className="iconbtn" aria-label={`Antwort ${i + 1} entfernen`} onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button>}
        </div>
      ))}
      <div className="row wrap">
        {value.options.length < 10 && <button type="button" className="btn sm" onClick={() => set({ options: [...value.options, ''] })}><Icon name="plus" size={16} />Antwort</button>}
        <label className="check"><input type="checkbox" checked={value.multiple} onChange={(e) => set({ multiple: e.target.checked })} />Mehrere Antworten erlaubt</label>
      </div>
      <div className="field"><label htmlFor="pc">Endet am (optional)</label><input id="pc" type="datetime-local" className="input" value={value.closesAt} onChange={(e) => set({ closesAt: e.target.value })} /></div>
      <p className="small muted">Nicht anonym: Alle Empfänger:innen sehen, wer wofür gestimmt hat. Für anonyme Fragen gibt es die Umfragen.</p>
      <button type="button" className="btn sm" onClick={() => onChange(null)}>Abstimmung entfernen</button>
    </fieldset>
  );
}

/** Abstimmung lesen und abstimmen: Antwort wählen, Ergebnis mit Balken; Ändern jederzeit bis zum Ende. */
export function PollView({ contentId, initial }: { contentId: string; initial: Poll }) {
  const [p, setP] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>(initial.options.filter((o) => o.mine).map((o) => o.id));
  const [edit, setEdit] = useState(!initial.voted && !initial.closed);
  const send = (ids: string[]) => api<Poll>(`/content/${contentId}/poll`, { method: 'POST', json: { optionIds: ids } })
    .then((r) => { setP(r); setPick(r.options.filter((o) => o.mine).map((o) => o.id)); setEdit(false); setError(null); })
    .catch((e) => setError(e instanceof ApiError ? e.message : 'Abstimmen hat nicht geklappt.'));
  const max = Math.max(1, ...p.options.map((o) => o.count));
  return (
    <section className="card poll stack-s" aria-labelledby={`poll-${contentId}`}>
      <h2 id={`poll-${contentId}`} className="h-sub"><Icon name="poll" size={18} /> {p.question}</h2>
      {edit ? (
        <form className="stack-s" onSubmit={(e) => { e.preventDefault(); void send(pick); }}>
          <fieldset className="stack-s"><legend className="sr">{p.question}</legend>
            {p.options.map((o) => (
              <label key={o.id} className="check">
                <input type={p.multiple ? 'checkbox' : 'radio'} name={`poll-${contentId}`} checked={pick.includes(o.id)}
                  onChange={(e) => setPick(p.multiple ? (e.target.checked ? [...pick, o.id] : pick.filter((x) => x !== o.id)) : [o.id])} />{o.label}
              </label>
            ))}
          </fieldset>
          <div className="row"><button className="btn pri sm" disabled={!pick.length}>Abstimmen</button>{p.voted && <button type="button" className="btn sm" onClick={() => setEdit(false)}>Abbrechen</button>}</div>
        </form>
      ) : (
        <ul className="plain stack-s">
          {p.options.map((o) => (
            <li key={o.id}>
              <div className="row"><span className="grow">{o.mine && <strong aria-label="deine Wahl">✓ </strong>}{o.label}</span><span className="small muted">{o.count}</span></div>
              <div className="bar" aria-hidden="true"><span style={{ width: `${(o.count / max) * 100}%` }} /></div>
              {o.names.length > 0 && <span className="xs muted">{o.names.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="row wrap small muted">
        <span>{p.voters} {p.voters === 1 ? 'Stimme' : 'Stimmen'}{p.multiple ? ' · mehrere Antworten möglich' : ''}{p.closesAt ? ` · ${p.closed ? 'beendet' : 'endet'} ${new Date(p.closesAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
        {!edit && !p.closed && <button className="btn sm" onClick={() => setEdit(true)}>{p.voted ? 'Stimme ändern' : 'Abstimmen'}</button>}
        {!edit && !p.closed && p.voted && <button className="btn sm" onClick={() => send([])}>Stimme zurückziehen</button>}
      </div>
      {error && <div className="note warn small" role="alert">{error}</div>}
    </section>
  );
}

// ---- Planen (ADR-050) -------------------------------------------------------

/** Später veröffentlichen: leer = sofort. */
export function ScheduleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [on, setOn] = useState(!!value);
  return (
    <div className="stack-s">
      <label className="check"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); if (!e.target.checked) onChange(''); }} />Später veröffentlichen</label>
      {on && <div className="field"><label htmlFor="pat">Veröffentlichen am</label><input id="pat" type="datetime-local" className="input" required value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="small muted">Erscheint spätestens 5 Minuten nach dem Zeitpunkt – mit Benachrichtigung. Bis dahin siehst nur du den Beitrag.</span></div>}
    </div>
  );
}

export const scheduledText = (at: string) => `geplant für ${new Date(at).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

// ---- Lesezeichen (ADR-050) ----------------------------------------------------

export function BookmarkButton({ contentId }: { contentId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { api<{ bookmarked: boolean }>(`/content/${contentId}/bookmark`).then((r) => setOn(r.bookmarked)).catch(() => null); }, [contentId]);
  if (on === null) return null;
  return (
    <button className={`btn sm ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => api<{ bookmarked: boolean }>(`/content/${contentId}/bookmark`, { method: 'POST' }).then((r) => setOn(r.bookmarked)).catch(() => null)}>
      <Icon name="bookmark" size={16} />{on ? 'Gemerkt' : 'Merken'}
    </button>
  );
}
