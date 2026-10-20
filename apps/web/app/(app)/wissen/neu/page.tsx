'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useFromMeeting } from '@/lib/meetings';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Audience, AudienceOption, Back, ErrorNote, useSubmit } from '@/components/work';
import { TYPE_LABEL } from '@/lib/labels';

interface Opts { categories: Array<{ id: string; name: string }>; types: string[]; audiences: AudienceOption[]; publishesDirectly: boolean }

function Editor() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('id');
  const mode = params.get('mode'); // review | resubmit | null (neue Version)
  const meeting = useFromMeeting();
  const { can } = useMe();
  const [o, setO] = useState<Opts | null>(null);
  const [f, setF] = useState({ title: meeting.title, text: meeting.text, plainText: '', changeSummary: '', categoryId: '', articleType: 'SOP', requiresAck: false, notify: true });
  const [audience, setAudience] = useState<string[]>([]);
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    api<Opts>('/knowledge/options').then((r) => { setO(r); if (!editId) setF((x) => ({ ...x, categoryId: r.categories[0]?.id ?? '' })); }).catch(() => null);
    if (editId) api<{ title: string; text: string; plainText: string | null; categoryId: string }>(`/knowledge/${editId}`).then((a) => setF((x) => ({ ...x, title: a.title, text: a.text, plainText: a.plainText ?? '', categoryId: a.categoryId })));
  }, [editId]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: f.title, text: f.text, plainText: f.plainText || null, categoryId: f.categoryId || undefined };
    const r = await run(() => (mode === 'review' ? api(`/knowledge/${editId}/review`, { method: 'POST', json: { approve: true, correction: body } })
      : mode === 'resubmit' ? api(`/knowledge/${editId}/resubmit`, { method: 'POST', json: body })
      : editId ? api(`/knowledge/${editId}`, { method: 'PUT', json: { ...body, changeSummary: f.changeSummary || null, notify: f.notify } })
      : api<{ id: string }>('/knowledge', { method: 'POST', json: { ...f, plainText: f.plainText || null, changeSummary: null, audience } })));
    if (r && !editId) await meeting.link({ contentItemId: (r as { id: string }).id });
    if (r) router.replace(`/wissen/${editId ?? (r as { id: string }).id}`);
  }

  return (
    <form className="stack-lg narrow-col wide" onSubmit={submit}>
      <Back href={editId ? `/wissen/${editId}` : '/wissen'} label="Zurück" />
      <h1>{mode === 'review' ? 'Korrigieren und freigeben' : mode === 'resubmit' ? 'Überarbeiten' : editId ? 'Neue Version' : 'Neuer Eintrag'}</h1>
      <section className="card stack">
        {o && (
          <div className="row wrap">
            <div className="field grow"><label htmlFor="c">Kategorie</label><select id="c" className="input" value={f.categoryId} onChange={set('categoryId')}>{o.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            {!editId && <div className="field grow"><label htmlFor="t">Art</label><select id="t" className="input" value={f.articleType} onChange={set('articleType')}>{o.types.map((t) => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}</option>)}</select></div>}
          </div>
        )}
        <div className="field"><label htmlFor="ti">Titel</label><input id="ti" className="input" value={f.title} onChange={set('title')} required maxLength={160} /></div>
        <div className="field"><label htmlFor="tx">Text</label><textarea id="tx" className="input area" rows={14} value={f.text} onChange={set('text')} required placeholder="Absätze mit einer Leerzeile trennen." /></div>
        <div className="field"><label htmlFor="pl">Einfache Sprache (freiwillig)</label><textarea id="pl" className="input area" rows={4} value={f.plainText} onChange={set('plainText')} placeholder="Kurz, klare Sätze – hilft Azubis und Kolleg:innen mit wenig Deutsch." /></div>
        {editId && !mode && <div className="field"><label htmlFor="cs">Was hat sich geändert?</label><input id="cs" className="input" value={f.changeSummary} onChange={set('changeSummary')} maxLength={300} /></div>}
        {editId && !mode && <label className="check"><input type="checkbox" checked={f.notify} onChange={set('notify')} />Alle Leser:innen über die neue Version informieren</label>}
      </section>
      {!editId && o && (
        <section className="card stack">
          <Audience options={o.audiences} value={audience} onChange={setAudience} />
          {!o.publishesDirectly && <p className="small muted">Deine Teamleitung prüft den Eintrag und gibt ihn frei – oder meldet sich mit Korrekturen.</p>}
          {can('knowledge.require_acknowledgement') && <label className="check"><input type="checkbox" checked={f.requiresAck} onChange={set('requiresAck')} />„Gelesen und verstanden“ verlangen (z. B. HACCP-Unterweisung)</label>}
        </section>
      )}
      <ErrorNote error={error} />
      <div className="row"><button className="btn pri big" disabled={busy || !f.title || !f.text || (!editId && !audience.length)}>{busy ? 'Speichere …' : mode === 'review' ? 'Freigeben' : mode === 'resubmit' || (!editId && o && !o.publishesDirectly) ? 'Zur Prüfung einreichen' : 'Veröffentlichen'}</button></div>
    </form>
  );
}

export default function Page() { return <Suspense><Editor /></Suspense>; }
