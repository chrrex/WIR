# API- und Modulstruktur

Stand: 05.10.2026 · REST unter `/api/v1`, Spezifikation als OpenAPI 3.1 (generiert aus Code + Zod, in CI gegen Breaking Changes geprüft). Realtime unter `/ws`.

## 1. Konventionen

| Thema | Regel |
|---|---|
| Ressourcen | Plural, kebab-case: `/knowledge-articles/{id}` |
| IDs | UUID in Pfaden; nie fortlaufende Nummern |
| Listen | Cursor-Pagination `?cursor=…&limit=…` (max 100); Filter als Query-Parameter |
| Fehler | RFC 9457 Problem Details (`type`, `title`, `status`, `detail`, `errors[]`); 404 statt 403 für nicht sichtbare Objekte (kein Existenz-Leak) |
| Schreiben | `Idempotency-Key`-Header für POSTs mit Seiteneffekt (Veröffentlichen, Erinnern, Upload-Complete) |
| Nebenläufigkeit | `ETag`/`If-Match` auf Wissen, Dokumente, Checklisten-Vorlagen (verhindert Überschreiben) |
| Sprache | `Accept-Language`; Übersetzung explizit über `?translate=en` bzw. Translation-Endpunkt, Original immer im Response |
| Auth | Session-Cookie; schreibende Requests mit CSRF-Token; Service-Accounts per mTLS/Token nur für `/integrations/webhooks` |
| Rate Limits | Login, Reset, KI, Übersetzung, Upload gesondert begrenzt |
| Jede Route | Decorator `@RequirePermission('<key>')` – CI-Test schlägt fehl, wenn eine Route keinen hat (`@Public()` nur für Login/Reset/Health) |

## 2. Modulübersicht

```
apps/api/src/
  core/            config, logging, request-context, problem-details, idempotency
  modules/
    auth/          Login, Logout, Sessions, Passwort, MFA
    policy/        PermissionContext, Guards (Adapter zu packages/policy)
    organization/  companies, groups, memberships
    users/         users, employee-profiles, absences, settings
    rbac/          roles, permissions, user-roles
    content/       ⟵ Querschnitt: content_items, audiences, recipients, acl,
                     read-receipts, reminders, comments, reactions, mentions
    files/         ⟵ Querschnitt: uploads, attachments, download
    notifications/ ⟵ Querschnitt: inbox, preferences, push-subscriptions, delivery
    translations/  ⟵ Querschnitt: on-demand, cache, provider-adapter
    search/        ⟵ Querschnitt: index-jobs, global search
    ai/            Assistent (nutzt search/retrieval)
    news/          posts (kind NEWS)
    social/        posts (kind SOCIAL), Biete & Suche, Glückwünsche, Meldungen
    handovers/
    chat/          REST + WebSocket-Gateway
    knowledge/     categories, articles, versions, diff
    documents/     categories, documents, versions
    tasks/
    checklists/    templates, items, runs, run-items, scheduler
    lifecycle/     on-/offboarding templates, steps, instances
    surveys/       surveys, questions, responses, results
    ideas/
    contacts/
    dashboard/     widgets-registry, preferences, policies, aggregation
    integrations/  adapters/* (gastromatic, flexkeeping, eventtool, review, msgraph, generic), sync, mappings, logs, api-clients, webhooks
    admin/         settings, audit-logs, security
    qr-links/      (optional, §17 Phase 2)
  jobs/            pg-boss Handler (Worker-Einstieg)
```

Abhängigkeitsrichtung: **Fachmodule → Querschnittsmodule → core**. Querschnittsmodule kennen keine Fachmodule; sie arbeiten über `content_items.type` und registrierte Hooks (z. B. `ContentTypeRegistry.register('POST', { title, linkPath, searchableText })`).

## 3. Endpunkte je Modul

Permission in Klammern; „+ACL“ = zusätzlich Objektprüfung.

### auth
| Methode & Pfad | Zweck |
|---|---|
| `POST /auth/login` | Benutzername/E-Mail + Passwort → Session (`@Public`, rate-limited) |
| `POST /auth/logout` | Session widerrufen |
| `GET /auth/me` | eigener User, Rechte-Kurzliste für UI-Steuerung |
| `GET/DELETE /auth/sessions[/{id}]` | eigene Sessions ansehen/abmelden |
| `POST /auth/password/change` | Passwortwechsel (Pflicht bei `must_change_password`) |
| `POST /auth/password/reset-request` | Self-Service-Reset (nur mit verifizierter E-Mail; Antwort immer gleich) |
| `POST /auth/password/reset-confirm` | Einmal-Token + neues Passwort |
| `POST /auth/mfa/{totp|webauthn}/…` | MFA einrichten/prüfen (vorbereitet) |

