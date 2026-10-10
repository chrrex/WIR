'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, Branding } from '@/lib/api';
import { applyBranding } from '@/lib/brand';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/Icon';

export default function LoginPage() {
  const router = useRouter();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Branding>('/branding/default').then((b) => { setBranding(b); applyBranding(b); }).catch(() => null);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = mode === 'password'
        ? await api<{ mustChangePassword: boolean }>('/auth/login', { method: 'POST', json: { username: fd.get('username'), password: fd.get('password') } })
        : await api<{ mustChangePassword: boolean }>('/auth/code', { method: 'POST', json: { username: fd.get('username'), code: fd.get('code') } });
      router.replace(res.mustChangePassword ? '/passwort' : '/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Die Anmeldung hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="hero">
        <Logo branding={branding} variant="hero" />
        <div>
          <div className="hero-wm">WIR · Das Mitarbeiterportal</div>
          <h1>Alles fürs Team.<br />An einem Ort.</h1>
          <p>News, Übergaben, Wissen und Chat – auf dem Handy in der Schicht und am Laptop im Büro.</p>
        </div>
        <div className="small">{branding?.footerText}</div>
      </section>

      <section className="pane">
        <div>
          <div className="eyebrow">Anmelden</div>
          <h2>{mode === 'password' ? 'Willkommen zurück' : 'Erster Zugang mit Einmal-Code'}</h2>
          <p className="muted">
            {mode === 'password'
              ? 'Mit deinem Benutzernamen und deinem Passwort – ganz ohne dienstliche E-Mail.'
              : 'Den Code bekommst du persönlich von deiner Leitung oder aus der Verwaltung. Danach vergibst du dein eigenes Passwort.'}
          </p>
        </div>

        <form className="stack" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="username">Benutzername</label>
            <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required />
          </div>
          {mode === 'password' ? (
            <div className="field">
              <label htmlFor="password">Passwort</label>
              <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
            </div>
          ) : (
            <div className="field">
              <label htmlFor="code">Einmal-Code</label>
              <input id="code" name="code" className="input code" inputMode="numeric" autoComplete="one-time-code" placeholder="123 456" required />
            </div>
          )}
          {error && <div className="note warn" role="alert"><Icon name="lock" size={18} />{error}</div>}
          <button className="btn pri big" type="submit" disabled={busy}>
            {busy ? 'Einen Moment …' : 'Anmelden'} <Icon name="arrow" size={18} />
          </button>
        </form>

        <button className="lnk" type="button" onClick={() => { setMode(mode === 'password' ? 'code' : 'password'); setError(null); }}>
          {mode === 'password' ? 'Ich habe einen Einmal-Code (erster Zugang oder Passwort vergessen)' : 'Zurück zur Anmeldung mit Passwort'}
        </button>
      </section>
    </div>
  );
}
