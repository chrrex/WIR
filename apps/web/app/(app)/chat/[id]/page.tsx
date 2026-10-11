'use client';
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useBadges } from '@/lib/badges';
import { when } from '@/lib/time';
import { ChatList } from '@/components/chat/ChatList';
import { MentionText, Person } from '@/components/content/MentionText';
import { Absent, absentText } from '@/components/Absent';
import { Icon } from '@/components/Icon';
import { Reaction, Reactions } from '@/components/content/Reactions';

interface Msg { id: string; text: string | null; deleted: boolean; at: string; mine: boolean; sender: { id: string; name: string } | null; image: string | null; readByOther: boolean; reactions: Reaction[] }
interface Conv { id: string; type: 'DIRECT' | 'GROUP'; title: string; members: Array<{ id: string; name: string }>; absent: Array<Absent & { id: string; name: string }>; messages: Msg[] }

export default function ChatThread() {
  const { id } = useParams<{ id: string }>();
  const { refresh } = useBadges();
  const [c, setC] = useState<Conv | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Conv>(`/chat/${id}`);
      setC(r);
      const last = r.messages.at(-1);
      if (last && last.id !== lastId.current) {
        lastId.current = last.id;
        await api(`/chat/${id}/read`, { method: 'POST', json: { messageId: last.id } }).catch(() => null);
        refresh();
        requestAnimationFrame(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; });
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Fehler'); }
  }, [id, refresh]);

  useEffect(() => {
    lastId.current = null;
    void load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 4000);
    return () => clearInterval(t);
  }, [load]);

  const source = useCallback((q: string) => `/people?q=${encodeURIComponent(q)}`, []);

  async function send(imageId?: string) {
    if (!text.trim() && !imageId) return;
    setBusy(true);
    try {
      await api(`/chat/${id}/messages`, { method: 'POST', json: { text: imageId ? '' : text, mentionIds: mentions.map((m) => m.id), imageId: imageId ?? null } });
      if (!imageId) { setText(''); setMentions([]); }
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Senden hat nicht geklappt.'); }
    finally { setBusy(false); }
  }

  async function photo(files: FileList | null) {
    if (!files?.[0]) return;
    const fd = new FormData(); fd.append('file', files[0]);
    const res = await fetch('/api/v1/files', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json();
    if (res.ok) await send(data.id); else setError(data.message);
  }

  return (
    <div className="stack-lg">
      <div className="ptitle hide-m"><h1>Chat</h1></div>
      <div className="chatwrap with-thread">
        <ChatList activeId={id} />
        <section className="thread" aria-label={c ? `Chat mit ${c.title}` : 'Chat'}>
          <header className="thread-head">
            <Link href="/chat" className="iconbtn only-m" aria-label="Alle Chats"><Icon name="back" /></Link>
            <span className="grow"><strong>{c?.title ?? '…'}</strong>{c?.type === 'GROUP' && <span className="block xs muted">{c.members.map((m) => m.name).join(', ')}</span>}</span>
          </header>
          {c?.absent?.map((a) => <div key={a.id} className="note warn small" role="status">{c.type === 'GROUP' ? `${a.name} ist ` : 'Gerade '}{absentText(a)}</div>)}
          {error && <div className="note warn small" role="alert">{error}</div>}
          <div className="msgs" ref={box} aria-live="polite">
            {c?.messages.map((m, i) => {
              const showName = c.type === 'GROUP' && !m.mine && m.sender?.id !== c.messages[i - 1]?.sender?.id;
              return (
                <div key={m.id} className={`msg ${m.mine ? 'me' : ''}`}>
                  {showName && <span className="xs muted sender">{m.sender?.name}</span>}
                  <div className="bubble">
                    {m.deleted ? <em className="muted">Nachricht gelöscht</em> : (
                      <>
                        {m.image && <a href={`/api/v1/files/${m.image}`} target="_blank" rel="noreferrer"><img src={`/api/v1/files/${m.image}`} alt="Foto im Chat" className="chatimg" /></a>}
                        {m.text && <span className="pre">{m.text}</span>}
                      </>
                    )}
                    <span className="meta">{when(m.at)}{m.mine && c.type === 'DIRECT' && <span className={m.readByOther ? 'ticks read' : 'ticks'} aria-label={m.readByOther ? 'gelesen' : 'zugestellt'}>{m.readByOther ? ' ✓✓' : ' ✓'}</span>}</span>
                  </div>
                  {!m.deleted && <Reactions reactions={m.reactions} onToggle={(type) => api(`/chat/messages/${m.id}/reactions`, { method: 'POST', json: { type } }).then(load).catch(() => null)} />}
                </div>
              );
            })}
          </div>
          <form className="composer" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <label className="iconbtn" title="Foto senden" aria-label="Foto senden"><Icon name="camera" /><input type="file" accept="image/*" className="sr" onChange={(e) => photo(e.target.files)} /></label>
            {c?.type === 'GROUP' ? (
              <MentionText id="m" label="Nachricht" value={text} onChange={setText} mentions={mentions} onMentions={setMentions} source={source} rows={1} placeholder="Nachricht … (@ für Erwähnung)" />
            ) : (
              <><label htmlFor="m" className="sr">Nachricht</label>
                <textarea id="m" className="input area" rows={1} value={text} placeholder="Nachricht …" onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} /></>
            )}
            <button className="btn pri" disabled={busy || !text.trim()} aria-label="Senden"><Icon name="send" size={18} /></button>
          </form>
        </section>
      </div>
    </div>
  );
}
