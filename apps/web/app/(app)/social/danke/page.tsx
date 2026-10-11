'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { MOTIF } from '@/lib/social';
import { Icon } from '@/components/Icon';
import { ErrorNote, PersonPicker, State, useLoad, useSubmit } from '@/components/work';

/** Danke sagen (ADR-051): Personen und/oder ein Team, Motiv, kurzer Text – öffentlich oder nur an die Bedankten. */
export default function Thanks() {
  const router = useRouter();
  const { data, error } = useLoad<{ groups: Array<{ id: string; name: string }> }>('/social/thanks/options');
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const [groupId, setGroupId] = useState('');
  const [motif, setMotif] = useState('WIR');
  const [text, setText] = useState('');
  const [priv, setPriv] = useState(false);
  const { busy, error: err, run } = useSubmit();
  if (!data) return <State error={error} loading />;
  return (
    <form className="stack-lg narrow-col" onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => api<{ id: string }>('/social/thanks', { method: 'POST', json: { userIds: people.map((p) => p.id), groupId: groupId || null, motif, text, private: priv } }));
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
          {Object.entries(MOTIF).map(([k, [e, l]]) => <button type="button" key={k} aria-pressed={motif === k} onClick={() => setMotif(k)}><span className="e" aria-hidden="true">{e}</span>{l}</button>)}
        </div>
        <div className="field"><label htmlFor="tx">Dein Danke</label><textarea id="tx" className="input area" rows={4} maxLength={300} required minLength={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Danke für die schnelle Zimmerfreigabe am Samstag – das hat den Gästen den Tag gerettet!" />
          <span className="small muted">{text.length}/300</span></div>
        <label className="check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} />Nur an die Bedankten (nicht öffentlich im Social-Bereich)</label>
      </section>
      <ErrorNote error={err} />
      <div className="row"><Link className="btn" href="/social">Abbrechen</Link><button className="btn pri big" disabled={busy || (!people.length && !groupId) || text.trim().length < 3}>Danke senden</button></div>
    </form>
  );
}
