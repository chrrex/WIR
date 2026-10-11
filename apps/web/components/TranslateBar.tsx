'use client';

import { useShowOriginal, useTranslation } from '@/lib/translate';

const NAMES: Record<string, string> = { de: 'Deutsch', en: 'English', pl: 'Polski', uk: 'Українська', ro: 'Română', bg: 'Български', hu: 'Magyar', tr: 'Türkçe', es: 'Español', id: 'Bahasa Indonesia' };

/** Hinweis oben: Inhalte werden automatisch übersetzt – Original jederzeit anzeigen (ADR-054). */
export function TranslateBar() {
  const { on, plain, target } = useTranslation();
  const [orig, setOrig] = useShowOriginal();
  if (!on) return null;
  const what = plain ? (target === 'de' ? 'in Leichter Sprache' : `in einfachem ${NAMES[target] ?? target}`) : `automatisch übersetzt (${NAMES[target] ?? target})`;
  return (
    <div className="txbar" role="status">
      <span className="grow">{orig ? 'Du siehst die Originaltexte.' : `Inhalte werden ${what} angezeigt.`}</span>
      <button className="lnk small" aria-pressed={orig} onClick={() => setOrig(!orig)}>{orig ? (plain ? 'Leichte Sprache anzeigen' : 'Übersetzung anzeigen') : 'Original anzeigen'}</button>
    </div>
  );
}
