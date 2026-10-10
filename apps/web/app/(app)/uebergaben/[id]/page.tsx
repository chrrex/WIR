'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useBadges } from '@/lib/badges';
import { when } from '@/lib/time';
import { Avatar } from '@/components/content/Avatar';
import { Images, ImageRef } from '@/components/content/Images';
import { RichText } from '@/components/content/MentionText';
import { Comments } from '@/components/content/Comments';
import { Icon } from '@/components/Icon';

interface H { id: string; subject: string; text: string; group: string; shiftLabel: string | null; publishedAt: string; author: { name: string }; mentions: Array<{ id: string; name: string }>; images: ImageRef[] }

export default function HandoverDetail() {
  const { id } = useParams<{ id: string }>();
  const { refresh } = useBadges();
  const [h, setH] = useState<H | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<H>(`/handovers/${id}`).then((r) => { setH(r); api(`/content/${id}/seen`, { method: 'POST' }).then(refresh).catch(() => null); })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Fehler'));
  }, [id, refresh]);
  if (error) return <div className="card narrow stack"><h1>Nicht gefunden</h1><p className="muted">{error}</p><Link className="btn" href="/uebergaben">Zu den Übergaben</Link></div>;
  if (!h) return <div className="loading">Lade …</div>;
  return (
    <div className="stack-lg narrow-col wide">
      <Link href="/uebergaben" className="lnk back"><Icon name="back" size={16} />Übergaben</Link>
      <article className="card article stack">
        <div className="chips"><span className="chip info">{h.shiftLabel ?? 'Schicht'}</span><span className="chip">{h.group}</span></div>
        <h1>{h.subject}</h1>
        <div className="row"><Avatar name={h.author.name} size="s" /><span className="small muted"><strong className="fg">{h.author.name}</strong> · {when(h.publishedAt)}</span></div>
        <div className="prose"><RichText text={h.text} mentions={h.mentions} /></div>
        <Images images={h.images} />
        <h2 className="h-sub">Rückfragen & Erledigt</h2>
        <Comments contentId={h.id} />
      </article>
    </div>
  );
}
