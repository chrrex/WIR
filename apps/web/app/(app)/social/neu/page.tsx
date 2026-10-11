'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CATEGORIES } from '@/lib/social';
import { ImagePicker, PickedImage } from '@/components/content/ImagePicker';
import { Icon } from '@/components/Icon';

export default function NewSocial() {
  const router = useRouter();
  const [vis, setVis] = useState<Array<{ key: string; label: string }>>([]);
  const [f, setF] = useState({ title: '', text: '', category: 'GREETINGS', visibility: 'ALL', intent: 'OFFER', price: '' });
  const [images, setImages] = useState<PickedImage[]>([]);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Array<{ key: string; label: string }>>('/social/options').then(setVis).catch(() => null); }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const market = f.category === 'MARKETPLACE';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ id: string }>('/social', { method: 'POST', json: {
        title: f.title, text: f.text, category: f.category, visibility: f.visibility,
        intent: market ? f.intent : null, price: market && f.price ? f.price : null, images: images.map((i) => ({ fileId: i.fileId, altText: i.altText || null })),
      } });
      router.replace(`/social/${r.id}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Posten hat nicht geklappt.'); setBusy(false); }
  }

  return (
    <form className="stack-lg narrow-col" onSubmit={submit}>
      <Link href="/social" className="lnk back"><Icon name="back" size={16} />Social</Link>
      <h1>Neuer Beitrag</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="cat">Worum geht es?</label>
          <select id="cat" className="input" value={f.category} onChange={set('category')}>{Object.entries(CATEGORIES).filter(([k]) => k !== 'THANKS').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {market && (
          <div className="row wrap">
            <div className="seg" role="group" aria-label="Biete oder Suche">
              {(['OFFER', 'SEARCH'] as const).map((i) => <button type="button" key={i} aria-pressed={f.intent === i} onClick={() => setF({ ...f, intent: i })}>{i === 'OFFER' ? 'Biete' : 'Suche'}</button>)}
            </div>
            <div className="field grow"><label htmlFor="price" className="sr">Preis</label><input id="price" className="input" placeholder="Preis, z. B. 80 € oder „zu verschenken“" value={f.price} onChange={set('price')} maxLength={60} /></div>
          </div>
        )}
        <div className="field"><label htmlFor="title">Überschrift</label><input id="title" className="input" value={f.title} onChange={set('title')} maxLength={120} required /></div>
        <div className="field"><label htmlFor="text">Text (optional)</label><textarea id="text" className="input area" rows={5} value={f.text} onChange={set('text')} /></div>
        <ImagePicker value={images} onChange={setImages} />
        <div className="field"><label htmlFor="vis">Wer soll es sehen?</label>
          <select id="vis" className="input" value={f.visibility} onChange={set('visibility')}>{vis.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select></div>
        {market && <p className="small muted">Angebote enden automatisch nach 30 Tagen. Interessierte melden sich per Chat bei dir.</p>}
      </section>
      <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />Ich halte mich an die Nutzungsregeln: freundlich, nichts Vertrauliches aus dem Betrieb, keine Fotos von Gästen.</label>
      {error && <div className="note warn" role="alert">{error}</div>}
      <div className="row"><Link className="btn" href="/social">Abbrechen</Link><button className="btn pri big" disabled={busy || !f.title || !agree}>{busy ? 'Poste …' : 'Posten'}</button></div>
    </form>
  );
}
