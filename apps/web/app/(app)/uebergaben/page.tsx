'use client';

import { scheduledText } from '@/components/content/Extras';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { when } from '@/lib/time';
import { Icon } from '@/components/Icon';
import { ReadChip, useReadCounts } from '@/components/content/ReadStatus';

interface Row { id: string; subject: string; excerpt: string; group: string; groupId: string; shiftLabel: string | null; author: string; publishedAt: string; read: boolean; mine: boolean; hasPoll: boolean; scheduledFor: string | null; comments: number; images: unknown[] }

export default function Handovers() {
  const { can, me } = useMe();
  const [group, setGroup] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { setRows(null); api<Row[]>(`/handovers${group ? `?group=${group}` : ''}`).then(setRows).catch(() => setRows([])); }, [group]);
  const groups = me?.groups ?? [];

  const counts = useReadCounts((rows ?? []).map((r) => r.id));
  return (
    <div className="stack-lg">
      <div className="ptitle">
        <h1>Übergaben</h1>
        {can('handovers.create') && <Link className="btn pri" href="/uebergaben/neu"><Icon name="plus" size={18} />Übergabe schreiben</Link>}
      </div>
      {groups.length > 1 && (
        <div className="chips" role="group" aria-label="Team">
          <button className={`fchip ${!group ? 'on' : ''}`} aria-pressed={!group} onClick={() => setGroup('')}>Alle meine Teams</button>
          {groups.map((g) => <button key={g.id} className={`fchip ${group === g.id ? 'on' : ''}`} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>{g.name}</button>)}
        </div>
      )}
      {rows === null ? <div className="card empty">Lade …</div> : rows.length === 0 ? <div className="card empty">Noch keine Übergaben für dein Team.</div> : (
        <div className="list">
          {rows.map((h) => (
            <Link key={h.id} href={`/uebergaben/${h.id}`} className={`card listitem ${h.read || h.mine ? '' : 'unread'}`}>
              <span className={`udot ${h.read || h.mine ? 'off' : ''}`} aria-label={h.read || h.mine ? undefined : 'ungelesen'} />
              <span className="grow">
                <span className="row wrap gap-s"><span className="chip info">{h.shiftLabel ?? 'Schicht'}</span><span className="chip">{h.group}</span>{h.scheduledFor && <span className="chip info">{scheduledText(h.scheduledFor)}</span>}{h.hasPoll && <span className="chip">Abstimmung</span>}<strong className="title">{h.subject}</strong></span>
                <span className="block muted small">{h.author}{h.publishedAt && ` · ${when(h.publishedAt)}`} <ReadChip c={counts[h.id]} /></span>
                <span className="block excerpt">{h.excerpt}</span>
                {(h.comments > 0 || h.images.length > 0) && <span className="block xs muted">{h.comments > 0 && `${h.comments} Antwort${h.comments === 1 ? '' : 'en'}`}{h.comments > 0 && h.images.length > 0 && ' · '}{h.images.length > 0 && `${h.images.length} Foto${h.images.length === 1 ? '' : 's'}`}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
