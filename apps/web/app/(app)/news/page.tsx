'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { when } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface NewsRow { id: string; title: string; excerpt: string; important: boolean; pinned: boolean; author: string; publishedAt: string; read: boolean; mine: boolean; likes: number; comments: number; images: unknown[] }

export default function NewsList() {
  const { can } = useMe();
  const [filter, setFilter] = useState<'all' | 'unread' | 'important'>('all');
  const [rows, setRows] = useState<NewsRow[] | null>(null);
  useEffect(() => { setRows(null); api<NewsRow[]>(`/news${filter === 'all' ? '' : `?filter=${filter}`}`).then(setRows).catch(() => setRows([])); }, [filter]);

  const counts = useReadCounts((rows ?? []).map((r) => r.id));
  return (
    <div className="stack-lg">
      <div className="ptitle">
        <h1>News</h1>
        {can('news.publish') && <Link className="btn pri" href="/news/neu"><Icon name="plus" size={18} />Neue Mitteilung</Link>}
      </div>
      <div className="chips" role="group" aria-label="Filter">
        {([['all', 'Alle'], ['unread', 'Ungelesen'], ['important', 'Wichtig']] as const).map(([k, l]) => (
          <button key={k} className={`fchip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {rows === null ? <div className="card empty">Lade …</div> : rows.length === 0 ? (
        <div className="card empty">{filter === 'unread' ? 'Alles gelesen. Stark!' : 'Noch keine News.'}</div>
      ) : (
        <div className="list">
          {rows.map((n) => (
            <Link key={n.id} href={`/news/${n.id}`} className={`card listitem ${n.read || n.mine ? '' : 'unread'}`}>
              <span className={`udot ${n.read || n.mine ? 'off' : ''}`} aria-label={n.read || n.mine ? undefined : 'ungelesen'} />
              <span className="grow">
                <span className="row wrap gap-s">
                  {n.important && <span className="chip warn">Wichtig</span>}
                  {n.pinned && <span className="chip"><Icon name="pin" size={12} /> angeheftet</span>}
                  <strong className="title">{n.title}</strong>
                </span>
                <span className="block muted small">{n.author} · {when(n.publishedAt)} <ReadChip c={counts[n.id]} /></span>
                <span className="block excerpt">{n.excerpt}</span>
                <span className="block xs muted">{n.likes > 0 && `${n.likes} gefällt das`}{n.likes > 0 && n.comments > 0 && ' · '}{n.comments > 0 && `${n.comments} Kommentar${n.comments === 1 ? '' : 'e'}`}{n.images.length > 0 && ` · ${n.images.length} Foto${n.images.length === 1 ? '' : 's'}`}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
