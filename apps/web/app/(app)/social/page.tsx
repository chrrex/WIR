'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { CATEGORIES, SocialPost } from '@/lib/social';
import { SocialCard } from '@/components/content/SocialCard';
import { Icon } from '@/components/Icon';

export default function SocialFeed() {
  const { can } = useMe();
  const [cat, setCat] = useState<string>('');
  const [rows, setRows] = useState<SocialPost[] | null>(null);
  const load = useCallback(() => { api<SocialPost[]>(`/social${cat ? `?category=${cat}` : ''}`).then(setRows).catch(() => setRows([])); }, [cat]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <div className="stack-lg feed-col">
      <div className="ptitle">
        <div><h1>Social</h1><p className="muted small">Privates unter Kolleg:innen – freiwillig, ohne Lesestatus.</p></div>
        {can('social.post') && <Link className="btn pri" href="/social/neu"><Icon name="plus" size={18} />Beitrag</Link>}
      </div>
      <div className="chips" role="group" aria-label="Kategorie">
        <button className={`fchip ${!cat ? 'on' : ''}`} aria-pressed={!cat} onClick={() => setCat('')}>Alles</button>
        {Object.entries(CATEGORIES).map(([k, l]) => <button key={k} className={`fchip ${cat === k ? 'on' : ''}`} aria-pressed={cat === k} onClick={() => setCat(k)}>{l}</button>)}
      </div>
      {rows === null ? <div className="card empty">Lade …</div> : rows.length === 0 ? <div className="card empty">Hier ist es noch ruhig. Magst du den Anfang machen?</div>
        : rows.map((p) => <SocialCard key={p.id} p={p} onChange={load} />)}
    </div>
  );
}
