'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Back, ErrorNote, PersonPicker, State, useLoad, useSubmit } from '@/components/work';

type P = { id: string; name: string };
const nextTuesday = () => { const d = new Date(); d.setDate(d.getDate() + ((9 - d.getDay()) % 7 || 7)); d.setHours(14, 0, 0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

/** Neues Meeting – einmalig oder wöchentlich, mit Team, einzelnen Personen und Gästen ohne Zugang. */
export default function NewMeeting() {
  const router = useRouter();
  const { data: o, error: loadError } = useLoad<{ groups: P[]; template: string[] }>('/meetings/options');
  const [f, setF] = useState({ title: '', startsAt: nextTuesday(), durationMin: 45, location: '', onlineUrl: '', groupId: '', repeat: 'WEEKLY', retentionYears: 3, agendaLeadHours: 26 });
  const [outlook, setOutlook] = useState(true);
  const [people, setPeople] = useState<P[]>([]);
  const [guests, setGuests] = useState<Array<{ name: string; org: string; email: string }>>([]);
  const [std, setStd] = useState<string[] | null>(null);
  const [minutes, setMinutes] = useState<P | null>(null);
  const [timekeeper, setTimekeeper] = useState<P | null>(null);
  const { busy, error, run } = useSubmit();
  if (!o) return <State error={loadError} loading />;
  const items = std ?? o.template;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: typeof f[k] === 'number' ? Number(e.target.value) : e.target.value });
  return (
    <form className="stack-lg narrow-col wide" onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => api<{ id: string }>('/meetings', { method: 'POST', json: { ...f, startsAt: new Date(f.startsAt).toISOString(), groupId: f.groupId || null, location: f.location || null, onlineUrl: f.onlineUrl || null,
        userIds: people.map((p) => p.id), guests: guests.filter((g) => g.name.trim()), standardItems: items, minutesId: minutes?.id ?? null, timekeeperId: timekeeper?.id ?? null } }));
      if (r) router.push(`/meetings/${r.id}${outlook ? '?outlook=1' : ''}`);
    }}>
      <Back href="/meetings" label="Meetings" />
      <h1>Neues Meeting</h1>
      <section className="card stack">
        <div className="field"><label htmlFor="mt">Titel</label><input id="mt" className="input" value={f.title} onChange={set('title')} placeholder="z. B. Teammeeting Rezeption" required minLength={3} maxLength={120} /></div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="ms">Beginn</label><input id="ms" type="datetime-local" className="input" value={f.startsAt} onChange={set('startsAt')} required /></div>
          <div className="field"><label htmlFor="md">Dauer (Min.)</label><input id="md" type="number" min={10} max={480} step={5} className="input" value={f.durationMin} onChange={set('durationMin')} /></div>
          <div className="field grow"><label htmlFor="mr">Wiederholen</label><select id="mr" className="input" value={f.repeat} onChange={set('repeat')}><option value="WEEKLY">Jede Woche</option><option value="NONE">Einmalig</option></select></div>
        </div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="ml">Raum (freiwillig)</label><input id="ml" className="input" value={f.location} onChange={set('location')} maxLength={120} /></div>
          <div className="field grow"><label htmlFor="mu">Teams-Link (freiwillig)</label><input id="mu" type="url" className="input" value={f.onlineUrl} onChange={set('onlineUrl')} placeholder="https://…" /></div>
        </div>
      </section>

      <section className="card stack">
        <h2>Wer ist dabei?</h2>
        <div className="field"><label htmlFor="mg">Team</label>
          <select id="mg" className="input" value={f.groupId} onChange={set('groupId')}><option value="">Kein ganzes Team</option>{o.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <div className="stack-s">
          <span className="label">Einzelne Personen</span>
          {people.length > 0 && <div className="chips">{people.map((p) => <button type="button" key={p.id} className="fchip on" aria-label={`${p.name} entfernen`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))}>{p.name} ✕</button>)}</div>}
          <PersonPicker value={null} onChange={(p) => p && !people.some((x) => x.id === p.id) && setPeople([...people, p])} />
        </div>
        <div className="stack-s">
          <span className="label">Gäste ohne Zugang</span>
          {guests.map((g, i) => (
            <div key={i} className="row wrap">
              <input className="input grow" aria-label="Name" placeholder="Name" value={g.name} onChange={(e) => setGuests(guests.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input grow" aria-label="Firma oder Funktion" placeholder="Firma / Funktion" value={g.org} onChange={(e) => setGuests(guests.map((x, k) => (k === i ? { ...x, org: e.target.value } : x)))} />
              <input className="input grow" type="email" aria-label="E-Mail (freiwillig)" placeholder="E-Mail (freiwillig)" value={g.email} onChange={(e) => setGuests(guests.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} />
              <button type="button" className="btn sm" aria-label="Gast entfernen" onClick={() => setGuests(guests.filter((_, k) => k !== i))}>✕</button>
            </div>
          ))}
          <div><button type="button" className="btn sm" onClick={() => setGuests([...guests, { name: '', org: '', email: '' }])}>+ Gast</button></div>
        </div>
        <div className="row wrap">
          <div className="stack-s grow"><span className="label">Protokoll (freiwillig)</span><PersonPicker value={minutes} onChange={setMinutes} /></div>
          <div className="stack-s grow"><span className="label">Zeitwächter:in (freiwillig)</span><PersonPicker value={timekeeper} onChange={setTimekeeper} /></div>
        </div>
        <p className="xs muted">Du leitest das Meeting. Ohne eigene Protokollführung schreibst du selbst mit.</p>
      </section>

      <section className="card stack">
        <h2>Feste Punkte</h2>
        <p className="small muted">Stehen automatisch auf jeder Agenda. „Sonstiges“ bleibt immer am Ende.</p>
        <div className="chips">{o.template.map((t) => { const on = items.includes(t); return <label key={t} className={`fchip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => setStd(on ? items.filter((x) => x !== t) : o.template.filter((x) => x === t || items.includes(x)))} />{t}</label>; })}</div>
        <div className="row wrap">
          <div className="field grow"><label htmlFor="mdl">Punkte einbringen bis</label>
            <select id="mdl" className="input" value={f.agendaLeadHours} onChange={set('agendaLeadHours')}>{[[26, 'Vortag 12 Uhr (bei 14 Uhr)'], [24, '1 Tag vorher'], [48, '2 Tage vorher'], [4, '4 Stunden vorher'], [0, 'bis zum Beginn']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div className="field grow"><label htmlFor="mret">Protokolle aufbewahren</label>
            <select id="mret" className="input" value={f.retentionYears} onChange={set('retentionYears')}>{[1, 2, 3, 5, 10].map((y) => <option key={y} value={y}>{y} {y === 1 ? 'Jahr' : 'Jahre'}</option>)}</select></div>
        </div>
      </section>
      <label className="check"><input type="checkbox" checked={outlook} onChange={(e) => setOutlook(e.target.checked)} />Danach Outlook-Termin erstellen und an alle Teilnehmenden schicken</label>
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri big" disabled={busy}>Meeting anlegen und einladen</button></div>
    </form>
  );
}
