/** Menüpunkte. Sichtbar nur, wenn das Modul für die Person freigeschaltet ist (Rechte + Gesellschaft). */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  module: string | null;
  /** In welcher Phase der Bereich mit Inhalten gefüllt wird */
  phase: number;
  intro: string;
}

export type IconName = 'home' | 'news' | 'heart' | 'hand' | 'chat' | 'book' | 'doc' | 'task' | 'list' | 'poll' | 'idea' | 'contact' | 'team' | 'admin' | 'settings' | 'logout' | 'search' | 'bell' | 'menu' | 'lock' | 'check' | 'key' | 'globe' | 'x' | 'arrow';

export const NAV: NavItem[] = [
  { href: '/', label: 'Start', icon: 'home', module: null, phase: 1, intro: '' },
  { href: '/news', label: 'News', icon: 'news', module: 'NEWS', phase: 2, intro: 'Mitteilungen an Teams, Abteilungen oder das ganze Haus – auf Wunsch übersetzt und vorgelesen.' },
  { href: '/social', label: 'Social', icon: 'heart', module: 'SOCIAL', phase: 2, intro: 'Privates unter Kolleg:innen: Urlaubsgrüße, Glückwünsche, Biete & Suche. Freiwillig und ohne Lesestatus.' },
  { href: '/uebergaben', label: 'Übergaben', icon: 'hand', module: 'HANDOVERS', phase: 2, intro: 'Schichtübergaben mit Foto und Erwähnungen – damit nichts verloren geht.' },
  { href: '/chat', label: 'Chat', icon: 'chat', module: 'CHAT', phase: 2, intro: 'Einzel- und Gruppenchats. Inhalte sieht niemand außer den Beteiligten – auch keine Administration.' },
  { href: '/wissen', label: 'Wissen & SOPs', icon: 'book', module: 'KNOWLEDGE', phase: 3, intro: 'Richtlinien und Arbeitsanweisungen mit Versionen, einfacher Sprache und „Kenntnis genommen“.' },
  { href: '/dokumente', label: 'Dokumente', icon: 'doc', module: 'DOCUMENTS', phase: 3, intro: 'Vorlagen und Formulare mit Rechten je Kategorie.' },
  { href: '/aufgaben', label: 'Aufgaben', icon: 'task', module: 'TASKS', phase: 4, intro: 'Aufgaben für Personen oder Teams, mit Fälligkeit und Erinnerung.' },
  { href: '/checklisten', label: 'Checklisten', icon: 'list', module: 'CHECKLISTS', phase: 4, intro: 'HACCP- und Schichtchecklisten mit Grenzwerten und Nachweis.' },
  { href: '/umfragen', label: 'Umfragen', icon: 'poll', module: 'SURVEYS', phase: 4, intro: 'Kurze Umfragen, auf Wunsch anonym – Ergebnisse erst ab 5 Antworten.' },
  { href: '/ideen', label: 'Ideen', icon: 'idea', module: 'IDEAS', phase: 4, intro: 'Ideen einreichen, unterstützen und den Weg bis zur Umsetzung verfolgen.' },
  { href: '/kontakte', label: 'Kontakte', icon: 'contact', module: 'CONTACTS', phase: 4, intro: 'Lieferanten, Dienstleister und Notdienste – mit einem Tipp anrufen.' },
  { href: '/team', label: 'Team', icon: 'team', module: 'TEAM', phase: 4, intro: 'Wer ist wer im Haus – mit Bereich und Tätigkeit, ohne private Daten.' },
];

export const ADMIN_PERMISSIONS = ['users.read', 'audit.read'];
