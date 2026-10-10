# ER-Modell

Stand: 05.10.2026 · 77 Tabellen · maßgeblich ist `prisma/schema.prisma`; ergänzende Constraints in `prisma/sql/0001_constraints_draft.sql`.
Die Diagramme zeigen je Domäne Schlüssel und fachlich wichtige Attribute; Zeitstempel (`created_at`, `updated_at`) sind weggelassen.

## Abgleich Spec §5 → Schema

| Spec-Tabelle | Im Schema | Anmerkung |
|---|---|---|
| companies, users, employee_profiles, groups, roles, permissions, role_permissions, user_roles | ✔ gleichnamig | `user_roles` mit optionalem Scope (Gesellschaft/Gruppe) |
| user_groups | ✔ `user_groups` | Mitgliedschaft am **User** statt am Profil (ADR-006) |
| posts, comments, reactions, chat_* , handovers, notifications, notification_preferences | ✔ | Kommentare/Reaktionen generisch über `content_items` |
| post_targets, handover_targets | → `content_audiences` | generischer Verteiler (§19/§21) |
| post_reads, handover_reads | → `read_receipts` | generischer Lesestatus (§21) |
| knowledge_categories, knowledge_articles, knowledge_versions | ✔ | Kapitel = Artikel mit `parent_article_id` |
| knowledge_permissions, document_permissions | → `resource_acl` | ein ACL-Modell für Kategorien und Objekte |
| documents, document_versions, document_categories | ✔ | |
| tasks, task_assignees, checklists, checklist_items, checklist_runs | ✔ | + `checklist_run_items` (Ergebnis je Punkt, fehlte in Spec) |
| surveys, survey_options, survey_responses | ✔ | + `survey_questions`, `survey_answers`, `survey_participations` (Anonymität, ADR-013) |
| ideas, idea_categories, idea_status_history | ✔ | |
| idea_comments | → `comments` | §19: keine Parallelmodelle |
| absences | ✔ | ohne Abwesenheitsgrund |
| employee_settings | → `user_settings` | auch externe Accounts haben Einstellungen |
| contacts, contact_categories, contact_documents | ✔ | `contact_documents` verweist auf Dokumente-Modul |
| integrations, integration_sync_logs, external_entities, external_entity_mappings | ✔ | |
| audit_logs | ✔ | append-only |
| **§18** onboarding_templates / offboarding_templates | → `lifecycle_templates` (kind) | ein Modell für beide |
| onboarding_steps | → `lifecycle_template_steps` | erzeugen Tasks/Checklisten-Läufe |
| onboarding_instances | → `lifecycle_instances` | |
| dashboard_preferences | ✔ + `dashboard_widget_policies` | Admin-Grenzen je Rolle |
| survey_results | ✘ keine Tabelle | Aggregation per Query/View mit Mindestgruppengröße |
| content_translations | ✔ | |
| content_media | → `attachments` + `file_objects` | `kind` = IMAGE/VIDEO/… |
| qr_nfc_links | ✔ (optional) | |
| companies 1:n Mitarbeiter (§4) | ✔ + `employee_company_assignments` | Mitarbeitende in mehreren Gesellschaften (ADR-020) |
| Social Feed (§16) | `posts.kind = SOCIAL` + `content_reports` | kein zweites Feed-Modell (ADR-031) |
| Stiftungsgruppe (Ausbaustufe 2) | `companies.parent_id/kind` + `company_brandings` | ADR-034 |
| Auftritt je Gesellschaft, Module je Gesellschaft | `company_brandings.surface_color/logo_requires_white`, `companies.disabled_modules` (Enum `AppModule`) | ADR-039 |
| Open API (ADR-035) | `api_clients`, `webhook_subscriptions`; `integrations.key` frei | neue Systeme ohne Schemaänderung |
| **neu, nicht in Spec** | `content_items`, `content_recipients`, `reminders`, `mentions`, `file_objects`, `notification_deliveries`, `push_subscriptions`, `sessions`, `credential_resets`, `mfa_factors`, `search_chunks`, `system_settings` | technisch notwendig für Spec-Anforderungen |

