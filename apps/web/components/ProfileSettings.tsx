'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ErrorNote, day, useSubmit } from '@/components/work';

interface Profile { email: string | null; phoneWork: string | null; phoneMobile: string | null; aboutMe: string | null; hasProfile: boolean;
  absences: Array<{ id: string; label: string; from: string; until: string; note: string | null }> }
const TYPES = [['VACATION', 'Urlaub'], ['BUSINESS_TRIP', 'Dienstreise'], ['TRAINING', 'Fortbildung'], ['ABSENT', 'Abwesend (ohne Grund)']];

/** Eigenes Profil: dienstliche Kontaktdaten und Abwesenheiten (ADR-046). */
export function ProfileSettings() {
  const [p, setP] = useState<Profile | null>(null);
  const [f, setF] = useState({ email: '', phoneWork: '', phoneMobile: '', aboutMe: '' });
  const [a, setA] = useState({ type: 'VACATION', startsOn: '', endsOn: '', note: '' });
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useSubmit();
  const load = (x: Profile) => { setP(x); setF({ email: x.email ?? '', phoneWork: x.phoneWork ?? '', phoneMobile: x.phoneMobile ?? '', aboutMe: x.aboutMe ?? '' }); };
  useEffect(() => { api<Profile>('/people/me/profile').then(load).catch(() => null); }, []);
  if (!p?.hasProfile) return null;
  return (
    <>
      <section className="card stack">
        <h2>Mein Profil</h2>
        <p className="small muted">Das sehen deine Kolleg:innen unter „Team“. Alles freiwillig – bitte nur dienstliche Angaben.</p>
        <form className="stack-s" onSubmit={async (e) => { e.preventDefault(); const x = await run(() => api<Profile>('/people/me/profile', { method: 'PUT', json: f })); if (x) { load(x); setSaved(true); setTimeout(() => setSaved(false), 2500); } }}>
          <div className="grid">
            <div className="field"><label htmlFor="pe">E-Mail (dienstlich)</label><input id="pe" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="pw">Durchwahl</label><input id="pw" className="input" inputMode="tel" value={f.phoneWork} onChange={(e) => setF({ ...f, phoneWork: e.target.value })} /></div>
            <div className="field"><label htmlFor="pm">Handy (dienstlich)</label><input id="pm" className="input" inputMode="tel" value={f.phoneMobile} onChange={(e) => setF({ ...f, phoneMobile: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="pa">Über mich (freiwillig)</label><input id="pa" className="input" maxLength={500} value={f.aboutMe} onChange={(e) => setF({ ...f, aboutMe: e.target.value })} placeholder="z. B. Ansprechpartnerin für Hochzeiten" /></div>
          <div className="row"><button className="btn pri" disabled={busy}>Speichern</button>{saved && <span className="small" role="status">Gespeichert</span>}</div>
        </form>
      </section>
      <section className="card stack">
        <h2>Abwesenheit</h2>
        <p className="small muted">Wer dich anschreibt oder dir eine Übergabe schickt, sieht das – auch im Team. Bitte keine Gründe wie Krankheit eintragen.</p>
        {p.absences.length > 0 && (
          <ul className="plain stack-s">
            {p.absences.map((x) => (
              <li key={x.id} className="row between wrap">
                <span>{day(x.from)} – {day(x.until)} · {x.label}{x.note && <span className="muted"> · {x.note}</span>}</span>
                <button className="btn sm" disabled={busy} onClick={() => run(() => api<Profile>(`/people/me/absences/${x.id}`, { method: 'DELETE' })).then((r) => r && load(r))}>Löschen</button>
              </li>
            ))}
          </ul>
        )}
        <form className="stack-s" onSubmit={async (e) => { e.preventDefault(); const x = await run(() => api<Profile>('/people/me/absences', { method: 'POST', json: { ...a, note: a.note || null } })); if (x) { load(x); setA({ ...a, startsOn: '', endsOn: '', note: '' }); } }}>
          <div className="row wrap">
            <div className="field"><label htmlFor="at">Art</label><select id="at" className="input" value={a.type} onChange={(e) => setA({ ...a, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="af">Von</label><input id="af" type="date" className="input" value={a.startsOn} onChange={(e) => setA({ ...a, startsOn: e.target.value, endsOn: a.endsOn || e.target.value })} required /></div>
            <div className="field"><label htmlFor="au">Bis</label><input id="au" type="date" className="input" value={a.endsOn} min={a.startsOn} onChange={(e) => setA({ ...a, endsOn: e.target.value })} required /></div>
          </div>
          <div className="field"><label htmlFor="an">Vertretung / Hinweis (freiwillig)</label><input id="an" className="input" maxLength={140} value={a.note} onChange={(e) => setA({ ...a, note: e.target.value })} placeholder="z. B. Vertretung: Selin A." /></div>
          <div><button className="btn" disabled={busy || !a.startsOn || !a.endsOn}>Abwesenheit eintragen</button></div>
        </form>
        <ErrorNote error={error} />
      </section>
    </>
  );
}
