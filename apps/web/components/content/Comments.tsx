'use client';

import { useTx } from '@/lib/translate';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { when } from '@/lib/time';
import { Avatar } from './Avatar';
import { MentionText, Person, RichText } from './MentionText';
import { ReportButton } from './ReportButton';
import { Icon } from '../Icon';

interface Comment { id: string; text: string; createdAt: string; author: { id: string; name: string } | null; mentions: Person[]; canDelete: boolean }

export function Comments({ contentId, enabled = true, onCount }: { contentId: string; enabled?: boolean; onCount?: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Comment[]>(`/content/${contentId}/comments`);
    setList(r);
    onCount?.(r.length);
  }, [contentId, onCount]);
  useEffect(() => { void load(); }, [load]);

  const source = useCallback((q: string) => `/content/${contentId}/mentionable?q=${encodeURIComponent(q)}`, [contentId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      await api(`/content/${contentId}/comments`, { method: 'POST', json: { text, mentionIds: mentions.map((m) => m.id) } });
      setText(''); setMentions([]);
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Senden hat nicht geklappt.'); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    await api(`/comments/${id}`, { method: 'DELETE' }).catch(() => null);
    await load();
  }

  return (
    <section className="comments" aria-label="Kommentare">
      {list?.map((c) => (
        <div className="comment" key={c.id}>
          <Avatar name={c.author?.name ?? '?'} id={c.author?.id} size="s" />
          <div className="bubble">
            <div className="small muted"><strong className="fg">{c.author?.name ?? 'Ehemalige:r Kolleg:in'}</strong> · {when(c.createdAt)}</div>
            <CommentText c={c} />
            <div className="comment-actions">
              {c.canDelete && <button className="lnk small" onClick={() => remove(c.id)}>Löschen</button>}
              <ReportButton path={`/comments/${c.id}/report`} compact />
            </div>
          </div>
        </div>
      ))}
      {enabled ? (
        <form className="composer" onSubmit={send}>
          <MentionText id={`c-${contentId}`} label="Kommentar schreiben" value={text} onChange={setText} mentions={mentions} onMentions={setMentions}
            source={source} rows={2} placeholder="Kommentar schreiben … mit @ erwähnst du Kolleg:innen" />
          <button className="btn pri" disabled={busy || !text.trim()} aria-label="Kommentar senden"><Icon name="send" size={18} /></button>
        </form>
      ) : <p className="small muted">Kommentare sind hier ausgeschaltet.</p>}
      {error && <div className="note warn small" role="alert">{error}</div>}
    </section>
  );
}

function CommentText({ c }: { c: Comment }) {
  const t = useTx('COMMENT', c.id, 'body', c.text);
  return <span lang={t.lang}><RichText text={t.text} mentions={c.mentions} /></span>;
}
