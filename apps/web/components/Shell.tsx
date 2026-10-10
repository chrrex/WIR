'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import { NAV } from '@/lib/nav';
import { Icon } from './Icon';
import { Logo, Wordmark } from './Logo';

const DEFAULT_MOBILE = ['/', '/news', '/uebergaben', '/chat'];

export function Shell({ children }: { children: React.ReactNode }) {
  const { me, can } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);

  if (!me) {
    return <div className="loading" role="status">WIR wird geladen …</div>;
  }

  const items = NAV.filter((n) => !n.module || me.modules.includes(n.module));
  const isAdmin = can('users.read') || can('audit.read');
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const preferred = me.settings?.mobileNavItems?.length ? me.settings.mobileNavItems : DEFAULT_MOBILE;
  const mobileItems = preferred.map((h) => items.find((i) => i.href === h)).filter(Boolean).slice(0, 4) as typeof items;
  const initials = (me.profile ? me.profile.firstName[0] + me.profile.lastName[0] : me.user.displayName.slice(0, 2)).toUpperCase();

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/anmelden');
  }

  return (
    <div className="app">
      <nav className="side" aria-label="Hauptnavigation">
        <div className="brandbox">
          <Logo branding={me.branding} variant="side" />
          <Wordmark />
        </div>
        <div className="nav">
          {items.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </Link>
          ))}
          {isAdmin && (
            <Link href="/verwaltung" className="nav-admin" aria-current={active('/verwaltung') ? 'page' : undefined}>
              <Icon name="admin" />
              <span>Verwaltung</span>
            </Link>
          )}
        </div>
        <div className="foot">{me.branding?.footerText}</div>
      </nav>

      <div className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <Logo branding={me.branding} variant="head" />
            <Wordmark compact />
          </div>
          <div className="search" role="search">
            <Icon name="search" />
            <label htmlFor="q" className="sr">Suchen</label>
            <input id="q" placeholder="Suche und KI-Assistent kommen in Phase 3" disabled />
          </div>
          <Link className="avatar" href="/einstellungen" aria-label={`Einstellungen von ${me.user.displayName}`}>{initials}</Link>
          <button className="iconbtn" onClick={logout} aria-label="Abmelden" title="Abmelden"><Icon name="logout" /></button>
        </header>
        <main className="content" id="inhalt">{children}</main>
      </div>

      <nav className="bnav" aria-label="Hauptnavigation (mobil)" style={{ gridTemplateColumns: `repeat(${mobileItems.length + 1}, minmax(0, 1fr))` }}>
        {mobileItems.map((n) => (
          <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined}>
            <span className="pill"><Icon name={n.icon} size={22} /></span>
            {n.label.split(' ')[0]}
          </Link>
        ))}
        <button onClick={() => setMore(true)} aria-haspopup="dialog">
          <span className="pill"><Icon name="menu" size={22} /></span>Mehr
        </button>
      </nav>

      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="sheet" role="dialog" aria-label="Alle Bereiche" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>Alle Bereiche</strong>
              <button className="iconbtn" onClick={() => setMore(false)} aria-label="Schließen"><Icon name="x" /></button>
            </div>
            <div className="sheet-grid">
              {items.map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMore(false)}><Icon name={n.icon} />{n.label}</Link>
              ))}
              {isAdmin && <Link href="/verwaltung" onClick={() => setMore(false)}><Icon name="admin" />Verwaltung</Link>}
              <Link href="/einstellungen" onClick={() => setMore(false)}><Icon name="settings" />Einstellungen</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