---

## 1. Organisation & Identity

```mermaid
erDiagram
  companies ||--o{ employee_profiles : "Hauptgesellschaft"
  employee_profiles ||--o{ employee_company_assignments : ""
  companies ||--o{ employee_company_assignments : "weitere"
  companies ||--o{ groups : "hat (optional)"
  users ||--o| employee_profiles : "1 : 0..1"
  users ||--o{ user_groups : ""
  groups ||--o{ user_groups : ""
  groups ||--o{ groups : "parent"
  users ||--o{ user_roles : ""
  roles ||--o{ user_roles : ""
  companies |o--o{ user_roles : "Scope"
  groups |o--o{ user_roles : "Scope"
  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  users ||--o{ sessions : ""
  users ||--o{ credential_resets : ""
  users ||--o{ mfa_factors : ""
  users ||--o| user_settings : ""
  employee_profiles ||--o{ employee_profiles : "line_manager"
  employee_profiles ||--o{ absences : ""
  companies ||--o{ companies : "parent (Stiftung > Wirkungsort > Gesellschaft)"
  companies ||--o| company_brandings : "Auftritt"

  companies { uuid id PK
    uuid parent_id FK
    enum kind "FOUNDATION|LOCATION|LEGAL_ENTITY"
    enum_array disabled_modules "z. B. HANDOVERS, CHECKLISTS" }
  company_brandings { uuid company_id PK,FK
    string primary_color "Aktion, Kontrast >= 4,5:1"
    string surface_color "Flaechen, z. B. #1A8FE3"
    uuid logo_file_id FK
    uuid logo_inverse_file_id FK "nullable"
    bool logo_requires_white "DKB STIFTUNG: true" }
  users { uuid id PK
    string username UK
    string email UK "nullable"
    enum user_type "EMPLOYEE|EXTERNAL|SERVICE"
    enum status
    string password_hash "Argon2id"
    bool must_change_password }
  employee_profiles { uuid id PK
    uuid user_id FK,UK
    uuid company_id FK
    uuid line_manager_id FK
    string personnel_number
    enum source "LOCAL|GASTROMATIC" }
  employee_company_assignments { uuid id PK
    uuid employee_profile_id FK
    uuid company_id FK
    bool is_primary
    date valid_from
    date valid_to }
  groups { uuid id PK
    uuid company_id FK "null = uebergreifend"
    uuid parent_group_id FK
    enum type }
  user_roles { uuid id PK
    uuid user_id FK
    uuid role_id FK
    uuid company_id FK "Scope, optional"
    uuid group_id FK "Scope, optional" }
  permissions { uuid id PK
    string key UK "modul.aktion" }
  absences { uuid id PK
    enum type "ohne Grund"
    date starts_on
    date ends_on }
```

## 2. Content-Registry & Querschnitt

