'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NAV } from '@/lib/nav';
import { useMe } from '@/lib/me';
import { Icon } from '@/components/Icon';

/** Bereiche, deren Inhalte in späteren Phasen folgen – mit freundlichem Hinweis statt Fehlerseite. */
export default function ComingSoon() {
  const { bereich } = useParams<{ bereich: string }>();
  const { me } = useMe();
  const item = NAV.find((n) => n.href === `/${bereich}`);
  if (!me) return null;
  if (!item || (item.module && !me.modules.includes(item.module))) {
    return (
      <div className="card narrow stack">
        <h1>Diesen Bereich gibt es für dich nicht</h1>
        <p className="muted">Entweder ist die Adresse falsch oder der Bereich ist für deine Rolle bzw. Gesellschaft nicht freigeschaltet.</p>
        <Link className="btn" href="/">Zur Startseite</Link>
      </div>
    );
  }
  return (
    <div className="card narrow stack coming">
      <span className="coming-icon"><Icon name={item.icon} size={36} stroke={1.6} /></span>
      <div className="eyebrow">Kommt in Phase {item.phase}</div>
      <h1>{item.label}</h1>
      <p>{item.intro}</p>
      <p className="muted small">Wie es aussehen wird, zeigen die Wireframes und die Demo. Hier entsteht gerade das Fundament – Schritt für Schritt.</p>
      <Link className="btn" href="/">Zur Startseite</Link>
    </div>
  );
}
