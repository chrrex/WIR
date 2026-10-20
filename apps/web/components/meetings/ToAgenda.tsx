'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';
import { Icon } from '../Icon';

type Target = { id: string; title: string; when: string };

/**
 * „Auf die Agenda setzen“ aus News, Übergaben, Ideen, Aufgaben, Checklisten-Mängeln und Chat (ADR-061):
 * Meeting wählen, Titel prüfen – der Punkt verweist zurück auf die Quelle.
 */
export function ToAgenda({ path, title, text = '', compact = false }: { path: string; title: string; text?: string; compact?: boolean }) {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [f, setF] = useState({ meeting: '', title, description: text });
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || targets) return;
    api<Target[]>('/meetings/targets').then((t) => { setTargets(t); setF((x) => ({ ...x, meeting: t[0]?.id ?? '' })); }).catch(() => setTargets([]));
  }, [open, targets]);
  if (!me?.modules.includes('MEETINGS')) return null;
  if (done) return <Link className="small" href={`/meetings/${done}`}>Steht auf der Agenda ✓</Link>;
  return (
    <>
      <button type="button" className={compact ? 'lnk small' : 'btn sm'} onClick={() => setOpen(true)}>{!compact && <Icon name="calendar" size={16} />}Auf die Agenda</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <form className="dialog" role="dialog" aria-label="Auf die Agenda setzen" onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault(); setErr(null);
              try { await api(`/meetings/${f.meeting}/items`, { method: 'POST', json: { title: f.title, description: f.description || null, sourcePath: path } }); setDone(f.meeting); setOpen(false); }
              catch (x) { setErr(x instanceof ApiError ? x.message : 'Hat nicht geklappt.'); }
            }}>
            <h2>Auf die Agenda setzen</h2>
            {targets === null ? <p className="muted">Lade …</p> : targets.length === 0 ? <p className="muted">Gerade steht kein Meeting an, zu dem du eingeladen bist.</p> : (
              <>
                <div className="field"><label htmlFor="ta-m">Meeting</label>
                  <select id="ta-m" className="input" value={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.value })}>{targets.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.when}</option>)}</select></div>
                <div className="field"><label htmlFor="ta-t">Punkt</label><input id="ta-t" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={160} /></div>
                <div className="field"><label htmlFor="ta-d">Worum geht es? (freiwillig)</label><textarea id="ta-d" className="input area" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
                <p className="xs muted">Der Punkt verlinkt hierher zurück.</p>
              </>
            )}
            {err && <div className="note warn small" role="alert">{err}</div>}
            <div className="row"><button type="button" className="btn" onClick={() => setOpen(false)}>Abbrechen</button>{!!targets?.length && <button className="btn pri">Eintragen</button>}</div>
          </form>
        </div>
      )}
    </>
  );
}

/** „Entstanden im Teammeeting Rezeption am …“ – auf Aufgaben, Wissen, News und Übergaben. */
export function MeetingOrigin({ contentId }: { contentId: string }) {
  const { me } = useMe();
  const [o, setO] = useState<{ meeting: string; on: string; item: string; decision: string | null; href: string | null } | null>(null);
  const on = !!me?.modules.includes('MEETINGS');
  useEffect(() => { if (on) api<{ origin: typeof o }>(`/meetings/origin/${contentId}`).then((r) => setO(r.origin)).catch(() => null); }, [contentId, on]);
  if (!o) return null;
  const label = <>Entstanden im <strong>{o.meeting}</strong> am {o.on} · „{o.decision ?? o.item}“</>;
  return <p className="note info small"><Icon name="calendar" size={16} /><span>{o.href ? <Link href={o.href}>{label}</Link> : label}</span></p>;
}
