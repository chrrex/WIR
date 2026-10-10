'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ImagePicker, PickedImage } from '@/components/content/ImagePicker';
import { MentionText, Person } from '@/components/content/MentionText';
import { Icon } from '@/components/Icon';

function defaultShift() {
  const h = new Date().getHours();
  return h >= 5 && h < 13 ? 'Früh' : h >= 13 && h < 21 ? 'Spät' : 'Nacht';
}

export default function NewHandover() {
  const router = useRouter();
  const [opts, setOpts] = useState<{ groups: Array<{ id: string; name: string }>; shifts: string[] } | null>(null);
  const [groupId, setGroupId] = useState('');
  const [shift, setShift] = useState(defaultShift());
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Person[]>([]);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ groups: Array<{ id: string; name: string }>; shifts: string[] }>('/handovers/options').then((o) => { setOpts(o); if (o.groups[0]) setGroupId(o.groups[0].id); }).catch((e) => setError(e.message)); }, []);
  const source = useCallback((q: string) => `/people?q=${encodeURIComponent(q)}`, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/handovers', { method: 'POST', json: { groupId, shiftLabel: shift, subject, text, mentionIds: mentions.map((m) => m.id), images: images.map((i) => ({ fileId: i.fileId, altText: i.altText || null })) } });
      router.replace(`/uebergaben/${r.id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Speichern hat nicht geklappt.'); setBusy(false); }
  }

  return (
    <form className="stack-lg narrow-col" onSubmit={submit}>
      <Link href="/uebergaben" className="lnk back"><Icon name="back" size={16} />Übergaben</Link>
      <h1>Übergabe schreiben</h1>
      <section className="card stack">
        {opts && opts.groups.length > 1 && (
          <div className="field"><label htmlFor="g">Team</label>
            <select id="g" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>{opts.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        )}
        {opts && opts.groups.length === 1 && <p className="muted">Für das Team <strong className="fg">{opts.groups[0].name}</strong></p>}
        <div className="field"><span className="label">Schicht</span>
          <div className="seg" role="group" aria-label="Schicht">{(opts?.shifts ?? ['Früh', 'Spät', 'Nacht']).map((s) => <button type="button" key={s} aria-pressed={shift === s} onClick={() => setShift(s)}>{s}</button>)}</div></div>
        <div className="field"><label htmlFor="s">Worum geht es?</label><input id="s" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={140} required placeholder="z. B. Zwei offene Punkte für die Frühschicht" /></div>
        <div className="field"><span className="label">Was die nächste Schicht wissen muss</span>
          <MentionText id="txt" label="Übergabe-Text" value={text} onChange={setText} mentions={mentions} onMentions={setMentions} source={source} rows={7}
            placeholder="Mit @ erwähnst du Kolleg:innen – auch aus anderen Teams. Sie bekommen die Übergabe dann ebenfalls." /></div>
        <ImagePicker value={images} onChange={setImages} />
      </section>
      {error && <div className="note warn" role="alert">{error}</div>}
      <div className="row"><Link className="btn" href="/uebergaben">Abbrechen</Link><button className="btn pri big" disabled={busy || !subject || !text || !groupId}>{busy ? 'Speichere …' : 'Übergabe speichern'}</button></div>
    </form>
  );
}
