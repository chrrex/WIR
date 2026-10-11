/** Verständliche Namen für Module und Rechte (Verwaltung › Rollen & Rechte). */
export const MODULE_LABEL: Record<string, string> = {
  NEWS: 'News', SOCIAL: 'Social', CHAT: 'Chat', KNOWLEDGE: 'Wissen & SOPs', DOCUMENTS: 'Dokumente', TASKS: 'Aufgaben', CHECKLISTS: 'Checklisten',
  HANDOVERS: 'Übergaben', SHIFTS: 'Dienstplan', OCCUPANCY: 'Belegung', EVENTS: 'Veranstaltungen', SURVEYS: 'Umfragen', IDEAS: 'Ideen', CONTACTS: 'Kontakte', TEAM: 'Team',
};
export const GROUP_TYPE_LABEL: Record<string, string> = { DEPARTMENT: 'Abteilung', TEAM: 'Team', LOCATION: 'Standort', PROJECT: 'Projekt', CUSTOM: 'Gruppe' };

const AREA: Record<string, string> = {
  dashboard: 'Start', news: 'News', social: 'Social', handovers: 'Übergaben', comments: 'Kommentare', reactions: 'Reaktionen', chat: 'Chat',
  read_status: 'Lesestatus', notifications: 'Benachrichtigungen', knowledge: 'Wissen & SOPs', documents: 'Dokumente', search: 'Suche & KI', tasks: 'Aufgaben',
  checklists: 'Checklisten', lifecycle: 'Einarbeitung', surveys: 'Umfragen', ideas: 'Ideen', contacts: 'Kontakte', employees: 'Team & Abwesenheiten',
  users: 'Personen', companies: 'Häuser & Gruppen', roles: 'Rollen', integrations: 'Anbindungen', admin: 'System',
};
export const areaLabel = (m: string) => AREA[m] ?? m;

export const PERM_LABEL: Record<string, string> = {
  'dashboard.view': 'Startseite sehen', 'dashboard.view_cross_company': 'Übersicht über alle Häuser', 'dashboard.manage_widgets': 'Startseiten-Kacheln festlegen',
  'news.read': 'News lesen', 'news.create': 'News entwerfen', 'news.publish': 'News an eigene Teams veröffentlichen', 'news.mark_important': 'News als „wichtig“ markieren',
  'news.publish_wide': 'News an das ganze Haus', 'news.update_any': 'Fremde News bearbeiten', 'news.delete_any': 'Fremde News löschen', 'news.pin': 'News anheften',
  'social.read': 'Social lesen', 'social.post': 'Social posten & Danke sagen', 'social.moderate': 'Social moderieren',
  'handovers.read': 'Übergaben lesen', 'handovers.create': 'Übergaben schreiben', 'handovers.update_any': 'Fremde Übergaben bearbeiten',
  'comments.create': 'Kommentieren', 'comments.moderate': 'Kommentare moderieren', 'reactions.create': 'Reagieren',
  'chat.use': 'Chatten', 'chat.create_group': 'Gruppenchats anlegen', 'chat.moderate': 'Chat moderieren',
  'read_status.view_summary': 'Lesestatus (Zahlen) sehen', 'read_status.view_details': 'Lesestatus (Namen) sehen', 'reminders.send_manual': 'Erinnerungen schicken',
  'notifications.send_important': 'Wichtige Benachrichtigungen senden',
  'knowledge.read': 'Wissen lesen', 'knowledge.create': 'Wissen vorschlagen', 'knowledge.update': 'Wissen bearbeiten', 'knowledge.publish': 'Wissen freigeben',
  'knowledge.delete': 'Wissen löschen', 'knowledge.manage_categories': 'Wissens-Kategorien pflegen', 'knowledge.require_acknowledgement': '„Gelesen und verstanden“ verlangen',
  'documents.read': 'Dokumente sehen', 'documents.create': 'Dokumente hochladen', 'documents.update': 'Dokumente aktualisieren', 'documents.delete': 'Dokumente löschen',
  'documents.deactivate': 'Dokumente zurückziehen', 'documents.download': 'Dokumente herunterladen', 'documents.manage_categories': 'Dokument-Kategorien pflegen',
  'search.use': 'Suchen', 'ai.use': 'KI-Assistent nutzen',
  'tasks.read': 'Aufgaben sehen', 'tasks.create': 'Aufgaben anlegen', 'tasks.assign': 'Aufgaben zuweisen', 'tasks.update_any': 'Fremde Aufgaben bearbeiten',
  'checklists.execute': 'Checklisten ausfüllen', 'checklists.manage_templates': 'Checklisten-Vorlagen pflegen', 'checklists.approve': 'Checklisten abnehmen', 'checklists.view_reports': 'Checklisten-Auswertung',
  'lifecycle.start': 'Einarbeitung starten', 'lifecycle.view_progress': 'Einarbeitung verfolgen', 'lifecycle.manage_templates': 'Einarbeitungs-Vorlagen pflegen',
  'surveys.respond': 'An Umfragen teilnehmen', 'surveys.create': 'Umfragen erstellen', 'surveys.view_results': 'Umfrage-Ergebnisse sehen',
  'ideas.read': 'Ideen sehen', 'ideas.create': 'Ideen einreichen', 'ideas.manage': 'Ideen bewerten',
  'contacts.read': 'Kontakte sehen', 'contacts.manage': 'Kontakte pflegen', 'contacts.view_emergency': 'Notfallkontakte sehen',
  'employees.directory': 'Mitarbeiterverzeichnis', 'absences.view_team': 'Abwesenheiten im Team sehen', 'absences.manage': 'Abwesenheiten verwalten',
  'users.read': 'Personen sehen (Verwaltung)', 'users.manage': 'Personen anlegen & freischalten', 'users.deactivate': 'Personen deaktivieren', 'users.delete': 'Personen löschen',
  'users.reset_password': 'Einmal-Codes ausgeben',
  'groups.manage': 'Teams & Gruppen pflegen', 'companies.manage': 'Häuser verwalten', 'branding.manage': 'Farben & Auftritt ändern', 'companies.manage_modules': 'Module an-/abschalten',
  'roles.manage': 'Rollen vergeben & ändern', 'integrations.view_status': 'Anbindungen ansehen', 'integrations.manage': 'Anbindungen einrichten',
  'settings.manage': 'Systemeinstellungen', 'audit.read': 'Protokoll lesen', 'security.manage': 'Sicherheitseinstellungen',
};
