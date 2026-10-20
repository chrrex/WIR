'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useFromMeeting } from '@/lib/meetings';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ImagePicker, PickedImage } from '@/components/content/ImagePicker';
import { MentionText, Person } from '@/components/content/MentionText';
import { Icon } from '@/components/Icon';
import { Audience, AudienceOption } from '@/components/work';
import { Absent, absentText } from '@/components/Absent';
import { iso, PollDraft, PollEditor, pollJson, ScheduleField } from '@/components/content/Extras';

function defaultShift() {
  const h = new Date().getHours();
  return h >= 5 && h < 13 ? 'Früh' : h >= 13 && h < 21 ? 'Spät' : 'Nacht';
}

export default function Page() { return <Suspense><NewHandover /></Suspense>; }

function NewHandover() {
  const router = useRouter();
  const meeting = useFromMeeting();
  const [opts, setOpts] = useState<{ audiences: AudienceOption[]; defaults: string[]; shifts: string[] } | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [away, setAway] = useState<Array<Absent & { id: string; name: string }>>([]);
  useEffect(() => { if (!targets.length) { setAway([]); return; } api<typeof away>('/people/absent', { method: 'POST', json: { targets } }).then(setAway).catch(() => setAway([])); }, [targets]);
  const [shift, setShift] = useState(defaultShift());
  const [subject, setSubject] = useState(meeting.title.slice(0, 140));
  const [text, setText] = useState(meeting.text);
  const [mentions, setMentions] = useState<Person[]>([]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [at, setAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<NonNullable<typeof opts>>('/handovers/options').then((o) => { setOpts(o); setTargets(o.defaults); }).catch((e) => setError(e.message)); }, []);
  const source = useCallback((q: string) => `/people?q=${encodeURIComponent(q)}`, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/handovers', { method: 'POST', json: { targets, shiftLabel: shift, subject, text, mentionIds: mentions.map((m) => m.id), images: images.map((i) => ({ fileId: i.fileId, altText: i.altText || null })), poll: pollJson(poll), publishAt: iso(at) } });
      await meeting.link({ contentItemId: r.id });
      router.replace(`/uebergaben/${r.id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Speichern hat nicht geklappt.'); setBusy(false); }
  }

  return (
    <form className="stack-lg narrow-col" onSubmit={submit}>
      <Link href="/uebergaben" className="lnk back"><Icon name="back" size={16} />Übergaben</Link>
      <h1>Übergabe schreiben</h1>
      <section className="card stack">
        <div className="field"><span className="label">Schicht</span>
          <div className="seg" role="group" aria-label="Schicht">{(opts?.shifts ?? ['Früh', 'Spät', 'Nacht']).map((s) => <button type="button" key={s} aria-pressed={shift === s} onClick={() => setShift(s)}>{s}</button>)}</div></div>
        <div className="field"><label htmlFor="s">Worum geht es?</label><input id="s" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} required placeholder="z. B. Zwei offene Punkte für die Frühschicht" /></div>
        <div className="field"><span className="label">Was die nächste Schicht wissen muss</span>
          <MentionText id="txt" label="Übergabe-Text" value={text} onChange={setText} mentions={mentions} onMentions={setMentions} source={source} rows={7}
            placeholder="Mit @ erwähnst du Kolleg:innen – auch aus anderen Teams. Sie bekommen die Übergabe dann ebenfalls." /></div>
        <ImagePicker value={images} onChange={setImages} />
        <PollEditor value={poll} onChange={setPoll} />
      </section>
      <section className="card stack">
        {opts ? <Audience options={opts.audiences} value={targets} onChange={setTargets} persons /> : <p className="muted">Lade …</p>}
        {away.length > 0 && <div className="note warn small" role="status"><strong>Gerade abwesend:</strong> {away.map((a) => `${a.name} (${absentText(a)})`).join(' · ')}</div>}
        <p className="small muted">Frei kombinierbar: Gruppen, einzelne Kolleg:innen oder beides. Mit @ im Text Erwähnte bekommen die Übergabe zusätzlich.</p>
      </section>
      <section className="card stack"><ScheduleField value={at} onChange={setAt} /></section>
      {error && <div className="note warn" role="alert">{error}</div>}
      <div className="row"><Link className="btn" href="/uebergaben">Abbrechen</Link><button className="btn pri big" disabled={busy || !subject || !text || !targets.length}>{busy ? 'Speichere …' : at ? 'Übergabe planen' : 'Übergabe speichern'}</button></div>
    </form>
  );
}
