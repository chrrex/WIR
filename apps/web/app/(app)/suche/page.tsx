'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { ErrorNote, useSubmit } from '@/components/work';
import { Absent, AbsentChip } from '@/components/Absent';

interface Result { id: string; label: string; title: string; snippet: string; href: string }
interface Ai { mode: 'llm' | 'sources'; answer: string | null; sources: Array<Result & { n: number }> }

/** Treffer-Ausschnitt: «…» aus der Datenbank wird zur Hervorhebung. */
function Snippet({ text }: { text: string }) {
  return <span className="block excerpt">{text.split(/(«[^»]*»)/).map((p, i) => (p.startsWith('«') ? <mark key={i}>{p.slice(1, -1)}</mark> : p))}</span>;
}

function Search() {
  const router = useRouter();
  const q = useSearchParams().get('q') ?? '';
  const { can } = useMe();
  const [res, setRes] = useState<{ results: Result[]; people: Array<{ id: string; name: string; job: string | null; absent: Absent | null }>; contacts: Array<{ id: string; name: string; person: string | null; phone: string | null }> } | null>(null);
  const [question, setQuestion] = useState('');
  const [ai, setAi] = useState<Ai | null>(null);
  const { busy, error, run } = useSubmit();
  useEffect(() => { if (q.trim().length >= 2) api<NonNullable<typeof res>>(`/search?q=${encodeURIComponent(q)}`).then(setRes); else setRes(null); }, [q]);

  return (
    <div className="stack-lg narrow-col wide">
      <h1>Suche</h1>
      <form role="search" className="row" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get('q'); router.replace(`/suche?q=${encodeURIComponent(String(v))}`); }}>
        <label htmlFor="sq" className="sr">Suchbegriff</label>
        <input id="sq" name="q" className="input grow" defaultValue={q} key={q} placeholder="z. B. Kühlkette, Urlaubsantrag, Notdienst" />
        <button className="btn pri">Suchen</button>
      </form>
      {res && (
        <section className="stack-s" aria-live="polite">
          <h2 className="h-sub">{res.results.length + res.contacts.length + res.people.length} Treffer</h2>
          <div className="list">
            {res.people.map((p) => <Link key={p.id} href={`/team/${p.id}`} className="card listitem"><span className="grow"><span className="row gap-s"><span className="chip">Team</span><strong className="title">{p.name}</strong><AbsentChip a={p.absent} /></span>{p.job && <span className="block small muted">{p.job}</span>}</span></Link>)}
            {res.results.map((r) => <Link key={r.id} href={r.href} className="card listitem"><span className="grow"><span className="row gap-s"><span className="chip info">{r.label}</span><strong className="title">{r.title}</strong></span><Snippet text={r.snippet} /></span></Link>)}
            {res.contacts.map((c) => <Link key={c.id} href={`/kontakte?q=${encodeURIComponent(c.name)}`} className="card listitem"><span className="grow"><span className="row gap-s"><span className="chip">Kontakt</span><strong className="title">{c.name}</strong></span><span className="block small muted">{[c.person, c.phone].filter(Boolean).join(' · ')}</span></span></Link>)}
          </div>
          {res.results.length + res.contacts.length + res.people.length === 0 && <p className="muted">Nichts gefunden. Du siehst nur Inhalte, die für dich freigegeben sind.</p>}
        </section>
      )}
      {can('ai.use') && (
        <section className="card stack">
          <h2>Frag das WIR</h2>
          <p className="small muted">Der Assistent antwortet nur aus Wissen, Dokumenten und News, die du selbst sehen darfst – und nennt immer die Quellen. Deine Frage wird nicht gespeichert.</p>
          <form className="row" onSubmit={async (e) => { e.preventDefault(); setAi((await run(() => api<Ai>('/ai/ask', { method: 'POST', json: { question } }))) ?? null); }}>
            <label htmlFor="aq" className="sr">Frage</label>
            <input id="aq" className="input grow" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="z. B. Wie kalt muss Tiefkühlware bei der Anlieferung sein?" maxLength={500} />
            <button className="btn pri" disabled={busy || question.trim().length < 3}>{busy ? 'Denke nach …' : 'Fragen'}</button>
          </form>
          <ErrorNote error={error} />
          {ai && (
            <div className="stack-s" aria-live="polite">
              {ai.answer ? <div className="prose pre">{ai.answer}</div>
                : <p className="note info">{ai.sources.length ? 'Die KI-Antwort ist noch nicht eingeschaltet. Diese Stellen passen zu deiner Frage:' : 'Dazu habe ich in deinen Inhalten nichts gefunden. Frag am besten deine Leitung.'}</p>}
              <ol className="plain stack-s">{ai.sources.map((s) => <li key={s.id}><Link className="lnk" href={s.href}>[{s.n}] {s.title}</Link> <span className="xs muted">{s.label}</span><Snippet text={s.snippet} /></li>)}</ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function Page() { return <Suspense><Search /></Suspense>; }
