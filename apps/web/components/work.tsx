'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Icon } from '@/components/Icon';

/** Daten laden mit Fehlertext und Neu-Laden. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    api<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e instanceof ApiError ? e.message : 'Laden hat nicht geklappt.'));
  }, [path]);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}

/** Lade-, Fehler- und Leer-Zustände einheitlich. */
export function State({ error, loading, back }: { error?: string | null; loading?: boolean; back?: [string, string] }) {
  if (error) return <div className="card narrow stack"><h1>Nicht verfügbar</h1><p className="muted">{error}</p>{back && <Link className="btn" href={back[0]}>{back[1]}</Link>}</div>;
  if (loading) return <div className="loading">Lade …</div>;
  return null;
}

export function Back({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="lnk back"><Icon name="back" size={16} />{label}</Link>;
}

export interface AudienceOption { key: string; label: string; wide: boolean }

/**
 * Empfänger-Auswahl, gegliedert nach Alle · Gesellschaften · Gruppen · Personen. Frei kombinierbar.
 * Was die Person wählen darf, bestimmt der Server (Optionen + Prüfung beim Speichern).
 */
export function Audience({ options, value, onChange, persons = false }: { options: AudienceOption[]; value: string[]; onChange: (v: string[]) => void; persons?: boolean }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const toggle = (k: string) => onChange(value.includes(k) ? value.filter((t) => t !== k) : [...value, k]);
  const chip = (a: { key: string; label: string }) => {
    const on = value.includes(a.key);
    return <label key={a.key} className={`fchip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => toggle(a.key)} />{a.label}</label>;
  };
  const wide = options.filter((o) => o.key === 'ALL' || o.key.startsWith('C:'));
  const groups = options.filter((o) => o.key.startsWith('G:') && o.label.toLowerCase().includes(filter.toLowerCase()));
  const people = value.filter((k) => k.startsWith('U:'));
  return (
    <fieldset className="stack plain">
      <legend className="label">Für wen?</legend>
      {wide.length > 0 && <div className="stack-s"><span className="xs muted">Alle & Gesellschaften</span><div className="chips">{wide.map(chip)}</div></div>}
      <div className="stack-s">
        <span className="xs muted">Gruppen</span>
        {options.filter((o) => o.key.startsWith('G:')).length > 8 && <input className="input sm" aria-label="Gruppen filtern" placeholder="Gruppe suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} />}
        <div className="chips">{groups.map(chip)}</div>
      </div>
      {persons && (
        <div className="stack-s">
          <span className="xs muted">Einzelne Personen</span>
          {people.length > 0 && <div className="chips">{people.map((k) => <button type="button" key={k} className="fchip on" aria-label={`${names[k] ?? 'Person'} entfernen`} onClick={() => toggle(k)}>{names[k] ?? 'Person'} ✕</button>)}</div>}
          <PersonPicker value={null} onChange={(p) => { if (p && !value.includes(`U:${p.id}`)) { setNames({ ...names, [`U:${p.id}`]: p.name }); onChange([...value, `U:${p.id}`]); } }} />
        </div>
      )}
      {value.length === 0 && <p className="small muted">Noch niemand ausgewählt.</p>}
    </fieldset>
  );
}

/** Datei hochladen (Bild: /files, Dokument: /files/document). */
export async function upload(file: File, kind: 'image' | 'document' = 'document') {
  const fd = new FormData();
  fd.append('file', file);
  return api<{ id: string; size: number }>(kind === 'image' ? '/files' : '/files/document', { method: 'POST', body: fd });
}

export const day = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(new Date(iso)) : '');
export const dayTime = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(iso)) : '');
export const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

/** Formular-Absenden mit Busy- und Fehlerzustand. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Das hat nicht geklappt.'); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run, setError };
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="note warn" role="alert">{error}</div> : null;
}

/** Eine Person suchen und auswählen (Name, Tätigkeit). */
export function PersonPicker({ value, onChange }: { value: { id: string; name: string } | null; onChange: (p: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Array<{ id: string; name: string; job: string | null }>>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api<typeof hits>(`/people?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return <div className="row"><span className="chip info">{value.name}</span><button type="button" className="btn sm" onClick={() => onChange(null)}>Ändern</button></div>;
  return (
    <div className="stack-s">
      <label htmlFor="pp" className="label">Person</label>
      <input id="pp" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name eingeben …" autoComplete="off" />
      {hits.length > 0 && <ul className="plain chips">{hits.map((h) => <li key={h.id}><button type="button" className="fchip" onClick={() => onChange(h)}>{h.name}{h.job && <span className="xs muted"> · {h.job}</span>}</button></li>)}</ul>}
    </div>
  );
}