### organization · users · rbac
| Methode & Pfad | Permission |
|---|---|
| `GET/POST /companies`, `PATCH /companies/{id}` | companies.manage (GET: users.read) |
| `GET/POST /groups`, `PATCH/DELETE /groups/{id}` | groups.manage |
| `PUT/DELETE /groups/{id}/members/{userId}` | groups.manage (Scope) |
| `GET /users`, `GET /users/{id}` | users.read (Scope) |
| `POST /users`, `PATCH /users/{id}` | users.manage (Scope) |
| `POST /users/{id}/deactivate` / `reactivate` | users.deactivate |
| `POST /users/{id}/password-reset` | users.reset_password → Einmal-Code, `must_change_password`, Audit |
| `GET /directory` | employees.directory (reduziertes Profil: Name, Tätigkeit, Gruppe, dienstl. Kontakt, „abwesend“) |
| `GET/PATCH /me/profile`, `GET/PUT /me/settings` | eigene Daten (Felder mit externer Quelle read-only) |
| `GET/POST /me/absences`, `GET /absences?groupId=` | eigene / absences.view_team |
| `GET/POST /roles`, `PATCH /roles/{id}`, `PUT /roles/{id}/permissions` | roles.manage |
| `GET /permissions` | roles.manage |
| `POST/DELETE /users/{id}/roles` | roles.manage (nur Rechte ⊆ eigene) |

### content (Querschnitt, für alle Inhaltstypen identisch)
| Methode & Pfad | Permission |
|---|---|
| `PUT /content/{id}/audience` | Autor:in / *.update_any |
| `GET/PUT /content/{id}/acl` | MANAGE am Objekt |
| `POST /content/{id}/seen` · `/opened` · `/acknowledge` | READ (+ACL); Ack nur bei `requires_acknowledgement` |
| `GET /content/{id}/read-status` | read_status.view_summary → `{ recipients: 24, opened: 18, acknowledged: 12 }` |
| `GET /content/{id}/read-status/recipients?state=unread` | read_status.view_details + MANAGE/Autor:in |
| `POST /content/{id}/reminders` `{ recipients: "unread" \| [ids], channel }` | reminders.send_manual (+Audit, Doppelversand-Schutz) |
| `GET/POST /content/{id}/comments`, `PATCH/DELETE /comments/{id}` | comments.create (+READ) / Autor:in / comments.moderate |
| `PUT/DELETE /content/{id}/reactions/LIKE`, `…/comments/{id}/reactions/LIKE` | reactions.create |
| `GET /me/unread` | Zähler je Typ für Dashboard |

### files
| `POST /files/uploads` | Presigned Upload anfordern (Größe/MIME-Whitelist) |
|---|---|
| `POST /files/{id}/complete` | Scan/Verarbeitung anstoßen |
| `GET /files/{id}/download` | Rechte über verknüpftes Objekt → kurzlebiger Link (documents.download bei Dokumenten) |
| `POST/DELETE /content/{id}/attachments` | UPDATE am Objekt |

### news · handovers
| `GET /posts?unread=true&pinned=` · `GET /posts/{id}` | news.read (+Audience) |
|---|---|
| `POST /posts` · `PATCH /posts/{id}` · `DELETE /posts/{id}` | news.create / Autor:in / news.update_any, news.delete_any |
| `POST /posts/{id}/publish` `{ publishAt?, importance, audience, readTracking, reminderPolicy }` | news.publish (Audience ⊆ Scope) |
| `POST /posts/{id}/pin` | news.pin |
| `GET /handovers?groupId=&date=` · `POST /handovers` · `PATCH /handovers/{id}` | handovers.read / create / Autor:in |

### social
| `GET /social/posts?category=&cursor=` · `GET /social/posts/{id}` | social.read (+Sichtbarkeit) |
|---|---|
| `POST /social/posts` `{ category, visibility, text, attachments, marketplace? }` · `PATCH/DELETE /social/posts/{id}` | social.post / Autor:in |
| `POST /social/posts/{id}/close` (Biete & Suche erledigt) | Autor:in |
| `POST /content/{id}/reports` · `POST /comments/{id}/reports` | social.read |
| `GET /admin/reports?status=OPEN` · `POST /admin/reports/{id}/resolve` | social.moderate |
| `GET /social/celebrations?week=` (nur Opt-in) | social.read |

