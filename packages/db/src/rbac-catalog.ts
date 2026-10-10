/**
 * Permission-Katalog und Standardrollen (docs/RBAC.md §3–4).
 * Wird vom Seed in die Tabellen permissions/roles/role_permissions geschrieben
 * und von der API für typsichere Permission-Keys genutzt.
 */

export const PERMISSIONS = {
  dashboard: ['dashboard.view', 'dashboard.view_cross_company'],
  news: ['news.read', 'news.create', 'news.publish', 'news.mark_important', 'news.require_read', 'news.update_any', 'news.delete_any', 'news.pin'],
  social: ['social.read', 'social.post', 'social.moderate'],
  handovers: ['handovers.read', 'handovers.create', 'handovers.update_any'],
  comments: ['comments.create', 'comments.moderate'],
  reactions: ['reactions.create'],
  chat: ['chat.use', 'chat.create_group', 'chat.moderate'],
  read_status: ['read_status.view_summary', 'read_status.view_details', 'reminders.send_manual'],
  notifications: ['notifications.send_important'],
  knowledge: ['knowledge.read', 'knowledge.create', 'knowledge.update', 'knowledge.publish', 'knowledge.delete', 'knowledge.manage_categories', 'knowledge.require_acknowledgement'],
  documents: ['documents.read', 'documents.create', 'documents.update', 'documents.delete', 'documents.deactivate', 'documents.download', 'documents.manage_categories'],
  search: ['search.use', 'ai.use'],
  tasks: ['tasks.read', 'tasks.create', 'tasks.assign', 'tasks.update_any'],
  checklists: ['checklists.execute', 'checklists.manage_templates', 'checklists.approve', 'checklists.view_reports'],
  lifecycle: ['lifecycle.start', 'lifecycle.view_progress', 'lifecycle.manage_templates'],
  surveys: ['surveys.respond', 'surveys.create', 'surveys.view_results'],
  ideas: ['ideas.read', 'ideas.create', 'ideas.manage'],
  contacts: ['contacts.read', 'contacts.manage', 'contacts.view_emergency'],
  employees: ['employees.directory', 'absences.view_team', 'absences.manage'],
  users: ['users.read', 'users.manage', 'users.deactivate', 'users.delete', 'users.reset_password'],
  companies: ['groups.manage', 'companies.manage', 'branding.manage', 'companies.manage_modules'],
  roles: ['roles.manage'],
  integrations: ['integrations.view_status', 'integrations.manage'],
  admin: ['settings.manage', 'audit.read', 'security.manage', 'dashboard.manage_widgets'],
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS][number];

/** Sensible Rechte (is_sensitive): nur an wenige Rollen, Vergabe erfordert roles.manage global. */
export const SENSITIVE_PERMISSIONS: readonly PermissionKey[] = [
  'users.read', 'users.manage', 'users.deactivate', 'users.delete', 'users.reset_password',
  'roles.manage', 'integrations.view_status', 'integrations.manage',
  'settings.manage', 'audit.read', 'security.manage', 'dashboard.manage_widgets',
];

const EMPLOYEE: PermissionKey[] = [
  'dashboard.view', 'news.read', 'news.create', 'news.publish', 'social.read', 'social.post',
  'handovers.read', 'handovers.create', 'comments.create', 'reactions.create', 'chat.use',
  'knowledge.read', 'documents.read', 'documents.download', 'search.use', 'ai.use', 'tasks.read',
  'checklists.execute', 'surveys.respond', 'ideas.read', 'ideas.create', 'contacts.read', 'employees.directory',
];

const TEAM_LEAD: PermissionKey[] = [
  ...EMPLOYEE, 'news.mark_important', 'news.require_read', 'handovers.update_any',
  'read_status.view_summary', 'read_status.view_details', 'reminders.send_manual',
  'tasks.create', 'tasks.assign', 'checklists.approve', 'absences.view_team',
  'lifecycle.view_progress', 'surveys.create', 'surveys.view_results',
];

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const ROLES: RoleDefinition[] = [
  { key: 'employee', name: 'Mitarbeitende', description: 'Standardrolle für alle Mitarbeitenden (inkl. Azubis).', permissions: EMPLOYEE },
  {
    key: 'external', name: 'Extern / Aushilfe', description: 'Befristeter Zugang ohne KI und Mitarbeiterverzeichnis (ADR-006).',
    permissions: ['dashboard.view', 'news.read', 'knowledge.read', 'chat.use', 'checklists.execute', 'tasks.read'],
  },
  { key: 'team_lead', name: 'Teamleitung', description: 'Leitung einer Gruppe: Lesestatus, Erinnerungen, Aufgaben.', permissions: TEAM_LEAD },
  {
    key: 'department_head', name: 'Abteilungsleitung', description: 'Wie Teamleitung für die Gesellschaft, zusätzlich Wissen und Vorlagen.',
    permissions: [...TEAM_LEAD, 'knowledge.publish', 'knowledge.create', 'knowledge.update', 'documents.create', 'documents.update',
      'documents.deactivate', 'checklists.manage_templates', 'checklists.view_reports', 'lifecycle.start', 'ideas.manage', 'news.pin'],
  },
  {
    key: 'editor_knowledge', name: 'Redaktion Wissen', description: 'Pflegt Wissen & SOPs.',
    permissions: ['knowledge.read', 'knowledge.create', 'knowledge.update', 'knowledge.publish', 'knowledge.delete', 'knowledge.manage_categories',
      'knowledge.require_acknowledgement', 'documents.create', 'documents.update'],
  },
  {
    key: 'hr', name: 'Personal', description: 'Personalthemen der Gesellschaft; Freischaltung neuer Kolleg:innen.',
    permissions: ['users.read', 'users.manage', 'users.reset_password', 'lifecycle.start', 'lifecycle.view_progress', 'lifecycle.manage_templates', 'absences.manage'],
  },
  {
    key: 'management', name: 'Geschäftsleitung', description: 'Gesellschaftsübergreifende Sicht, lesend.',
    permissions: ['dashboard.view_cross_company', 'read_status.view_summary', 'surveys.view_results', 'audit.read'],
  },
  {
    key: 'it_admin', name: 'IT-Administration', description: 'Benutzer, Gruppen, Gesellschaften, Integrationen, Sicherheit.',
    permissions: ['users.read', 'users.manage', 'users.deactivate', 'users.reset_password', 'groups.manage', 'companies.manage',
      'branding.manage', 'companies.manage_modules', 'integrations.view_status', 'integrations.manage', 'settings.manage',
      'security.manage', 'dashboard.manage_widgets', 'audit.read'],
  },
  {
    key: 'moderator', name: 'Moderation', description: 'Kleines Moderationsteam für Meldungen (ADR-037).',
    permissions: ['social.moderate', 'comments.moderate', 'news.update_any', 'news.delete_any'],
  },
  { key: 'role_admin', name: 'Rechteverwaltung', description: 'Vergibt Rollen (getrennt von IT-Administration, Vier-Augen).', permissions: ['roles.manage'] },
  {
    key: 'foundation_editor', name: 'Redaktion Stiftung', description: 'Gruppenweite Mitteilungen im Scope der DKB STIFTUNG.',
    permissions: ['news.create', 'news.publish', 'news.mark_important', 'news.pin', 'surveys.create', 'surveys.view_results', 'dashboard.view_cross_company'],
  },
];
