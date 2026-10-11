'use client';

import Link from 'next/link';
import { useMe } from '@/lib/me';
import { Kudos, MOTIF } from '@/lib/social';
import { KudosArt } from '@/components/content/KudosCard';
import { Icon } from '@/components/Icon';
import { State, useLoad, day } from '@/components/work';

/** Danke-Album: die eigenen Karten zum Drucken oder „Als PDF speichern“ – nur für dich (ADR-052). */
export default function Album() {
  const { me } = useMe();
  const { data, error } = useLoad<Array<Kudos & { id: string; text: string; author: string; publishedAt: string }>>('/social/thanks/mine');
  if (!data) return <State error={error} loading />;
  return (
    <div className="stack-lg">
      <div className="row wrap noprint">
        <Link href="/einstellungen" className="lnk back"><Icon name="back" size={16} />Einstellungen</Link>
        <span className="grow" />
        {data.length > 0 && <button className="btn pri" onClick={() => window.print()}>Drucken / als PDF speichern</button>}
      </div>
      <header className="stack-s">
        <h1>Mein Danke-Album</h1>
        <p className="muted">{me?.user.displayName} · {data.length} {data.length === 1 ? 'Karte' : 'Karten'} · Stand {day(new Date().toISOString())}</p>
        <p className="small muted noprint">Tipp: Im Druckdialog „Als PDF speichern“ wählen. Das Album sieht nur, wer es selbst öffnet – deine Vorgesetzten nicht.</p>
      </header>
      {data.length === 0 ? <div className="card empty">Noch keine Danke-Karten – das kommt bestimmt.</div> : (
        <div className="album">
          {data.map((k) => (
            <article key={k.id} className="album-card">
              <KudosArt motif={k.motif} />
              <div className="body">
                <span className="xs strong">{MOTIF[k.motif]?.[0]} {MOTIF[k.motif]?.[1]}</span>
                <p className="ktext">„{k.text}“</p>
                <span className="small">{k.motif === 'GUEST' ? `Gästelob${k.source ? ` (${k.source})` : ''}, weitergegeben von ${k.author}` : `von ${k.author}`}{k.team ? ` · an Team ${k.team}` : ''} · {day(k.publishedAt)}</span>
                {k.signers.length > 0 && <span className="sig">{k.signers.map((s) => s.name).join(' · ')}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
