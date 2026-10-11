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

export interface ChatRow { id: string; type: 'DIRECT' | 'GROUP'; title: string; partnerId: string | null; members: number; last: { text: string; at: string; mine: boolean; sender: string | null } | null; unread: number }
interface Person { id: string; name: string; job: string | null; groups: string[] }

export function ChatList({ activeId }: { activeId?: string }) {
  const { can } = useMe();
  const { badges } = useBadges();
  const router = useRouter();
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [mode, setMode] = useState<'list' | 'new'>('list');
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

  /** Ein Weg für beides: eine Person → Einzelchat, mehrere → Gruppe. */
  async function start() {
    const r = picked.length === 1
      ? await api<{ id: string }>('/chat/direct', { method: 'POST', json: { userId: picked[0].id } })
      : await api<{ id: string }>('/chat/group', { method: 'POST', json: { title, memberIds: picked.map((p) => p.id) } });
    setMode('list'); setPicked([]); setTitle(''); router.push(`/chat/${r.id}`);
  }

  if (mode === 'new') {
    const isGroup = picked.length > 1;
    return (
      <div className="chatlist stack-s">
        <div className="row between"><strong>Neuer Chat</strong><button className="iconbtn" aria-label="Zurück" onClick={() => { setMode('list'); setPicked([]); }}><Icon name="x" /></button></div>
        <p className="xs muted">Eine Person = Einzelchat · mehrere Personen = Gruppe</p>
        {picked.length > 0 && <div className="chips">{picked.map((p) => <button key={p.id} className="fchip on" aria-label={`${p.name} entfernen`} onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>{p.name} ✕</button>)}</div>}
        {isGroup && (can('chat.create_group')
          ? <><label className="sr" htmlFor="gt">Name der Gruppe</label><input id="gt" className="input" placeholder="Name der Gruppe" value={title} onChange={(e) => setTitle(e.target.value)} /></>
          : <p className="small warn-ink">Gruppen legen Teamleitungen an. Wähle eine Person für einen Einzelchat.</p>)}
        {picked.length > 0 && <button className="btn pri" disabled={isGroup && (!title.trim() || !can('chat.create_group'))} onClick={start}>{isGroup ? `Gruppe mit ${picked.length} Personen starten` : `Chat mit ${picked[0].name} starten`}</button>}
        <label className="sr" htmlFor="pq">Person suchen</label>
        <input id="pq" className="input" placeholder="Name suchen …" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul className="plain">
          {people.filter((p) => !picked.some((x) => x.id === p.id)).map((p) => (
            <li key={p.id}><button className="chatrow" onClick={() => { setPicked([...picked, p]); setQ(''); }}>
              <Avatar name={p.name} id={p.id} /><span className="grow"><strong>{p.name}</strong><span className="block small muted">{[p.job, p.groups.join(', ')].filter(Boolean).join(' · ')}</span></span>
            </button></li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="chatlist">
      <div className="row wrap gap-s chat-actions">
        <button className="btn sm pri" onClick={() => { setMode('new'); setQ(''); }}><Icon name="plus" size={16} />Neuer Chat</button>
      </div>
      {rows === null ? <div className="empty">Lade …</div> : rows.length === 0 ? <div className="empty">Noch keine Chats.</div> : (
        <ul className="plain">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="chatrow" aria-current={c.id === activeId ? 'page' : undefined}>
                {c.type === 'GROUP' ? <span className="av av-m t5 group" aria-hidden="true"><Icon name="users" size={18} /></span> : <Avatar name={c.title} id={c.partnerId} />}
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
