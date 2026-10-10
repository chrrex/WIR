'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { ImagePicker, PickedImage } from '@/components/content/ImagePicker';
import { Icon } from '@/components/Icon';

interface Options { audiences: Array<{ key: string; label: string; wide: boolean }>; canImportant: boolean; canPin: boolean }

export default function NewNews() {
  const router = useRouter();
  const [o, setO] = useState<Options | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [important, setImportant] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [images, setImages] = useState<PickedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Options>('/news/options').then((r) => { setO(r); if (r.audiences.length === 1) setTargets([r.audiences[0].key]); }).catch((e) => setError(e.message)); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/news', { method: 'POST', json: { title, text, targets, important, pinned, images: images.map((i) => ({ fileId: i.fileId, altText: i.altText || null })) } });
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
      </section>
      <section className="card stack">
        <h2>An wen?</h2>
        {!o ? <p className="muted">Lade …</p> : (
          <div className="chips">
            {o.audiences.map((a) => {
              const on = targets.includes(a.key);
              return (
                <label key={a.key} className={`fchip ${on ? 'on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => setTargets(on ? targets.filter((t) => t !== a.key) : [...targets, a.key])} />{a.label}
                </label>
              );
            })}
          </div>
        )}
        {o && !o.audiences.some((a) => a.wide) && <p className="small muted">Mitteilungen an das ganze Haus schreiben Abteilungsleitungen und Direktion.</p>}
      </section>
      {o && (o.canImportant || o.canPin) && (
        <section className="card stack">
          <h2>Optionen</h2>
          {o.canImportant && <label className="check"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Als <strong>wichtig</strong> markieren – alle Empfänger:innen werden benachrichtigt</label>}
          {o.canPin && <label className="check"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />Oben anheften</label>}
        </section>
      )}
      {error && <div className="note warn" role="alert">{error}</div>}
      <div className="row"><Link className="btn" href="/news">Abbrechen</Link><button className="btn pri big" disabled={busy || !title || !text || !targets.length}>{busy ? 'Veröffentliche …' : 'Veröffentlichen'}</button></div>
    </form>
  );
}
