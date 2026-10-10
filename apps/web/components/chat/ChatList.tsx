'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { useBadges } from '@/lib/badges';
import { when } from '@/lib/time';
import { Avatar } from '../content/Avatar';
import { Icon } from '../Icon';

export interface ChatRow { id: string; type: 'DIRECT' | 'GROUP'; title: string; members: number; last: { text: string; at: string; mine: boolean; sender: string | null } | null; unread: number }
interface Person { id: string; name: string; job: string | null; groups: string[] }

export function ChatList({ activeId }: { activeId?: string }) {
  const { can } = useMe();
  const { badges } = useBadges();
  const router = useRouter();
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [mode, setMode] = useState<'list' | 'new' | 'group'>('list');
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person[]>([]);
  const [title, setTitle] = useState('');

  useEffect(() => {
    const load = () => api<ChatRow[]>('/chat').then(setRows).catch(() => setRows([]));
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    return () => clearInterval(t);
  }, [activeId, badges.chat]);
  useEffect(() => {
    if (mode === 'list') return;
    const t = setTimeout(() => api<Person[]>(`/people?q=${encodeURIComponent(q)}`).then(setPeople).catch(() => setPeople([])), 150);
    return () => clearTimeout(t);
  }, [q, mode]);

  async function direct(p: Person) {
    const r = await api<{ id: string }>('/chat/direct', { method: 'POST', json: { userId: p.id } });
    setMode('list'); router.push(`/chat/${r.id}`);
  }
  async function group() {
    const r = await api<{ id: string }>('/chat/group', { method: 'POST', json: { title, memberIds: picked.map((p) => p.id) } });
    setMode('list'); setPicked([]); setTitle(''); router.push(`/chat/${r.id}`);
  }

  if (mode !== 'list') {
    return (
      <div className="chatlist stack-s">
        <div className="row between"><strong>{mode === 'group' ? 'Neue Gruppe' : 'Neuer Chat'}</strong><button className="iconbtn" aria-label="Zurück" onClick={() => setMode('list')}><Icon name="x" /></button></div>
        {mode === 'group' && (
          <>
            <label className="sr" htmlFor="gt">Name der Gruppe</label>
            <input id="gt" className="input" placeholder="Name der Gruppe" value={title} onChange={(e) => setTitle(e.target.value)} />
            {picked.length > 0 && <div className="chips">{picked.map((p) => <button key={p.id} className="fchip on" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>{p.name} ✕</button>)}</div>}
          </>
        )}
        <label className="sr" htmlFor="pq">Person suchen</label>
        <input id="pq" className="input" placeholder="Name suchen …" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul className="plain">
          {people.filter((p) => !picked.some((x) => x.id === p.id)).map((p) => (
            <li key={p.id}><button className="chatrow" onClick={() => (mode === 'group' ? setPicked([...picked, p]) : direct(p))}>
              <Avatar name={p.name} /><span className="grow"><strong>{p.name}</strong><span className="block small muted">{[p.job, p.groups.join(', ')].filter(Boolean).join(' · ')}</span></span>
            </button></li>
          ))}
        </ul>
        {mode === 'group' && <button className="btn pri" disabled={!title.trim() || !picked.length} onClick={group}>Gruppe erstellen</button>}
      </div>
    );
  }

  return (
    <div className="chatlist">
      <div className="row wrap gap-s chat-actions">
        <button className="btn sm pri" onClick={() => { setMode('new'); setQ(''); }}><Icon name="plus" size={16} />Neuer Chat</button>
        {can('chat.create_group') && <button className="btn sm" onClick={() => { setMode('group'); setQ(''); }}><Icon name="users" size={16} />Gruppe</button>}
      </div>
      {rows === null ? <div className="empty">Lade …</div> : rows.length === 0 ? <div className="empty">Noch keine Chats.</div> : (
        <ul className="plain">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="chatrow" aria-current={c.id === activeId ? 'page' : undefined}>
                {c.type === 'GROUP' ? <span className="av av-m t5 group" aria-hidden="true"><Icon name="users" size={18} /></span> : <Avatar name={c.title} />}
                <span className="grow">
                  <span className="row between"><strong className="ellipsis">{c.title}</strong><span className="xs muted">{c.last ? when(c.last.at) : ''}</span></span>
                  <span className="row between"><span className="small muted ellipsis">{c.last ? `${c.last.mine ? 'Du: ' : c.type === 'GROUP' && c.last.sender ? `${c.last.sender.split(' ')[0]}: ` : ''}${c.last.text}` : 'Noch keine Nachricht'}</span>
                    {c.unread > 0 && <span className="nbadge">{c.unread}</span>}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="xs muted chat-note">Chats sieht nur, wer mitschreibt – auch keine Administration. Nachrichten werden nach 12 Monaten gelöscht.</p>
    </div>
  );
}
