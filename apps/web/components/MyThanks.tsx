'use client';

import Link from 'next/link';
import { MOTIF, Kudos } from '@/lib/social';
import { useLoad, day } from '@/components/work';

/** Meine Danke-Karten – eine kleine Sammlung, ohne Zählen und Ranglisten (ADR-051). */
export function MyThanks() {
  const { data } = useLoad<Array<Kudos & { id: string; text: string; author: string; publishedAt: string }>>('/social/thanks/mine');
  if (!data) return null;
  return (
    <section className="card stack">
      <div className="chead"><h2>Meine Danke-Karten</h2>{data.length > 0 && <Link className="lnk small" href="/social/danke/album">Als Album / PDF</Link>}</div>
      {data.length === 0 ? <p className="small muted">Noch keine – aber das kommt bestimmt. Und du kannst selbst <Link className="lnk" href="/social/danke">Danke sagen</Link>.</p> : (
        <div className="kudos-grid">
          {data.map((k) => (
            <Link key={k.id} href={`/social/${k.id}`} className={`card social thanks m-${k.motif} stack-s title-link`}>
              <span className="row"><span className="kudos-emoji" aria-hidden="true">{MOTIF[k.motif]?.[0]}</span><span className="xs strong">{MOTIF[k.motif]?.[1]}</span></span>
              <span className="small">„{k.text}“</span>
              <span className="xs muted">von {k.author}{k.team ? ` · ans Team ${k.team}` : ''} · {day(k.publishedAt)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
