'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export interface Reaction { type: string; count: number; mine: boolean; names: string[] }
export const EMOJI: Array<[string, string, string]> = [['THUMBS_UP', '👍', 'Daumen hoch'], ['THUMBS_DOWN', '👎', 'Daumen runter'], ['HEART', '❤️', 'Herz'], ['CELEBRATE', '🎉', 'Feiern']];

/** Reaktionen als Pillen plus kleiner Knopf zum Reagieren – für Chat, News und Social (ADR-048). */
export function Reactions({ reactions, onToggle }: { reactions: Reaction[]; onToggle: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reacts">
      {reactions.map((r) => { const e = EMOJI.find((x) => x[0] === r.type)!; return (
        <button key={r.type} className={`react ${r.mine ? 'on' : ''}`} aria-pressed={r.mine} title={r.names.join(', ')} aria-label={`${e[2]}: ${r.count} (${r.names.join(', ')})`} onClick={() => onToggle(r.type)}>{e[1]} {r.count}</button>
      ); })}
      {open ? (
        <span className="react-pick" role="group" aria-label="Reaktion wählen">
          {EMOJI.map(([type, e, label]) => <button key={type} className="react" aria-label={label} title={label} onClick={() => { onToggle(type); setOpen(false); }}>{e}</button>)}
        </span>
      ) : <button className="react add" aria-label="Reagieren" title="Reagieren" onClick={() => setOpen(true)}>☺︎+</button>}
    </div>
  );
}

/** Reaktionen an einem Beitrag (News, Social) – hält den Stand selbst. */
export function ContentReactions({ contentId, initial }: { contentId: string; initial: Reaction[] }) {
  const [rs, setRs] = useState(initial);
  return <Reactions reactions={rs} onToggle={(type) => api<{ reactions: Reaction[] }>(`/content/${contentId}/reactions`, { method: 'POST', json: { type } }).then((r) => setRs(r.reactions)).catch(() => null)} />;
}

/** Kurzform für Listen: „👍 3 ❤️ 1“ */
export const reactionSummary = (rs: Reaction[] = []) => rs.map((r) => `${EMOJI.find((e) => e[0] === r.type)?.[1]} ${r.count}`).join(' ');