### chat
| `GET /chat/conversations` · `POST /chat/conversations` `{type, participantIds, title}` | chat.use / chat.create_group |
|---|---|
| `GET /chat/conversations/{id}/messages?cursor=` · `POST …/messages` | Teilnehmende |
| `PATCH/DELETE /chat/messages/{id}` | Absender:in |
| `POST /chat/conversations/{id}/read` `{ lastMessageId }` | Teilnehmende (nur Ungelesen-Zähler) |
| `PUT/DELETE /chat/conversations/{id}/participants/{userId}` | Chat-ADMIN |
| WS `/ws` Events: `chat.message.created`, `chat.message.updated`, `chat.typing`, `notification.created`, `content.read_status.changed` | Session, Kanal-Autorisierung pro Subscribe |

### notifications
| `GET /notifications?unread=` · `POST /notifications/{id}/read` · `POST /notifications/read-all` | eigene |
|---|---|
| `GET/PUT /me/notification-preferences` | eigene |
| `POST/DELETE /me/push-subscriptions` | eigene |

### knowledge · documents
| `GET /knowledge/categories` (Baum, gefiltert) · `POST/PATCH/DELETE …` | knowledge.read / manage_categories |
|---|---|
| `GET /knowledge/articles?categoryId=&type=SOP` · `GET /knowledge/articles/{id}` | knowledge.read (+ACL) |
| `POST /knowledge/articles` · `PATCH /knowledge/articles/{id}` (erzeugt Draft-Version) | knowledge.create / update (+ACL) |
| `POST /knowledge/articles/{id}/publish` `{ requireAcknowledgement?, audience? }` | knowledge.publish (+ require_acknowledgement) |
| `GET /knowledge/articles/{id}/versions` · `GET …/versions/{n}` · `GET …/diff?from=&to=` | knowledge.read |
| `POST /knowledge/articles/{id}/restore/{n}` | knowledge.update |
| `GET /document-categories` · `GET /documents?categoryId=&q=` · `GET /documents/{id}` | documents.read (+ACL) |
| `POST /documents` · `POST /documents/{id}/versions` · `PATCH /documents/{id}` | documents.create / update |
| `POST /documents/{id}/deactivate` · `DELETE /documents/{id}` | documents.deactivate / delete |
| `GET /files-hub?q=` | zentrale Ansicht aller *sichtbaren* Anhänge aus News/Wissen/Übergaben (§3 Dokumente, ADR-017) |

### search · ai · translations
| `GET /search?q=&types=&cursor=` | search.use – nur `visibleContentFilter` |
|---|---|
| `POST /ai/ask` `{ question, scope?: {types, categoryIds} }` → `{ answer, sources[] }` | ai.use, rate-limited, Antwort ohne Speicherung (ADR-008) |
| `POST /ai/feedback` `{ answerId, helpful }` | ai.use (optional) |
| `POST /translations` `{ entityType, entityId, field, targetLocale, plainLanguage? }` | READ auf Entität |

### tasks · checklists · lifecycle
| `GET /tasks?assignee=me&status=&due=` · `POST /tasks` · `PATCH /tasks/{id}` | tasks.read / create / assign |
|---|---|
| `GET/POST /checklists` · `PATCH /checklists/{id}` · `PUT /checklists/{id}/items` | checklists.manage_templates |
| `POST /checklists/{id}/runs` (manuell) · Scheduler erzeugt wiederkehrende | checklists.execute / System |
| `GET /checklist-runs?groupId=&date=&status=` · `GET /checklist-runs/{id}` | checklists.execute (Gruppe) / view_reports |
| `PATCH /checklist-runs/{id}/items/{itemId}` `{ isDone, valueNumber, photoFileId, note }` | checklists.execute |
| `POST /checklist-runs/{id}/complete` · `POST …/approve` | execute / checklists.approve |
| `GET/POST /lifecycle/templates` · `PUT …/{id}/steps` | lifecycle.manage_templates |
| `POST /lifecycle/instances` `{ templateId, employeeProfileId, referenceDate }` | lifecycle.start (erzeugt Tasks/Runs) |
| `GET /lifecycle/instances?status=` · `GET …/{id}` (Fortschritt) | lifecycle.view_progress (Scope) |

