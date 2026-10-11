'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { ErrorNote, useSubmit } from '@/components/work';

const b64 = (s: string) => Uint8Array.from(atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Push aufs Handy ein-/ausschalten und Ruhezeiten festlegen (ADR-043). */
export function PushSettings() {
  const { me, refresh } = useMe();
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'denied' | null>(null);
  const [quiet, setQuiet] = useState({ start: me?.settings?.quietHoursStart ?? '21:00', end: me?.settings?.quietHoursEnd ?? '07:00', on: !!me?.settings?.quietHoursStart });
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    navigator.serviceWorker.register('/sw.js').then((r) => r.pushManager.getSubscription()).then((s) => setState(s ? 'on' : 'off')).catch(() => setState('unsupported'));
  }, []);

  const enable = () => run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') { setState('denied'); return; }
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await api<{ publicKey: string }>('/notifications/push/key');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
    await api('/notifications/push/subscriptions', { method: 'POST', json: sub.toJSON() });
    setState('on');
  });
  const disable = () => run(async () => {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (sub) { await api('/notifications/push/subscriptions', { method: 'DELETE', json: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
    setState('off');
  });
  const saveQuiet = (q: typeof quiet) => { setQuiet(q); run(() => api('/me/settings', { method: 'PATCH', json: { quietHoursStart: q.on ? q.start : null, quietHoursEnd: q.on ? q.end : null } }).then(refresh)); };

  return (
    <section className="card stack">
      <h2>Benachrichtigungen aufs Handy</h2>
      {state === 'unsupported' && <p className="muted small">Dieser Browser kann keine Push-Nachrichten. Auf dem iPhone: WIR erst über „Teilen → Zum Home-Bildschirm“ installieren, dann hier einschalten.</p>}
      {state === 'denied' && <p className="muted small">Benachrichtigungen sind im Browser blockiert. Du kannst sie in den Browser-Einstellungen für diese Seite wieder erlauben.</p>}
      {state === 'off' && <div><button className="btn pri" disabled={busy} onClick={enable}>Auf diesem Gerät einschalten</button></div>}
      {state === 'on' && <div className="row wrap"><span className="chip ok">Auf diesem Gerät an</span><button className="btn sm" disabled={busy} onClick={disable}>Ausschalten</button></div>}
      <p className="small muted">Du bekommst dieselben Hinweise wie in der Glocke – aus dem Chat nie mit Nachrichtentext.</p>
      <label className="check"><input type="checkbox" checked={quiet.on} onChange={(e) => saveQuiet({ ...quiet, on: e.target.checked })} />Ruhezeit: in dieser Zeit kein Push (in der App bleibt alles sichtbar)</label>
      {quiet.on && (
        <div className="row wrap">
          <label className="field">von<input type="time" className="input sm" value={quiet.start} onChange={(e) => saveQuiet({ ...quiet, start: e.target.value })} /></label>
          <label className="field">bis<input type="time" className="input sm" value={quiet.end} onChange={(e) => saveQuiet({ ...quiet, end: e.target.value })} /></label>
        </div>
      )}
      <ErrorNote error={error} />
    </section>
  );
}
