/** Deutsche Bezeichnungen für Typen und Status aus der API. */
export const TYPE_LABEL: Record<string, string> = { WIKI: 'Wissen', SOP: 'SOP', POLICY: 'Richtlinie', BRAND_STANDARD: 'Standard', HACCP: 'HACCP', PROCESS: 'Ablauf', MANUAL: 'Anleitung', TEMPLATE_FORM: 'Vorlage' };
export const TASK_STATUS: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Arbeit', BLOCKED: 'Blockiert', DONE: 'Erledigt', CANCELLED: 'Abgebrochen' };
export const PRIORITY: Record<string, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
export const RUN_STATUS: Record<string, string> = { PLANNED: 'Geplant', IN_PROGRESS: 'Offen', COMPLETED: 'Abgeschlossen', OVERDUE: 'Überfällig', CANCELLED: 'Abgebrochen' };
export const CHECK_KIND: Record<string, string> = { GENERAL: 'Allgemein', SHIFT: 'Schicht', HACCP: 'HACCP', EVENT: 'Veranstaltung', AUDIT: 'Prüfung' };
export const RESPONSE: Record<string, string> = { CHECK: 'Abhaken', YES_NO: 'Ja/Nein', TEXT: 'Text', NUMBER: 'Zahl', TEMPERATURE: 'Temperatur', PHOTO: 'Foto' };
export const QUESTION: Record<string, string> = { SINGLE_CHOICE: 'Eine Antwort', MULTIPLE_CHOICE: 'Mehrere Antworten', SCALE: 'Skala 1–5', FREE_TEXT: 'Freitext' };
export const CONTACT_TYPE: Record<string, string> = { SUPPLIER: 'Lieferant', PARTNER: 'Partner', MAINTENANCE: 'Wartung', SERVICE_PROVIDER: 'Dienstleister', AUTHORITY: 'Behörde', OTHER: 'Sonstiges' };
