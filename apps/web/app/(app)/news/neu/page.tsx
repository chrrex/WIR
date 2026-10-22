'use client';

import { Suspense, useEffect, useState } from 'react';
import { useFromMeeting } from '@/lib/meetings';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ImagePicker, PickedImage } from '@/components/content/ImagePicker';
import { Icon } from '@/components/Icon';
import { Audience } from '@/components/work';
import { iso, PollDraft, PollEditor, pollJson, ScheduleField } from '@/components/content/Extras';

interface Options { audiences: Array<{ key: string; label: string; wide: boolean }>; canImportant: boolean; canPin: boolean }

export default function Page() { return <Suspense><NewNews /></Suspense>; }

function NewNews() {
  const router = useRouter();
  const meeting = useFromMeeting();
  const [o, setO] = useState<Options | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [title, setTitle] = useState(meeting.title);
  const [text, setText] = useState(meeting.text);
  const [important, setImportant] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [poll, setPoll] = useState<PollDraft | null>(null);
  const [at, setAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Options>('/news/options').then((r) => { setO(r); if (r.audiences.length === 1) setTargets([r.audiences[0].key]); }).catch((e) => setError(e.message)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/news', { method: 'POST', json: { title, text, targets, important, pinned, images: images.map((i) => ({ fileId: i.fileId, altText: i.altText || null })), poll: pollJson(poll), publishAt: iso(at) } });
      await meeting.link({ contentItemId: r.id });
      router.replace(`/news/${r.id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Veröffentlichen hat nicht geklappt.'); setBusy(false); }
  }

  return (
    <form className="stack-lg narrow-col" onSubmit={submit}>
      <Link href="/news" className="lnk back"><Icon name="back" size={16} />Alle News</Link>
      <h1>Neue Mitteilung</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="t">Titel</label><input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required /></div>
        <div className="field"><label htmlFor="x">Text</label><textarea id="x" className="input area" rows={8} value={text} onChange={(e) => setText(e.target.value)} required />
          <span className="small muted">Leerzeile = neuer Absatz.</span></div>
        <ImagePicker value={images} onChange={setImages} />
        <PollEditor value={poll} onChange={setPoll} />
      </section>
      <section className="card stack">
        {!o ? <p className="muted">Lade …</p> : <Audience options={o.audiences} value={targets} onChange={setTargets} />}
        {o && !o.audiences.some((a) => a.wide) && <p className="small muted">Mitteilungen an die ganze Gesellschaft schreiben Abteilungs- und Geschäftsleitungen.</p>}
      </section>
      {o && (
        <section className="card stack">
          <h2>Optionen</h2>
          <ScheduleField value={at} onChange={setAt} />
          {o.canImportant && <label className="check"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Als <strong>wichtig</strong> markieren – alle Empfänger:innen werden benachrichtigt</label>}
          {o.canPin && <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />Oben anheften</label>}
        </section>
      )}
      {error && <div className="note warn" role="alert">{error}</div>}
      <div className="row"><Link className="btn" href="/news">Abbrechen</Link><button className="btn pri big" disabled={busy || !title || !text || !targets.length}>{busy ? 'Speichere …' : at ? 'Planen' : 'Veröffentlichen'}</button></div>
    </form>
  );
}
