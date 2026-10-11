'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface DemoUser { id: string; username: string; name: string; job: string | null; company: string | null; roles: string[] }

function useDemoUsers() {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  useEffect(() => { api<DemoUser[]>('/auth/demo').then(setUsers).catch(() => setUsers(null)); }, []);
  return users;
}

async function switchTo(id: string) {
  await api('/auth/demo/login', { method: 'POST', json: { userId: id } });
  window.location.assign('/'); // komplett neu laden: Rechte, Auftritt, Zähler
}

const label = (u: DemoUser) => [u.job, ...u.roles].filter(Boolean).join(' · ');

/** Demo-Modus (ADR-047): Personen per Klick wechseln. Erscheint nur, wenn der Server ihn anbietet. */
export function DemoLogin() {
  const users = useDemoUsers();
  if (!users?.length) return null;
  return (
    <section className="demo-box stack-s" aria-labelledby="demo-h">
      <h3 id="demo-h">Demo-Modus: als Person ansehen</h3>
      <p className="small">Nur Testdaten – ohne Passwort. Im Echtbetrieb gibt es diese Auswahl nicht.</p>
      <div className="demo-list">
        {users.map((u) => (
          <button key={u.id} type="button" className="demo-user" onClick={() => switchTo(u.id)}>
            <strong>{u.name}</strong><span className="xs">{label(u) || u.username}{u.company && u.company !== 'SGL' ? ` · ${u.company}` : ''}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function DemoBar({ currentId }: { currentId: string }) {
  const users = useDemoUsers();
  if (!users?.length) return null;
  return (
    <div className="demo-bar" role="region" aria-label="Demo-Modus">
      <strong>Demo-Modus</strong>
      <label htmlFor="demo-sel" className="sr">Person wechseln</label>
      <select id="demo-sel" value={currentId} onChange={(e) => switchTo(e.target.value)}>
        {users.map((u) => <option key={u.id} value={u.id}>{u.name}{label(u) ? ` – ${label(u)}` : ''}</option>)}
      </select>
      <span className="small">Nur Testdaten</span>
    </div>
  );
}
