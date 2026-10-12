'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/me';
import { navFor } from '@/lib/nav';
import { Icon } from '@/components/Icon';
import { PushSettings } from '@/components/PushSettings';
import { ProfileSettings } from '@/components/ProfileSettings';
import { MyThanks } from '@/components/MyThanks';
import { LanguageSettings } from '@/components/LanguageSettings';
import { CelebrateSettings } from '@/components/CelebrateSettings';

export default function SettingsPage() {
  const { me, refresh } = useMe();
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me || !me.settings) return null;
  const s = me.settings;

  async function save(patch: Record<string, unknown>, label: string) {
    setError(null);
    try {
      await api('/me/settings', { method: 'PATCH', json: patch });
      await refresh();
      setSaved(label);
      setTimeout(() => setSaved(null), 2500);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Speichern hat nicht geklappt.'); }
  }

  const navChoices = navFor(me);
  const currentNav = s.mobileNavItems.length ? s.mobileNavItems : ['/', '/news', '/uebergaben', '/chat'].filter((h) => navChoices.some((n) => n.href === h));

  async function saveRecovery(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('email') ?? '').trim();
    setError(null);
    try { await api('/me/recovery-email', { method: 'PUT', json: { email: v || null } }); await refresh(); setSaved('Private E-Mail gespeichert'); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Bitte prüf die E-Mail-Adresse.'); }
  }

  return (
    <div className="stack-lg narrow-col">
      <div className="ptitle"><h1>Einstellungen</h1></div>
      <ProfileSettings />
      <MyThanks />
      {saved && <div className="note ok" role="status"><Icon name="check" size={18} />{saved}</div>}
      {error && <div className="note warn" role="alert">{error}</div>}

      <LanguageSettings save={save} />
      <CelebrateSettings save={save} />
      <section className="card stack">
        <h2>Darstellung & Barrierefreiheit</h2>
        <div className="field">
          <span className="label">Farbschema</span>
          <div className="seg" role="group" aria-label="Farbschema">
            {(['SYSTEM', 'LIGHT', 'DARK'] as const).map((t) => (
              <button key={t} aria-pressed={s.theme === t} onClick={() => save({ theme: t }, 'Farbschema gespeichert')}>
                {t === 'SYSTEM' ? 'Wie Gerät' : t === 'LIGHT' ? 'Hell' : 'Dunkel'}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="fs">Schriftgröße: {s.fontScalePercent} %</label>
          <input id="fs" type="range" min={90} max={150} step={10} defaultValue={s.fontScalePercent}
            onChange={(e) => save({ fontScalePercent: Number(e.target.value) }, 'Schriftgröße gespeichert')} />
        </div>
        <label className="check">
          <input type="checkbox" checked={s.reducedMotion} onChange={(e) => save({ reducedMotion: e.target.checked }, 'Gespeichert')} />
          Weniger Bewegung und Animationen
        </label>
      </section>

      <PushSettings />

      <section className="card stack">
        <h2>Untere Leiste auf dem Handy</h2>
        <p className="muted small">Wähle bis zu vier Bereiche. „Mehr“ ist immer dabei.</p>
        <div className="chips">
          {navChoices.map((n) => {
            const on = n.paths.some((h) => currentNav.includes(h));
            return (
              <label key={n.href} className={`fchip ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} disabled={!on && currentNav.length >= 4}
                  onChange={() => save({ mobileNavItems: on ? currentNav.filter((h) => !n.paths.includes(h)) : [...currentNav, n.href] }, 'Leiste gespeichert')} />
                {n.label}
              </label>
            );
          })}
        </div>
      </section>

      <section className="card stack">
        <h2>Passwort vergessen? Private E-Mail (freiwillig)</h2>
        <p className="muted small">Nur für „Passwort vergessen“. Sie erscheint nirgends und wird nie für Benachrichtigungen genutzt. Ohne E-Mail hilft dir deine Leitung mit einem Einmal-Code.</p>
        <form className="row wrap" onSubmit={saveRecovery}>
          <label htmlFor="email" className="sr">Private E-Mail</label>
          <input id="email" name="email" type="email" className="input grow" placeholder={me.user.hasRecoveryEmail ? 'hinterlegt – zum Ändern neu eingeben' : 'name@beispiel.de'} />
          <button className="btn">Speichern</button>
        </form>
      </section>

      <section className="card stack">
        <h2>Sicherheit</h2>
        <Link className="btn" href="/passwort"><Icon name="key" size={18} />Passwort ändern</Link>
      </section>
    </div>
  );
}
