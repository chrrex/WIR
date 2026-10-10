'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useBadges } from '@/lib/badges';
import { when } from '@/lib/time';
import { Icon } from './Icon';

interface N { id: string; title: string; body: string | null; linkPath: string | null; importance: string; createdAt: string; read: boolean }

export function Bell() {
  const { badges, refresh } = useBadges();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[] | null>(null);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    api<{ items: N[] }>('/notifications').then((r) => setItems(r.items)).catch(() => setItems([]));
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function go(n: N) {
    if (!n.read) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => null);
    setOpen(false);
    refresh();
    if (n.linkPath?.startsWith('/')) router.push(n.linkPath);
  }

  return (
    <div className="popwrap" ref={box}>
      <button className="iconbtn bell" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Benachrichtigungen${badges.notifications ? `, ${badges.notifications} neu` : ''}`}>
        <Icon name="bell" />
        {badges.notifications > 0 && <span className="dot">{badges.notifications > 99 ? '99+' : badges.notifications}</span>}
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Benachrichtigungen">
          <div className="row between pop-head">
            <strong>Benachrichtigungen</strong>
            <button className="lnk small" onClick={async () => { await api('/notifications/read-all', { method: 'POST' }); setItems((i) => i?.map((x) => ({ ...x, read: true })) ?? null); refresh(); }}>Alle gelesen</button>
          </div>
          {items === null ? <div className="empty">Lade …</div> : items.length === 0 ? <div className="empty">Alles ruhig.</div> : (
            <ul className="plain">
              {items.map((n) => (
                <li key={n.id}>
                  <button className={`notif ${n.read ? 'read' : ''}`} onClick={() => go(n)}>
                    <span className={`udot ${n.read ? 'off' : n.importance === 'IMPORTANT' ? 'warn' : ''}`} aria-hidden="true" />
                    <span className="grow"><span className="block">{n.title}</span>{n.body && <span className="small muted block">{n.body}</span>}<span className="xs muted">{when(n.createdAt)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="xs muted pop-foot">Push aufs Handy und eigene Ruhezeiten kommen mit der App-Installation (Phase 6).</p>
        </div>
      )}
    </div>
  );
}
