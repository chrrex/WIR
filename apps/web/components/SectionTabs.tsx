'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from '@/lib/me';
import { navFor } from '@/lib/nav';

/** Reiter für zusammengefasste Menüpunkte, z. B. Wissen & SOPs | Dokumente (ADR-059). */
export function SectionTabs() {
  const { me } = useMe();
  const path = usePathname();
  const item = me && navFor(me).find((n) => n.sub && n.paths.some((p) => path.startsWith(p)));
  if (!item?.sub || item.sub.length < 2) return null;
  return (
    <nav className="tabs" aria-label={item.label}>
      {item.sub.map((s) => <Link key={s.href} href={s.href} aria-current={path.startsWith(s.href) ? 'page' : undefined}>{s.label}</Link>)}
    </nav>
  );
}
