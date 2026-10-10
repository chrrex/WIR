'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface Person { id: string; name: string; job?: string | null }

/**
 * Textfeld mit @Erwähnungen: Nach „@“ und ein paar Buchstaben erscheinen passende Personen.
 * `source` liefert nur Personen, die den Inhalt auch sehen dürfen.
 */
export function MentionText({ id, value, onChange, mentions, onMentions, source, placeholder, rows = 3, label }: {
  id: string; value: string; onChange: (v: string) => void; mentions: Person[]; onMentions: (p: Person[]) => void;
  source: (q: string) => string; placeholder?: string; rows?: number; label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [hits, setHits] = useState<Person[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (query === null || query.length < 1) { setHits([]); return; }
    const t = setTimeout(() => { api<Person[]>(source(query)).then((r) => { setHits(r.slice(0, 6)); setActive(0); }).catch(() => setHits([])); }, 150);
    return () => clearTimeout(t);
  }, [query, source]);

  function onInput(v: string) {
    onChange(v);
    const pos = ref.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([\p{L}.\-]{0,30})$/u.exec(v.slice(0, pos));
    setQuery(m ? m[2] : null);
    onMentions(mentions.filter((p) => v.includes(`@${p.name}`)));
  }

  function pick(p: Person) {
    const el = ref.current;
    const pos = el?.selectionStart ?? value.length;
    const before = value.slice(0, pos).replace(/@([\p{L}.\-]{0,30})$/u, `@${p.name} `);
    const next = before + value.slice(pos);
    onChange(next);
    if (!mentions.some((m) => m.id === p.id)) onMentions([...mentions, p]);
    setQuery(null); setHits([]);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }

  return (
    <div className="mention-wrap">
      <label htmlFor={id} className="sr">{label}</label>
      <textarea id={id} ref={ref} className="input area" rows={rows} value={value} placeholder={placeholder}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (!hits.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
          if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(hits[active]); }
          if (e.key === 'Escape') { setHits([]); setQuery(null); }
        }}
        aria-autocomplete="list" aria-controls={hits.length ? `${id}-list` : undefined} />
      {hits.length > 0 && (
        <ul className="mention-list" id={`${id}-list`} role="listbox" aria-label="Personen erwähnen">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(h); }}>{h.name}{h.job ? <span className="muted small"> · {h.job}</span> : null}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text mit hervorgehobenen @Erwähnungen und Absätzen. */
export function RichText({ text, mentions = [] }: { text: string; mentions?: Array<{ name: string }> }) {
  const names = mentions.map((m) => m.name).sort((a, b) => b.length - a.length);
  const paras = text.split(/\n{2,}/);
  return (
    <>
      {paras.map((p, i) => {
        if (!names.length) return <p key={i}>{p}</p>;
        const re = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
        return <p key={i}>{p.split(re).map((part, j) => (part.startsWith('@') && names.includes(part.slice(1)) ? <span key={j} className="mention">{part}</span> : part))}</p>;
      })}
    </>
  );
}
