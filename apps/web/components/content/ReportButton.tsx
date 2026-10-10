'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Icon } from '../Icon';

/** Melden an das Moderationsteam – die meldende Person bleibt anonym. */
export function ReportButton({ path, compact = false }: { path: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [reason, setReason] = useState('');
  if (done) return <span className="small muted">Gemeldet – danke!</span>;
  return (
    <>
      <button className={compact ? 'lnk small' : 'btn sm'} onClick={() => setOpen(true)}>{!compact && <Icon name="flag" size={16} />}Melden</button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <form className="dialog" role="dialog" aria-label="Beitrag melden" onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => { e.preventDefault(); await api(path, { method: 'POST', json: { reason } }).catch(() => null); setDone(true); setOpen(false); }}>
            <h2>Melden</h2>
            <p className="muted small">Das Moderationsteam schaut sich den Beitrag an. Dein Name wird dabei nicht angezeigt.</p>
            <label className="label" htmlFor="reason">Was ist das Problem?</label>
            <textarea id="reason" className="input area" rows={3} minLength={3} required value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="row"><button type="button" className="btn" onClick={() => setOpen(false)}>Abbrechen</button><button className="btn pri">Melden</button></div>
          </form>
        </div>
      )}
    </>
  );
}
