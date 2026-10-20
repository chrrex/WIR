/** Menüpunkte. Sichtbar nur, wenn das Modul für die Person freigeschaltet ist (Rechte + Gesellschaft). */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  module: string | null;
  /** zusätzlich nötiges Recht (eines davon) */
  anyOf?: string[];
  /** Unterbereiche als Reiter auf der Seite (ADR-059); der Menüpunkt führt zum ersten freigeschalteten */
  sub?: Array<{ href: string; label: string; module: string }>;
}

export type IconName = 'home' | 'news' | 'heart' | 'hand' | 'chat' | 'book' | 'doc' | 'task' | 'list' | 'poll' | 'idea' | 'contact' | 'team' | 'admin' | 'settings' | 'logout' | 'search' | 'bell' | 'menu' | 'lock' | 'check' | 'key' | 'globe' | 'x' | 'arrow' | 'camera' | 'thumb' | 'flag' | 'send' | 'plus' | 'trash' | 'pin' | 'back' | 'users' | 'bellring' | 'bookmark' | 'calendar' | 'timer';

export const NAV: NavItem[] = [
  { href: '/', label: 'Start', icon: 'home', module: null },
  { href: '/news', label: 'News', icon: 'news', module: 'NEWS' },
  { href: '/social', label: 'Social', icon: 'heart', module: 'SOCIAL' },
  { href: '/uebergaben', label: 'Übergaben', icon: 'hand', module: 'HANDOVERS' },
  { href: '/chat', label: 'Chat', icon: 'chat', module: 'CHAT' },
  { href: '/wissen', label: 'Wissen & SOPs', icon: 'book', module: null, sub: [{ href: '/wissen', label: 'Artikel & SOPs', module: 'KNOWLEDGE' }, { href: '/dokumente', label: 'Dokumente', module: 'DOCUMENTS' }] },
  { href: '/aufgaben', label: 'Aufgaben', icon: 'task', module: 'TASKS' },
  { href: '/checklisten', label: 'Checklisten', icon: 'list', module: 'CHECKLISTS' },
  { href: '/meetings', label: 'Meetings', icon: 'calendar', module: 'MEETINGS' },
  { href: '/ideen', label: 'Ideen', icon: 'idea', module: 'IDEAS' },
  { href: '/team', label: 'Kontakte', icon: 'contact', module: null, sub: [{ href: '/team', label: 'Kolleg:innen', module: 'TEAM' }, { href: '/kontakte', label: 'Externe Kontakte', module: 'CONTACTS' }] },
  { href: '/einarbeitung', label: 'Einarbeitung', icon: 'users', module: null, anyOf: ['lifecycle.start', 'lifecycle.view_progress'] },
];

export const ADMIN_PERMISSIONS = ['users.read', 'audit.read'];

type Who = { modules: string[]; permissions: string[] };
/** Sichtbare Menüpunkte; bei Unterbereichen nur die freigeschalteten, Ziel = erster davon. */
export function navFor(me: Who) {
  return NAV.flatMap((n) => {
    if (n.anyOf && !n.anyOf.some((p) => me.permissions.includes(p))) return [];
    const sub = n.sub?.filter((s) => me.modules.includes(s.module));
    if (sub ? !sub.length : n.module && !me.modules.includes(n.module)) return [];
    return [{ ...n, href: sub?.[0].href ?? n.href, sub, paths: sub ? sub.map((s) => s.href) : [n.href] }];
  });
}
