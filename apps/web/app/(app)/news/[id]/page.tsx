'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useBadges } from '@/lib/badges';
import { when } from '@/lib/time';
import { Avatar } from '@/components/content/Avatar';
import { Images, ImageRef } from '@/components/content/Images';
import { RichText } from '@/components/content/MentionText';
import { LikeButton } from '@/components/content/LikeButton';
import { Comments } from '@/components/content/Comments';
import { ReadStatus } from '@/components/content/ReadStatus';
import { ReportButton } from '@/components/content/ReportButton';
import { Icon } from '@/components/Icon';

interface News { id: string; title: string; text: string; important: boolean; pinned: boolean; publishedAt: string; author: { name: string; job: string | null }; audiences: string[]; commentsEnabled: boolean; mine: boolean; canDelete: boolean; liked: boolean; likes: number; images: ImageRef[] }

export default function NewsDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { refresh } = useBadges();
  const [n, setN] = useState<News | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<News>(`/news/${id}`).then(setN)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Fehler'));
  }, [id]);
  if (error) return <div className="card narrow stack"><h1>Nicht gefunden</h1><p className="muted">{error}</p><Link className="btn" href="/news">Zu den News</Link></div>;
  if (!n) return <div className="loading">Lade …</div>;

  return (
    <div className="stack-lg">
      <Link href="/news" className="lnk back"><Icon name="back" size={16} />Alle News</Link>
      <div className="split">
        <article className="card article stack">
          <div className="chips">
            {n.important && <span className="chip warn">Wichtig</span>}
            {n.audiences.map((a) => <span key={a} className="chip">an: {a}</span>)}
          </div>
          <h1>{n.title}</h1>
          <div className="row"><Avatar name={n.author.name} size="s" /><span className="small muted"><strong className="fg">{n.author.name}</strong>{n.author.job ? ` · ${n.author.job}` : ''} · {when(n.publishedAt)}</span></div>
          <div className="prose"><RichText text={n.text} /></div>
          <Images images={n.images} />
          <div className="row wrap actions-bar">
            <LikeButton contentId={n.id} liked={n.liked} likes={n.likes} />
            {!n.mine && <ReportButton path={`/content/${n.id}/report`} />}
            {n.canDelete && <button className="btn sm warn" onClick={async () => { await api(`/news/${n.id}`, { method: 'DELETE' }); router.replace('/news'); }}><Icon name="trash" size={16} />Löschen</button>}
          </div>
          <Comments contentId={n.id} enabled={n.commentsEnabled} />
        </article>
        <aside className="aside"><ReadStatus contentId={n.id} onSeen={refresh} /></aside>
      </div>
    </div>
  );
}
