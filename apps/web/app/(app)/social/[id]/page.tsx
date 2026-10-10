'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { SocialPost } from '@/lib/social';
import { SocialCard } from '@/components/content/SocialCard';
import { Comments } from '@/components/content/Comments';
import { ReportButton } from '@/components/content/ReportButton';
import { Icon } from '@/components/Icon';

export default function SocialDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<SocialPost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { api<SocialPost>(`/social/${id}`).then(setP).catch((e) => setError(e instanceof ApiError ? e.message : 'Fehler')); }, [id]);
  useEffect(() => { load(); }, [load]);
  if (error) return <div className="card narrow stack"><h1>Nicht gefunden</h1><p className="muted">{error}</p><Link className="btn" href="/social">Zu Social</Link></div>;
  if (!p) return <div className="loading">Lade …</div>;
  return (
    <div className="stack-lg feed-col">
      <Link href="/social" className="lnk back"><Icon name="back" size={16} />Social</Link>
      <SocialCard p={p} full onChange={load} />
      <div className="row wrap">
        {!p.mine && <ReportButton path={`/content/${p.id}/report`} />}
        {p.canDelete && <button className="btn sm warn" onClick={async () => { await api(`/social/${p.id}`, { method: 'DELETE' }); router.replace('/social'); }}><Icon name="trash" size={16} />Löschen</button>}
      </div>
      <section className="card"><Comments contentId={p.id} /></section>
    </div>
  );
}