```mermaid
erDiagram
  content_items ||--o| posts : "1:1 shared PK"
  content_items ||--o| handovers : "1:1"
  content_items ||--o| knowledge_articles : "1:1"
  content_items ||--o| documents : "1:1"
  content_items ||--o| surveys : "1:1"
  content_items ||--o| tasks : "1:1"
  content_items ||--o| checklist_runs : "1:1"
  content_items ||--o| ideas : "1:1"
  content_items ||--o{ content_audiences : Verteiler
  content_items ||--o{ content_recipients : "Empfaenger-Snapshot"
  content_items ||--o{ resource_acl : "Objekt-ACL"
  content_items ||--o{ read_receipts : ""
  content_items ||--o{ reminders : ""
  content_items ||--o{ comments : ""
  content_items ||--o{ reactions : ""
  content_items ||--o{ mentions : ""
  content_items ||--o{ attachments : ""
  content_items ||--o{ search_chunks : ""
  content_items ||--o{ notifications : ""
  comments ||--o{ comments : replies
  comments ||--o{ reactions : ""
  comments ||--o{ attachments : ""
  file_objects ||--o{ attachments : ""
  users ||--o{ read_receipts : ""
  users ||--o{ content_recipients : ""

  content_items { uuid id PK
    enum type
    uuid company_id FK
    uuid author_id FK
    enum status
    enum importance
    int current_version
    bool read_tracking_enabled
    bool requires_acknowledgement
    int auto_remind_after_hours
    int max_reminders }
  content_audiences { uuid id PK
    enum target_type "ALL|COMPANY|GROUP|ROLE|USER"
    bool include_late_joiners }
  content_recipients { uuid content_item_id PK
    uuid user_id PK
    enum reason
    ts removed_at }
  read_receipts { uuid id PK
    ts first_seen_at
    ts opened_at
    ts acknowledged_at
    int acknowledged_version }
  reminders { uuid id PK
    uuid recipient_id FK
    enum trigger "MANUAL|AUTOMATIC"
    enum channel
    int sequence_no
    enum status }
  resource_acl { uuid id PK
    uuid content_item_id FK "genau eines"
    uuid knowledge_category_id FK
    uuid document_category_id FK
    uuid contact_category_id FK
    enum principal_type
    enum_array actions }
  content_translations { uuid id PK
    enum entity_type "polymorph"
    uuid entity_id
    string target_locale
    string source_hash }
```

## 3. Kommunikation & Benachrichtigungen

```mermaid
erDiagram
  handovers }o--o| groups : Team
  posts }o--o| content_items : "embedded_survey"
  chat_conversations ||--o{ chat_participants : ""
  chat_conversations ||--o{ chat_messages : ""
  chat_messages ||--o{ chat_messages : reply_to
  chat_messages ||--o{ attachments : ""
  chat_messages ||--o{ mentions : ""
  users ||--o{ chat_participants : ""
  notifications ||--o{ notification_deliveries : "je Kanal"
  users ||--o{ notifications : ""
  users ||--o{ notification_preferences : ""
  users ||--o{ push_subscriptions : ""

  posts { uuid id PK,FK
    string title
    json body
    bool is_pinned }
  handovers { uuid id PK,FK
    string subject
    date shift_date
    string shift_label }
  chat_conversations { uuid id PK
    enum type "DIRECT|GROUP"
    string direct_key UK }
  chat_participants { uuid conversation_id PK
    uuid user_id PK
    uuid last_read_message_id }
  notifications { uuid id PK
    string event_type
    enum importance
    string dedupe_key
    ts read_at }
```

## 4. Wissen, Dokumente, Suche

```mermaid
erDiagram
  knowledge_categories ||--o{ knowledge_categories : parent
  knowledge_categories ||--o{ knowledge_articles : ""
  knowledge_categories ||--o{ resource_acl : ""
  knowledge_articles ||--o{ knowledge_articles : "Kapitel"
  knowledge_articles ||--o{ knowledge_versions : ""
  document_categories ||--o{ document_categories : parent
  document_categories ||--o{ documents : ""
  document_categories ||--o{ resource_acl : ""
  documents ||--o{ document_versions : ""
  file_objects ||--o{ document_versions : ""
  content_items ||--o{ qr_nfc_links : ""

  knowledge_articles { uuid id PK,FK
    enum article_type "WIKI|SOP|POLICY|HACCP|..."
    uuid parent_article_id FK
    uuid owner_id FK
    date review_due_at }
  knowledge_versions { uuid id PK
    int version_number
    enum status
    json body
    text plain_language_text }
  document_categories { uuid id PK
    bool is_sensitive "nie KI/Suche-Vererbung" }
  document_versions { uuid id PK
    int version_number
    uuid file_object_id FK
    text extracted_text }
  search_chunks { uuid id PK
    uuid content_item_id FK
    int chunk_index
    tsvector tsv "generated" }
```

## 5. Zusammenarbeit (Aufgaben, Checklisten, On-/Offboarding, Umfragen, Ideen)

