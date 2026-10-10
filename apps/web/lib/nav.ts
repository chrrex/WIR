/** Menüpunkte. Sichtbar nur, wenn das Modul für die Person freigeschaltet ist (Rechte + Gesellschaft). */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  module: string | null;
  /** zusätzlich nötiges Recht (eines davon) */
  anyOf?: string[];
}

export type IconName = 'home' | 'news' | 'heart' | 'hand' | 'chat' | 'book' | 'doc' | 'task' | 'list' | 'poll' | 'idea' | 'contact' | 'team' | 'admin' | 'settings' | 'logout' | 'search' | 'bell' | 'menu' | 'lock' | 'check' | 'key' | 'globe' | 'x' | 'arrow' | 'camera' | 'thumb' | 'flag' | 'send' | 'plus' | 'trash' | 'pin' | 'back' | 'users' | 'bellring';

export const NAV: NavItem[] = [
  { href: '/', label: 'Start', icon: 'home', module: null },
  { href: '/news', label: 'News', icon: 'news', module: 'NEWS' },
  { href: '/social', label: 'Social', icon: 'heart', module: 'SOCIAL' },
  { href: '/uebergaben', label: 'Übergaben', icon: 'hand', module: 'HANDOVERS' },
  { href: '/chat', label: 'Chat', icon: 'chat', module: 'CHAT' },
  { href: '/wissen', label: 'Wissen & SOPs', icon: 'book', module: 'KNOWLEDGE' },
  { href: '/dokumente', label: 'Dokumente', icon: 'doc', module: 'DOCUMENTS' },
  { href: '/aufgaben', label: 'Aufgaben', icon: 'task', module: 'TASKS' },
  { href: '/checklisten', label: 'Checklisten', icon: 'list', module: 'CHECKLISTS' },
  { href: '/umfragen', label: 'Umfragen', icon: 'poll', module: 'SURVEYS' },
  { href: '/ideen', label: 'Ideen', icon: 'idea', module: 'IDEAS' },
  { href: '/kontakte', label: 'Kontakte', icon: 'contact', module: 'CONTACTS' },
  { href: '/team', label: 'Team', icon: 'team', module: 'TEAM' },
  { href: '/einarbeitung', label: 'Einarbeitung', icon: 'users', module: null, anyOf: ['lifecycle.start', 'lifecycle.view_progress'] },
];

export const ADMIN_PERMISSIONS = ['users.read', 'audit.read'];
