'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { State, useLoad, day } from '@/components/work';

interface Mark { id: string; type: string; title: string; href: string; savedAt: string }
const KIND: Record<string, string> = { NEWS: 'News', SOCIAL: 'Social', HANDOVER: 'Übergabe', KNOWLEDGE_ARTICLE: 'Wissen', DOCUMENT: 'Dokument', TASK: 'Aufgabe', SURVEY: 'Umfrage', IDEA: 'Idee', CHECKLIST_RUN: 'Checkliste' };

/** Gemerkt: eigene Lesezeichen – sieht niemand sonst. */
export default function Bookmarks() {
  const { data, error, reload } = useLoad<Mark[]>('/bookmarks');
  if (!data) return <State error={error} loading />;
  return (
    <div className="stack-lg">
      <div className="ptitle"><h1>Gemerkt</h1></div>
      <p className="muted">Was du mit „Merken“ markiert hast – nur für dich sichtbar.</p>
      {data.length === 0 ? <div className="card empty">Noch nichts gemerkt. Bei News, Wissen, Dokumenten und Co. findest du den Knopf „Merken“.</div> : (
        <div className="list">
          {data.map((m) => (
            <div key={m.id} className="card listitem">
              <Link href={m.href} className="grow title-link">
                <span className="row wrap gap-s"><span className="chip info">{KIND[m.type] ?? m.type}</span><strong className="title">{m.title}</strong></span>
                <span className="block muted small">gemerkt am {day(m.savedAt)}</span>
              </Link>
              <button className="btn sm" aria-label={`„${m.title}“ nicht mehr merken`} onClick={() => api(`/content/${m.id}/bookmark`, { method: 'POST' }).then(reload)}>Entfernen</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
