import type { AppModule, PrismaClient } from '@wir/db';

export interface Branding {
  companyId: string;
  companyName: string;
  companyKind: string;
  displayName: string;
  /** Aktionsfarbe (Buttons, Links) – Kontrast ≥ 4,5 : 1 zu Weiß */
  primaryColor: string;
  /** Flächenfarbe (Navigation, Kopfzeile) */
  surfaceColor: string;
  /** Logo-Datei der Web-App: /brand/<logoKey>.svg bzw. .png (Phase 1; später Datei-Upload) */
  logoKey: string;
  /** Markenregel: Logo nur auf Weiß (DKB STIFTUNG, ADR-039) */
  logoRequiresWhite: boolean;
  footerText: string | null;
}

export const ALL_MODULES: AppModule[] = [
  'NEWS', 'SOCIAL', 'CHAT', 'KNOWLEDGE', 'DOCUMENTS', 'TASKS', 'CHECKLISTS', 'HANDOVERS',
  'SHIFTS', 'OCCUPANCY', 'EVENTS', 'SURVEYS', 'IDEAS', 'CONTACTS', 'TEAM',
];

/** Welches Funktionsrecht ein Modul mindestens braucht, um im Menü zu erscheinen. */
export const MODULE_PERMISSION: Record<AppModule, string> = {
  NEWS: 'news.read', SOCIAL: 'social.read', CHAT: 'chat.use', KNOWLEDGE: 'knowledge.read', DOCUMENTS: 'documents.read',
  TASKS: 'tasks.read', CHECKLISTS: 'checklists.execute', HANDOVERS: 'handovers.read', SHIFTS: 'dashboard.view',
  OCCUPANCY: 'dashboard.view', EVENTS: 'dashboard.view', SURVEYS: 'surveys.respond', IDEAS: 'ideas.read',
  CONTACTS: 'contacts.read', TEAM: 'employees.directory',
};

type CompanyWithBranding = Awaited<ReturnType<PrismaClient['company']['findMany']>>[number] & {
  branding: { displayName: string; primaryColor: string; surfaceColor: string | null; logoRequiresWhite: boolean; footerText: string | null } | null;
};

/** Auftritt: nächster Knoten mit Branding, ausgehend von der Hauptgesellschaft (ADR-034). */
export function resolveBranding(companyId: string, companies: CompanyWithBranding[]): Branding | null {
  const byId = new Map(companies.map((c) => [c.id, c]));
  let cur = byId.get(companyId);
  const origin = cur;
  while (cur) {
    if (cur.branding && origin) {
      return {
        companyId: origin.id,
        companyName: origin.name,
        companyKind: origin.kind,
        displayName: cur.branding.displayName,
        primaryColor: cur.branding.primaryColor,
        surfaceColor: cur.branding.surfaceColor ?? cur.branding.primaryColor,
        logoKey: cur.shortName.toLowerCase(),
        logoRequiresWhite: cur.branding.logoRequiresWhite,
        footerText: cur.branding.footerText,
      };
    }
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

/** Ein Modul ist an, wenn mindestens eine zugeordnete Gesellschaft es nicht abschaltet (ADR-039). */
export function enabledModules(companyIds: string[], companies: Array<{ id: string; disabledModules: AppModule[] }>): AppModule[] {
  const mine = companies.filter((c) => companyIds.includes(c.id));
  if (mine.length === 0) return ALL_MODULES;
  return ALL_MODULES.filter((m) => mine.some((c) => !c.disabledModules.includes(m)));
}
