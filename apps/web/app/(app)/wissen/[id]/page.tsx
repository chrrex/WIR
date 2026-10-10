'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Comments } from '@/components/content/Comments';
import { RichText } from '@/components/content/MentionText';
import { Back, ErrorNote, State, day, useLoad, useSubmit } from '@/components/work';
import { TYPE_LABEL } from '@/lib/labels';

interface A { id: string; title: string; text: string; plainText: string | null; type: string; category: string; version: number; publishedAt: string; author: string; requiresAck: boolean; acknowledged: boolean;
  acks: { done: number; total: number } | null; canEdit: boolean; audience: string[]; history: Array<{ n: number; title: string; changeSummary: string | null; publishedAt: string; author: string }> }

export default function Article() {
  const { id } = useParams<{ id: string }>();
  const { data: a, error, reload } = useLoad<A>(`/knowledge/${id}`);
  const [plain, setPlain] = useState(false);
  const [old, setOld] = useState<{ n: number; text: string } | null>(null);
  const { busy, error: err, run } = useSubmit();
  useEffect(() => { if (a) api(`/content/${id}/seen`, { method: 'POST' }).catch(() => null); }, [a, id]);
  if (!a) return <State error={error} loading back={['/wissen', 'Zum Wissen']} />;
  return (
    <div className="stack-lg narrow-col wide">
      <Back href="/wissen" label="Wissen & SOPs" />
      <article className="card article stack">
        <div className="chips"><span className="chip info">{TYPE_LABEL[a.type] ?? a.type}</span><span className="chip">{a.category}</span><span className="chip">Version {a.version}</span></div>
        <h1>{a.title}</h1>
        <p className="small muted">{a.author} · {day(a.publishedAt)} · für {a.audience.join(', ')}</p>
        {a.plainText && <div className="seg" role="group" aria-label="Sprache"><button aria-pressed={!plain} onClick={() => setPlain(false)}>Fachtext</button><button aria-pressed={plain} onClick={() => setPlain(true)}>Einfache Sprache</button></div>}
        <div className="prose"><RichText text={plain && a.plainText ? a.plainText : a.text} /></div>
        {a.requiresAck && (a.acknowledged
          ? <div className="note ok">Du hast Version {a.version} zur Kenntnis genommen.</div>
          : <div className="row wrap"><button className="btn pri big" disabled={busy} onClick={() => run(() => api(`/knowledge/${id}/ack`, { method: 'POST' })).then(reload)}>Gelesen und verstanden</button><span className="small muted">Bestätigung gilt für Version {a.version}.</span></div>)}
        <ErrorNote error={err} />
        {a.acks && <p className="small muted">{a.acks.done} von {a.acks.total} haben diese Version bestätigt.</p>}
        {a.canEdit && <div className="row"><Link className="btn" href={`/wissen/neu?id=${a.id}`}>Neue Version schreiben</Link></div>}
      </article>
      <section className="card stack">
        <h2 className="h-sub">Versionen</h2>
        <ol className="plain stack-s">
          {a.history.map((h) => (
            <li key={h.n} className="row wrap between">
              <span><strong>Version {h.n}</strong> · {day(h.publishedAt)} · {h.author}{h.changeSummary && <span className="muted"> – {h.changeSummary}</span>}</span>
              {h.n !== a.version && <button className="btn sm" onClick={() => api<{ text: string }>(`/knowledge/${id}/versions/${h.n}`).then((v) => setOld({ n: h.n, text: v.text }))}>Ansehen</button>}
            </li>
          ))}
        </ol>
        {old && <div className="note info stack-s"><strong>Version {old.n} (veraltet)</strong><div className="prose"><RichText text={old.text} /></div><button className="btn sm" onClick={() => setOld(null)}>Schließen</button></div>}
      </section>
      <section className="card stack"><h2 className="h-sub">Fragen & Hinweise</h2><Comments contentId={a.id} /></section>
    </div>
  );
}
