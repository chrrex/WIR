'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { MeProvider, useMe } from '@/lib/me';
import { Logo, Wordmark } from '@/components/Logo';
import { Icon } from '@/components/Icon';

function PasswordForm() {
  const { me } = useMe();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return <div className="loading" role="status">Einen Moment …</div>;
  const first = me.user.mustChangePassword;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get('pw') ?? '');
    if (pw !== String(fd.get('pw2') ?? '')) { setError('Die beiden Passwörter stimmen nicht überein.'); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/password', { method: 'POST', json: { newPassword: pw, currentPassword: first ? undefined : fd.get('current') } });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Das hat nicht geklappt.');
    } finally { setBusy(false); }
  }

  return (
    <div className="center-page">
      <div className="card narrow stack">
        <div className="brandband"><Logo branding={me.branding} variant="head" /><Wordmark compact /></div>
        <div>
          <div className="eyebrow">{first ? 'Fast geschafft' : 'Passwort ändern'}</div>
          <h1>{first ? `Hallo ${me.profile?.firstName ?? me.user.displayName}, vergib dein Passwort` : 'Neues Passwort'}</h1>
          <p className="muted">Mindestens 10 Zeichen. Am besten ein Satz, den du dir gut merken kannst – zum Beispiel „Sommer im Schlosspark 7“.</p>
        </div>
        <form className="stack" onSubmit={submit}>
          {!first && (
            <div className="field"><label htmlFor="current">Aktuelles Passwort</label>
              <input id="current" name="current" type="password" className="input" autoComplete="current-password" required /></div>
          )}
          <div className="field"><label htmlFor="pw">Neues Passwort</label>
            <input id="pw" name="pw" type="password" className="input" autoComplete="new-password" minLength={10} required /></div>
          <div className="field"><label htmlFor="pw2">Neues Passwort wiederholen</label>
            <input id="pw2" name="pw2" type="password" className="input" autoComplete="new-password" minLength={10} required /></div>
          {error && <div className="note warn" role="alert"><Icon name="lock" size={18} />{error}</div>}
          <button className="btn pri big" disabled={busy}>{busy ? 'Speichere …' : 'Passwort speichern'}</button>
        </form>
      </div>
    </div>
  );
}

export default function PasswordPage() {
  return <MeProvider><PasswordForm /></MeProvider>;
}