### surveys · ideas · contacts
| `POST /surveys` · `PUT /surveys/{id}/questions` · `POST /surveys/{id}/publish` | surveys.create |
|---|---|
| `GET /surveys/{id}` · `POST /surveys/{id}/responses` | surveys.respond (+Audience), einmalig |
| `GET /surveys/{id}/results` | surveys.view_results bzw. resultsVisibility; ab min_group_size |
| `GET/POST /ideas` · `PATCH /ideas/{id}` · `POST /ideas/{id}/status` | ideas.read / create / manage |
| `GET/POST /idea-categories` | ideas.manage |
| `GET /contacts?q=&categoryId=&emergency=true` · `POST/PATCH /contacts…` | contacts.read / manage |
| `PUT/DELETE /contacts/{id}/documents/{documentId}` | contacts.manage |

### dashboard
| `GET /dashboard` | dashboard.view – liefert erlaubte Widgets in Nutzerreihenfolge, je Widget Daten oder `state: "unavailable"` |
|---|---|
| `GET /dashboard/widgets/{key}` | Widget-spezifisch (z. B. `occupancy_today` → `integrations` Read-Model) |
| `GET/PUT /me/dashboard-preferences` | dashboard.view (innerhalb Policy) |
| `GET/PUT /admin/dashboard-widget-policies` | dashboard.manage_widgets |

Widget-Registry (Code): `news_unread`, `my_tasks`, `my_checklists`, `handovers_today`, `notifications`, `events_today`, `rooms_today`, `occupancy_today`, `arrivals_departures`, `my_shifts`, `surveys_open`, `acknowledgements_due`, `onboarding_progress`, `company_overview` (cross-company).

### integrations · admin
| `GET /integrations` · `GET /integrations/{key}/sync-logs` | integrations.view_status |
|---|---|
| `PATCH /integrations/{key}` · `POST /integrations/{key}/sync` | integrations.manage |
| `GET/PUT /integrations/{key}/mappings` | integrations.manage |
| `POST /integrations/{key}/webhooks` | Service-Account, Signaturprüfung |
| `GET/PUT /admin/settings` | settings.manage |
| `GET /admin/audit-logs?actor=&action=&from=&to=` | audit.read |
| `GET/PUT /admin/security` (Passwort-Policy, Session-Timeouts, MFA-Pflicht je Rolle) | security.manage |

## 3a. Offene API für Drittsysteme (ADR-035)

| Methode & Pfad | Zweck |
|---|---|
| `POST /oauth/token` (Client Credentials) | Token für registrierte API-Clients |
| alle `/api/v1/*` Ressourcen | erreichbar je nach Scope des Clients, z. B. `tasks:write`, `events:write`, `users:read` |
| `GET/POST/DELETE /admin/api-clients` | Clients anlegen, Scopes vergeben, sperren (`integrations.manage`) |
| `GET/POST/DELETE /admin/webhooks` | ausgehende Ereignisse abonnieren |
| `GET /api/v1/openapi.json` | maschinenlesbare Spezifikation, Entwicklerdokumentation |

## 4. Domain-Events (intern, über Outbox → pg-boss)

| Event | Konsumenten |
|---|---|
| `ContentPublished` | content (Empfänger materialisieren), notifications, search (indexieren), reminders (planen) |
| `ContentVersionPublished` | search (re-index), content (Ack-Status zurücksetzen), notifications |
| `ContentDeactivated` / `ContentDeleted` | search (entfernen), reminders (abbrechen), translations (aufräumen) |
| `GroupMembershipAdded/Removed` | content (LATE_JOIN / removed_at), chat (Gruppenchats optional) |
| `UserDeactivated` | auth (Sessions widerrufen), content, notifications |
| `MentionCreated`, `CommentCreated` | notifications |
| `ChecklistRunDue`, `TaskDue` | notifications, reminders |
| `LifecycleStarted` | tasks, checklists (Instanzen erzeugen) |
| `ExternalEntitiesSynced` | dashboard (Cache invalidieren) |

## 5. Jobs (Worker)

`reminders.dispatch` (alle 5 min) · `notifications.deliver` · `checklists.generate_recurring` (stündlich, Zeitzone Europe/Berlin) · `content.publish_scheduled` · `search.index` · `files.scan` · `integrations.sync.<key>` (Cron je Integration) · `retention.cleanup` (täglich: Sessions, abgelaufene Read-Models, Lesestatus/Audit nach Frist) · `translations.prune`.
