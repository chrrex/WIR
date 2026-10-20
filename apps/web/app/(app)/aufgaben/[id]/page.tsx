'use client';

import { MeetingOrigin, ToAgenda } from '@/components/meetings/ToAgenda';
import { BookmarkButton } from '@/components/content/Extras';
import { useParams } from 'next/navigation';
import { ReadStatus } from '@/components/content/ReadStatus';
import { api } from '@/lib/api';
import { Comments } from '@/components/content/Comments';
import { RichText } from '@/components/content/MentionText';
import { Back, ErrorNote, State, dayTime, useLoad, useSubmit } from '@/components/work';
import { PRIORITY, TASK_STATUS } from '@/lib/labels';
import { useMe } from '@/lib/me';

interface T { id: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; completedAt: string | null; assignee: string; author: string; authorId: string; canChange: boolean }

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useMe();
  const { data: t, error, reload } = useLoad<T>(`/tasks/${id}`);
  const { busy, error: err, run } = useSubmit();
  if (!t) return <State error={error} loading back={['/aufgaben', 'Zu den Aufgaben']} />;
  const set = (status: string) => run(() => api(`/tasks/${id}`, { method: 'PATCH', json: { status } })).then(reload);
  const next = t.status === 'OPEN' ? [['IN_PROGRESS', 'Anfangen'], ['DONE', 'Erledigt']] : t.status === 'IN_PROGRESS' ? [['DONE', 'Erledigt'], ['BLOCKED', 'Blockiert']] : t.status === 'BLOCKED' ? [['IN_PROGRESS', 'Weiter'], ['DONE', 'Erledigt']] : [['OPEN', 'Wieder öffnen']];
  return (
    <div className="stack-lg narrow-col wide">
      <Back href="/aufgaben" label="Aufgaben" />
      <article className="card article stack">
        <div className="chips"><span className={`chip ${t.status === 'DONE' ? 'ok' : 'info'}`}>{TASK_STATUS[t.status]}</span><span className="chip">{PRIORITY[t.priority]}</span></div>
        <h1>{t.title}</h1>
        <div className="row"><BookmarkButton contentId={t.id} /><ToAgenda path={`/aufgaben/${t.id}`} title={t.title} text={t.description ?? ''} /></div>
        <MeetingOrigin contentId={t.id} />
        <p className="small muted">Für {t.assignee} · von {t.author}{t.dueAt && ` · fällig ${dayTime(t.dueAt)}`}{t.completedAt && ` · erledigt ${dayTime(t.completedAt)}`}</p>
        {t.description && <div className="prose"><RichText text={t.description} /></div>}
        {t.canChange && (
          <div className="row wrap">
            {next.map(([s, l]) => <button key={s} className={`btn ${s === 'DONE' ? 'pri big' : ''}`} disabled={busy} onClick={() => set(s)}>{l}</button>)}
            {t.authorId === me?.user.id && !['DONE', 'CANCELLED'].includes(t.status) && <button className="btn warn" disabled={busy} onClick={() => set('CANCELLED')}>Abbrechen</button>}
          </div>
        )}
        <ErrorNote error={err} />
        <h2 className="h-sub">Rückfragen</h2>
        <Comments contentId={t.id} />
      </article>
      <ReadStatus contentId={t.id} />
    </div>
  );
}
