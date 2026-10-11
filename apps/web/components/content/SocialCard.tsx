'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { when } from '@/lib/time';
import { CATEGORIES, SocialPost } from '@/lib/social';
import { Avatar } from './Avatar';
import { Images } from './Images';
import { ContentReactions } from './Reactions';
import { BookmarkButton } from './Extras';
import { KudosCard } from './KudosCard';
import { RichText } from './MentionText';
import { Icon } from '../Icon';

export function SocialCard({ p, full = false, onChange, autoOpen = false }: { p: SocialPost; full?: boolean; onChange?: () => void; autoOpen?: boolean }) {
  const router = useRouter();
  async function ask() {
    if (!p.author.id) return;
    const r = await api<{ id: string }>('/chat/direct', { method: 'POST', json: { userId: p.author.id } });
    router.push(`/chat/${r.id}`);
  }
  return (
    <article className={`card social stack-s ${p.kudos ? `thanks m-${p.kudos.motif}` : ''}`}>
      <div className="row">
        <Avatar name={p.author.name} id={p.author.id} />
        <span className="grow"><strong>{p.author.name}</strong><span className="block small muted">{when(p.publishedAt)}</span></span>
        <span className="chip">{CATEGORIES[p.category] ?? p.category}</span>
      </div>
      {full ? <h1 className="h-social">{p.title}</h1> : <Link href={`/social/${p.id}`} className="title-link"><strong className="title">{p.title}</strong></Link>}
      {p.kudos && <KudosCard k={p.kudos} text={p.text} author={p.author.name} id={p.id} autoOpen={autoOpen} />}
      {p.category === 'MARKETPLACE' && (
        <div className="row wrap gap-s">
          <span className={`chip ${p.intent === 'SEARCH' ? 'info' : 'ok'}`}>{p.intent === 'SEARCH' ? 'Suche' : 'Biete'}</span>
          {p.price && <strong>{p.price}</strong>}
          {p.closed && <span className="chip">erledigt</span>}
        </div>
      )}
      {p.text && !p.kudos && (full ? <div className="prose"><RichText text={p.text} /></div> : <p className="excerpt">{p.text.length > 240 ? `${p.text.slice(0, 240)} …` : p.text}</p>)}
      <Images images={p.images} />
      <div className="row wrap actions-bar">
        <ContentReactions key={p.id} contentId={p.id} initial={p.reactions} />
        {full && <BookmarkButton contentId={p.id} />}
        {!full && <Link className="btn sm" href={`/social/${p.id}`}><Icon name="chat" size={16} />{p.comments ? `${p.comments} Kommentar${p.comments === 1 ? '' : 'e'}` : 'Kommentieren'}</Link>}
        {p.category === 'MARKETPLACE' && !p.mine && !p.closed && <button className="btn sm pri" onClick={ask}><Icon name="chat" size={16} />Im Chat fragen</button>}
        {p.category === 'MARKETPLACE' && p.mine && !p.closed && full && (
          <button className="btn sm" onClick={async () => { await api(`/social/${p.id}/close`, { method: 'POST' }); onChange?.(); }}>Als erledigt markieren</button>
        )}
      </div>
    </article>
  );
}
