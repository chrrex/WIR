'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { MOTIF } from '@/lib/social';
import { Icon } from '@/components/Icon';
import { ErrorNote, PersonPicker, State, useLoad, useSubmit, day } from '@/components/work';

/** Danke sagen (ADR-051): Personen und/oder ein Team, Motiv, kurzer Text – öffentlich oder nur an die Bedankten. */
export default function ThanksPage() {
  return <Suspense><Thanks /></Suspense>;
}

function Thanks() {
  const router = useRouter();
  const q = useSearchParams();
  const { data, error } = useLoad<{ groups: Array<{ id: string; name: string }>; motifs: Record<string, string>; leader: boolean }>('/social/thanks/options');
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState(q.get('group') ?? '');
  const [motif, setMotif] = useState(q.get('anlass') ? 'TEAM' : 'WIR');
  const [text, setText] = useState(q.get('anlass') ? `Danke für euren Einsatz bei „${q.get('anlass')}“!` : '');
  const [priv, setPriv] = useState(false);
  const [source, setSource] = useState('');
  const { busy, error: err, run } = useSubmit();
  if (!data) return <State error={error} loading />;
  return (
    <div className="stack-lg narrow-col">
    <form className="stack-lg" onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => api<{ id: string }>('/social/thanks', { method: 'POST', json: { userIds: people.map((p) => p.id), groupId: groupId || null, motif, text, private: priv, source: motif === 'GUEST' ? source || null : null } }));
      if (r) router.replace(`/social/${r.id}`);
    }}>
      <Link href="/social" className="lnk back"><Icon name="back" size={16} />Social</Link>
      <h1>Danke sagen 💚</h1>
      <section className="card stack">
        <h2>Wem möchtest du danken?</h2>
        {people.length > 0 && <div className="chips">{people.map((p) => <button type="button" key={p.id} className="fchip on" aria-label={`${p.name} entfernen`} onClick={() => setPeople(people.filter((x) => x.id !== p.id))}>{p.name} ✕</button>)}</div>}
        {people.length < 10 && <PersonPicker value={null} onChange={(p) => p && !people.some((x) => x.id === p.id) && setPeople([...people, p])} />}
        <div className="field"><label htmlFor="tg">… oder einem ganzen Team</label>
          <select id="tg" className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">Kein Team</option>{data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      </section>
      <section className="card stack">
        <h2>Wofür?</h2>
        <div className="motifs" role="group" aria-label="Motiv">
          {Object.keys(data.motifs).map((k) => [k, ...(MOTIF[k] ?? ['💚', k])] as const).map(([k, e, l]) => <button type="button" key={k} aria-pressed={motif === k} onClick={() => setMotif(k)}><span className="e" aria-hidden="true">{e}</span>{l}</button>)}
        </div>
        {motif === 'GUEST' && <div className="field"><label htmlFor="src">Woher stammt das Lob? (optional)</label><input id="src" className="input" maxLength={120} value={source} onChange={(e) => setSource(e.target.value)} placeholder="z. B. Gästebuch, Bewertung, Brief der Familie Müller" />
          <span className="small muted">Bitte ohne Namen von Gästen – nur das Lob selbst.</span></div>}
        <div className="field"><label htmlFor="tx">{motif === 'GUEST' ? 'Das Lob des Gastes' : 'Dein Danke'}</label><textarea id="tx" className="input area" rows={4} maxLength={300} required minLength={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Danke für die schnelle Zimmerfreigabe am Samstag – das hat den Gästen den Tag gerettet!" />
          <span className="small muted">{text.length}/300</span></div>
        <label className="check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />Nur an die Bedankten (nicht öffentlich im Social-Bereich)</label>
      </section>
      <ErrorNote error={err} />
      <div className="row"><Link className="btn" href="/social">Abbrechen</Link><button className="btn pri big" disabled={busy || (!people.length && !groupId) || text.trim().length < 3}>{motif === 'GUEST' ? 'Gästelob weitergeben' : 'Danke senden'}</button></div>
    </form>
    {data.leader && <Reminders groups={data.groups} />}
    </div>
  );
}

/** Leitungen: „Nach der Veranstaltung ans Danke erinnern“ (ADR-052). */
function Reminders({ groups }: { groups: Array<{ id: string; name: string }> }) {
  const { data, reload } = useLoad<Array<{ id: string; occasion: string; dueOn: string; team: string | null }>>('/social/thanks/reminders');
  const [f, setF] = useState({ occasion: '', dueOn: '', groupId: '' });
  const { busy, error, run } = useSubmit();
  const add = async () => { if (await run(() => api('/social/thanks/reminders', { method: 'POST', json: { ...f, groupId: f.groupId || null } }))) { setF({ occasion: '', dueOn: '', groupId: '' }); reload(); } };
  return (
    <section className="card stack">
      <h2>Später ans Danke erinnern</h2>
      <p className="small muted">Nach einer großen Veranstaltung bekommst du am nächsten Morgen eine Erinnerung – mit vorausgefüllter Karte. Später kommt das automatisch aus dem Eventtool.</p>
      <div className="grid">
        <div className="field"><label htmlFor="ro">Anlass</label><input id="ro" className="input" maxLength={120} value={f.occasion} onChange={(e) => setF({ ...f, occasion: e.target.value })} placeholder="z. B. Hochzeit Müller" /></div>
        <div className="field"><label htmlFor="rd">Datum der Veranstaltung</label><input id="rd" type="date" className="input" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></div>
        <div className="field"><label htmlFor="rg">Team</label><select id="rg" className="input" value={f.groupId} onChange={(e) => setF({ ...f, groupId: e.target.value })}><option value="">ohne Team</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      </div>
      <ErrorNote error={error} />
      <div className="row"><button type="button" className="btn" disabled={busy || f.occasion.trim().length < 3 || !f.dueOn} onClick={add}>Erinnerung planen</button></div>
      {data && data.length > 0 && (
        <ul className="plain stack-s">{data.map((r) => (
          <li key={r.id} className="row"><span className="grow">{r.occasion}{r.team ? ` · Team ${r.team}` : ''} <span className="small muted">· {day(r.dueOn)}</span></span>
            <button type="button" className="btn sm" aria-label={`Erinnerung „${r.occasion}“ löschen`} onClick={() => api(`/social/thanks/reminders/${r.id}`, { method: 'DELETE' }).then(reload)}>Löschen</button></li>
        ))}</ul>
      )}
    </section>
  );
}
