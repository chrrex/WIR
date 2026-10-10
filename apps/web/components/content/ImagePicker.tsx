'use client';
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import { Icon } from '../Icon';

export interface PickedImage { fileId: string; altText: string }

/** Fotos hochladen. Der Server entfernt Ortsdaten und andere Metadaten. */
export function ImagePicker({ value, onChange, max = 6 }: { value: PickedImage[]; onChange: (v: PickedImage[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError(null);
    const next = [...value];
    for (const f of Array.from(files).slice(0, max - value.length)) {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/v1/files', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.message ?? 'Das Foto konnte nicht hochgeladen werden.'); continue; }
      next.push({ fileId: data.id, altText: '' });
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="stack-s">
      {value.length > 0 && (
        <div className="picked">
          {value.map((v, i) => (
            <div key={v.fileId} className="picked-item">
              <img src={`/api/v1/files/${v.fileId}`} alt="" />
              <label className="sr" htmlFor={`alt-${v.fileId}`}>Bildbeschreibung</label>
              <input id={`alt-${v.fileId}`} className="input sm" placeholder="Was ist zu sehen? (für Screenreader)" value={v.altText}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, altText: e.target.value } : x)))} />
              <button type="button" className="iconbtn sm" aria-label="Foto entfernen" onClick={() => onChange(value.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {value.length < max && (
        <label className="btn photo-btn">
          <Icon name="camera" size={18} />{busy ? 'Lade hoch …' : 'Foto hinzufügen'}
          <input ref={input} type="file" accept="image/*" multiple className="sr" onChange={(e) => upload(e.target.files)} disabled={busy} />
        </label>
      )}
      {error && <div className="note warn small" role="alert">{error}</div>}
      <p className="small muted">Ortsdaten und andere Infos aus dem Foto werden beim Hochladen automatisch entfernt.</p>
    </div>
  );
}
