'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { State, day, useLoad } from '@/components/work';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface S { id: string; title: string; anonymous: boolean; closesAt: string | null; open: boolean; participated: boolean; mine: boolean; author: string }

export default function Surveys() {
  const { data, error } = useLoad<{ canCreate: boolean; surveys: S[] }>('/surveys');
  const counts = useReadCounts((data?.surveys ?? []).map((s) => s.id));
  if (!data) return <State error={error} loading />;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Umfragen</h1>{data.canCreate && <Link className="btn pri" href="/umfragen/neu"><Icon name="plus" size={18} />Neue Umfrage</Link>}</div>
      {data.surveys.length === 0 ? <div className="card empty">Gerade keine Umfragen.</div> : (
        <div className="list">
          {data.surveys.map((s) => {
            const todo = s.open && !s.participated && !s.mine;
            return (
              <Link key={s.id} href={`/umfragen/${s.id}`} className={`card listitem ${todo ? 'unread' : ''}`}>
                <span className={`udot ${todo ? '' : 'off'}`} aria-label={todo ? 'noch nicht teilgenommen' : undefined} />
                <span className="grow">
                  <span className="row wrap gap-s">{s.anonymous && <span className="chip info">anonym</span>}<span className={`chip ${s.open ? 'ok' : ''}`}>{s.open ? 'offen' : 'geschlossen'}</span><strong className="title">{s.title}</strong></span>
                  <span className="block muted small">{s.author}{s.closesAt && ` · bis ${day(s.closesAt)}`}{s.participated && ' · du hast teilgenommen'} <ReadChip c={counts[s.id]} label="teilgenommen" /></span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
