'use client';

import { useLoad } from '@/components/work';
import { useMe } from '@/lib/me';

/** Sprache & Übersetzung (ADR-054): Inhalte in der eigenen Sprache oder in Leichter Sprache, Original jederzeit abrufbar. */
export function LanguageSettings({ save }: { save: (patch: Record<string, unknown>, label: string) => void }) {
  const { me } = useMe();
  const { data } = useLoad<{ languages: Record<string, string>; translate: boolean; plain: boolean }>('/translations/languages');
  const s = me?.settings;
  if (!s || !data) return null;
  return (
    <section className="card stack">
      <h2>Sprache & Übersetzung</h2>
      <div className="field"><label htmlFor="lang">Meine Sprache</label>
        <select id="lang" className="input" value={s.locale} onChange={(e) => save({ locale: e.target.value }, 'Sprache gespeichert')}>
          {Object.entries(data.languages).map(([k, l]) => <option key={k} value={k} lang={k}>{l}</option>)}
        </select>
        <span className="small muted">In dieser Sprache schreibst du – und in diese Sprache werden Inhalte übersetzt. Menü und Knöpfe bleiben vorerst deutsch.</span></div>
      <label className="check"><input type="checkbox" checked={s.autoTranslate} onChange={(e) => save({ autoTranslate: e.target.checked }, e.target.checked ? 'Automatische Übersetzung an' : 'Automatische Übersetzung aus')} />
        News, Übergaben, Social, Wissen, Kommentare und Chat automatisch in meine Sprache übersetzen</label>
      <label className="check"><input type="checkbox" checked={s.plainLanguage} onChange={(e) => save({ plainLanguage: e.target.checked }, e.target.checked ? 'Leichte Sprache an' : 'Leichte Sprache aus')} />
        {s.locale === 'de' ? 'Texte in Leichter Sprache anzeigen' : 'Texte in einfacher Sprache anzeigen'}</label>
      <p className="small muted">Das Original bleibt immer erhalten: Oben auf jeder Seite kannst du mit „Original anzeigen“ umschalten. Übersetzungen macht eine Maschine – bei wichtigen Arbeitsanweisungen im Zweifel das Original lesen oder nachfragen.</p>
      {(!data.translate || !data.plain) && <div className="note info small">Der Übersetzungsdienst wird gerade eingerichtet. Bis dahin siehst du nur Übersetzungen, die schon vorliegen{!data.plain && ' – Leichte Sprache folgt mit dem KI-Anbieter'}.</div>}
    </section>
  );
}