```mermaid
erDiagram
  tasks ||--o{ task_assignees : ""
  checklists ||--o{ checklist_items : Vorlage
  checklists ||--o{ checklist_runs : Ausfuehrung
  checklist_runs ||--o{ checklist_run_items : Ergebnis
  checklist_items |o--o{ checklist_run_items : ""
  checklist_items }o--o| knowledge_articles : "verlinkte SOP"
  lifecycle_templates ||--o{ lifecycle_template_steps : ""
  lifecycle_templates ||--o{ lifecycle_instances : ""
  lifecycle_template_steps }o--o| checklists : "startet"
  lifecycle_template_steps }o--o| content_items : "verlinkt Richtlinie"
  lifecycle_instances }o--|| employee_profiles : "fuer"
  lifecycle_instances ||--o{ tasks : erzeugt
  lifecycle_instances ||--o{ checklist_runs : erzeugt
  surveys ||--o{ survey_questions : ""
  survey_questions ||--o{ survey_options : ""
  surveys ||--o{ survey_participations : "WER"
  surveys ||--o{ survey_responses : "WAS"
  survey_responses ||--o{ survey_answers : ""
  idea_categories ||--o{ ideas : ""
  ideas ||--o{ idea_status_history : ""

  tasks { uuid id PK,FK
    enum status
    enum priority
    ts due_at
    uuid lifecycle_instance_id FK }
  checklists { uuid id PK
    enum kind "SHIFT|HACCP|EVENT|ONBOARDING|..."
    string recurrence_rule "RRULE"
    bool requires_approval }
  checklist_run_items { uuid id PK
    string title_snapshot
    decimal value_number
    bool is_out_of_range }
  lifecycle_template_steps { uuid id PK
    int offset_days
    enum responsible_type }
  surveys { uuid id PK,FK
    bool is_anonymous
    int min_group_size }
  survey_responses { uuid id PK
    uuid respondent_id "NULL wenn anonym"
    date submitted_on }
```

## 6. Kontakte, Integrationen, System

```mermaid
erDiagram
  contact_categories ||--o{ contact_categories : parent
  contact_categories ||--o{ contacts : ""
  contact_categories ||--o{ resource_acl : ""
  contacts ||--o{ contact_documents : ""
  content_items ||--o{ contact_documents : "Dokument"
  integrations ||--o{ integration_sync_logs : ""
  integrations ||--o{ external_entities : "Read-Model"
  integrations ||--o{ external_entity_mappings : ""
  roles ||--o{ dashboard_widget_policies : ""
  users ||--o{ dashboard_preferences : ""
  users |o--o{ audit_logs : actor

  contacts { uuid id PK
    enum type
    string organization_name
    bool is_emergency_contact }
  integrations { uuid id PK
    enum key UK
    enum status
    string secret_ref "kein Secret" }
  external_entities { uuid id PK
    enum entity_type "EVENT|OCCUPANCY_DAY|SHIFT|..."
    string external_id
    json payload "minimiert"
    ts expires_at }
  external_entity_mappings { uuid id PK
    string external_id
    string internal_type
    uuid internal_id }
  audit_logs { uuid id PK
    string action
    string entity_type
    uuid entity_id
    json metadata "keine Inhalte" }
```

## Lösch- und Integritätsregeln (Auszug)

| Beziehung | onDelete | Grund |
|---|---|---|
| users → employee_profiles | Restrict | User werden deaktiviert, nicht gelöscht; Löschung nur über DSGVO-Löschprozess |
| content_items → Subtypen, Lesestatus, Kommentare … | Cascade | Inhalt endgültig gelöscht ⇒ Nebendaten weg |
| Autor-/Akteur-Referenzen | SetNull | Inhalte überleben gelöschte Accounts ("ehemalige/r Mitarbeitende/r") |
| file_objects ← attachments / document_versions | Restrict | Datei erst löschen, wenn nichts mehr verweist (Cleanup-Job) |
| Kategorien → Kinder/Inhalte | Restrict | Kein versehentliches Massenlöschen |
