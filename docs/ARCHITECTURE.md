# Technische Architektur – WIR · Das Mitarbeiterportal (Schloss & Gut Liebenberg)

Stand: 10.10.2026 · Entwurf v0.2 (Name WIR, Stiftungs-Auftritt) · Grundlage: `docs/MASTER_SPEC.md`
Offene Punkte und Abweichungen von der Spec: `ARCHITECTURE_DECISIONS.md` (ADR-xxx).

---

## 1. Zielbild in einem Satz

Ein **modularer Monolith** (eine deploybare Backend-Einheit, intern strikt in Fachmodule geschnitten) mit **Next.js-Frontend als PWA**, **PostgreSQL** als einziger relationaler Datenbank, **EU-Object-Storage** für Dateien und einer **zentralen Policy-Engine**, durch die jeder Datenzugriff läuft – auch Suche und KI.

## 2. Systemkontext

```
                 ┌──────────────────────────────────────────────────────────────┐
  Browser/PWA ──▶│  Web (Next.js, SSR/RSC, nur UI + BFF-Proxy)                  │
  (Desktop,      └───────────────┬──────────────────────────────────────────────┘
  Tablet, Handy)                 │ HTTPS, Session-Cookie (HttpOnly, SameSite=Lax)
                 ┌───────────────▼──────────────────────────────────────────────┐
                 │  API (Node.js/TypeScript, NestJS) – modularer Monolith       │
                 │  REST /api/v1 (OpenAPI 3.1) · WebSocket /ws (Chat, Live)     │
                 │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
                 │  │ Fachmodule  │─▶│ Policy-Engine│◀─│ Retrieval-Layer     │  │
                 │  └─────────────┘  └──────────────┘  │ (Suche + KI)        │  │
                 │                                      └─────────────────────┘  │
                 └───┬───────────────┬────────────────┬──────────────┬─────────┘
                     │               │                │              │
              ┌──────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐  ┌────▼──────────────┐
              │ PostgreSQL │  │ Object      │  │ Worker      │  │ Externe Dienste   │
              │ 16 (EU)    │  │ Storage (EU,│  │ (gleiche    │  │ E-Mail (SMTP/EU)  │
              │ + pg-boss  │  │ SSE, privat)│  │ Codebasis,  │  │ Web Push (VAPID)  │
              └────────────┘  └─────────────┘  │ Jobs/Sync)  │  │ Übersetzung (EU)  │
                                               └──────┬──────┘  │ LLM (EU, AVV)     │
                                                      │         │ STT/TTS           │
                                                      ▼         └───────────────────┘
                     Gastromatic (Personal + Dienstplan) · Eventtool · Flexkeeping · Bewertungstool
                     (jeweils führende Quelle, Anbindung über Adapter im Integrationsmodul)
```

## 3. Technologie-Entscheidungen

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strict) durchgehend | Ein Typensystem von DB bis UI |
| Frontend | Next.js (App Router), React, TanStack Query | Spec-Vorgabe; SSR für schnelle Erstanzeige auf schwachen Geräten |
| UI-Basis | Headless/zugängliche Primitives (z. B. React Aria / Radix) + eigenes Design-Token-System | WCAG 2.2 AA ist mit zugänglichen Primitives realistisch, nicht mit Eigenbau |
| Backend | **NestJS** auf Node.js (eigener Prozess, nicht Next.js-API-Routes) | Modulgrenzen, Guards, DI, OpenAPI-Generierung; Backend bleibt unabhängig vom Frontend (API-first) – ADR-001 |
| ORM | Prisma | Spec-Vorgabe; ergänzende Constraints per SQL-Migration (`prisma/sql/`) |
| DB | PostgreSQL 16, EU-Region, verschlüsselt at rest | Spec; FTS + später pgvector im selben System |
| Jobs/Queue | **pg-boss** (Postgres-basiert) | Kein zusätzlicher Redis-Betrieb im MVP; transaktional mit Fachdaten (Outbox) – ADR-002 |
| Realtime | WebSocket (NestJS Gateway) | Chat, Live-Zähler; Fallback Polling |
| Dateien | S3-kompatibler EU-Storage, privat, SSE, Zugriff nur über kurzlebige Presigned URLs nach Rechteprüfung | Spec §2 |
| Virenscan | ClamAV im Worker vor Freigabe (`scan_status`) | Uploads von Mitarbeitenden-Smartphones |
| Suche | PostgreSQL FTS (`search_chunks`), später pgvector | Spec §7 |
| Auth | Eigene Session-Auth (Argon2id, serverseitige Sessions), MFA vorbereitet (TOTP/WebAuthn); SSO optional später | Spec §8 – ADR-011 |
| i18n | ICU-Messages (de, en; pl vorbereitet), `Accept-Language` + User-Setting | Spec §9 |
| Observability | OpenTelemetry, strukturierte Logs ohne Inhaltsdaten, Fehler-Tracking EU-gehostet | Datenschutz |
| CI/CD | GitHub Actions: Lint, Typecheck, Unit, Integration (Testcontainers-Postgres), E2E (Playwright + axe), SAST, Dependency-Scan, Migration-Check | Spec §2 |
| Umgebungen | dev / staging / prod, getrennte DBs, Buckets, Secrets; Staging nur mit synthetischen oder pseudonymisierten Daten | Spec §2 |

## 4. Schichten und Modulschnitt im Backend

```
apps/
  web/                    Next.js PWA
  api/                    NestJS – HTTP/WS-Einstieg
  worker/                 gleicher Code, startet nur Job-Handler
packages/
  db/                     Prisma-Schema, Migrationen, Seed (Rollen/Rechte)
  contracts/              OpenAPI-Typen, Zod-Schemas, geteilt von web + api
  policy/                 Policy-Engine (reine Funktionen, 100 % testbar)
  ui/                     Design-System, a11y-geprüfte Komponenten
  i18n/                   Übersetzungsdateien
```

Jedes Fachmodul in `apps/api/src/modules/<modul>/` hat dieselbe Struktur:

```
<modul>/
  <modul>.controller.ts   HTTP-Endpunkte, nur Validierung + Delegation
  <modul>.service.ts      Fachlogik; ruft Policy vor jedem Lesen/Schreiben
  <modul>.repository.ts   einziger Ort mit Prisma-Zugriff für dieses Modul
  <modul>.events.ts       Domain-Events (z. B. PostPublished)
  <modul>.policy.ts       modulspezifische Regeln, registriert bei der Policy-Engine
  dto/ , tests/
```

**Modulgrenzen-Regeln** (per ESLint `import/no-restricted-paths` erzwungen):
1. Ein Modul greift nie auf das Repository eines anderen Moduls zu – nur auf dessen öffentlichen Service oder auf Events.
2. Querschnittsmodule (`content`, `files`, `notifications`, `translations`, `search`, `audit`) dürfen von allen genutzt werden, kennen aber keine Fachmodule (Abhängigkeit nur in eine Richtung).
3. Kein Controller ohne Policy-Guard; ein Test prüft automatisch, dass jede Route einen deklarierten Permission-Key hat.

Modulliste und Endpunkte: `docs/API_MODULES.md`.

## 5. Content-Registry – das tragende Muster

Die Spec verlangt Lesestatus, Erinnerungen, Kommentare, Reaktionen, Anhänge, Übersetzung, Suche und KI für **viele** Inhaltstypen und verbietet zugleich parallele Datenmodelle (§19, §21). Lösung:

- `content_items` ist die Basistabelle aller "Inhalte" (News, Übergaben, Wissensartikel, Dokumente, Umfragen, Aufgaben, Checklisten-Läufe, Ideen).
- Jede Subtyp-Tabelle (`posts`, `handovers`, …) verwendet **dieselbe UUID als Primärschlüssel** (1:1).
- Querschnittstabellen (`read_receipts`, `reminders`, `comments`, `reactions`, `attachments`, `content_audiences`, `content_recipients`, `resource_acl`, `search_chunks`, `notifications`) referenzieren `content_items.id` per **echtem Foreign Key** – keine `content_type/content_id`-Polymorphie ohne Integrität.
- Ein neuer Inhaltstyp bekommt damit Lesestatus, Kommentare, Suche usw. "kostenlos".

Ausnahme: `content_translations` ist bewusst polymorph, weil Übersetzungen abgeleitete, jederzeit neu erzeugbare Daten sind und auch Chatnachrichten/Checklistenpunkte betreffen (ADR-004).

## 6. Autorisierung (Kurzfassung – Details in `docs/RBAC.md`)

Zwei Ebenen, beide serverseitig, Default Deny:

1. **RBAC** – "Darf diese Person diese *Art* von Aktion?" (`news.publish`, `users.reset_password`) aus `roles` / `permissions`, optional gescopt auf Gesellschaft oder Gruppe.
2. **Objekt-Sichtbarkeit** – "Darf diese Person *dieses* Objekt sehen?" aus Zielgruppe (`content_audiences`) bzw. Objekt-/Kategorie-ACL (`resource_acl`).

Die **Policy-Engine** liefert für einen User einmal pro Request einen `PermissionContext` (Rechte, Scopes, Gruppen-IDs, Rollen-IDs, Gesellschaft). Daraus erzeugt sie:
- `can(ctx, action, resource)` für Einzelprüfungen und
- `visibleContentFilter(ctx)` – einen Prisma-`where`-Baustein, der in **jede** Listen-, Such- und Retrieval-Abfrage eingesetzt wird. Es gibt keine zweite Implementierung der Sichtbarkeitslogik für Suche/KI.

Optional als Defense-in-Depth (Phase 6): PostgreSQL Row-Level-Security auf `content_items` mit `SET LOCAL app.user_id` (ADR-005).

## 7. Suche und KI-Assistent

```
User ─▶ Auth ─▶ PermissionContext ─▶ Retrieval-Layer
                                      1. visibleContentFilter(ctx)  → erlaubte content_item_ids
                                      2. FTS (später + Vektor) NUR innerhalb dieser IDs
                                      3. Ausschlüsse: sensible Kategorien, Chat, Entwürfe anderer
                                      4. Top-k Chunks + Metadaten (Titel, Version, Link)
                                  ─▶ LLM (Prompt: nur diese Chunks, Antwort mit Quellen-IDs)
                                  ─▶ Post-Check: zitierte IDs ⊆ übergebene IDs, sonst verwerfen
                                  ─▶ Antwort + Quellenliste (Links in die App)
```

- Das LLM bekommt **nie** Datenbankzugriff oder Tools mit Schreibrechten.
- Indexierung: Worker erzeugt `search_chunks` bei Veröffentlichung/neuer Version (Domain-Event), löscht sie bei Deaktivierung.
- Chatnachrichten sind im MVP weder in der globalen Suche noch im KI-Index (ADR-015).
- Prompt-Injection-Schutz: Inhalte werden als Daten markiert übergeben; das System-Prompt verbietet Anweisungsübernahme; Antworten ohne Quellenbezug werden als solche gekennzeichnet.

## 8. Lesestatus & Erinnerungen (Plattformkomponente)

- Beim Veröffentlichen werden Zielgruppen in `content_recipients` **materialisiert** (Snapshot). "18 von 24 gelesen" = `count(read_receipts.opened_at) / count(content_recipients where removed_at is null)`.
- Späterer Gruppeneintritt: per Event `GroupMembershipAdded` wird nachgetragen, wenn `include_late_joiners` gesetzt (Reason `LATE_JOIN`). Austritt/Rechteentzug setzt `removed_at`.
- Drei Stufen: `first_seen_at` (Liste/Vorschau), `opened_at` (Detail), `acknowledged_at` + `acknowledged_version` ("Kenntnis genommen"). Vorschau erzeugt nie eine Kenntnisnahme (§20).
- Neue Version einer Pflicht-SOP → Kenntnisnahme gilt als offen, wenn `acknowledged_version < current_version`.
- Erinnerungen: Scheduler-Job prüft fällige automatische Erinnerungen; Doppelversand-Schutz über `UNIQUE(content_item_id, recipient_id, sequence_no, channel)`; Überspringen bei gelesen/abwesend/Ruhezeit/Limit (`max_reminders`).
- Leserlisten sieht nur, wer `MANAGE` am Objekt bzw. `read_status.view_details` im Scope hat; manuelle Erinnerungen werden auditiert.

## 9. Benachrichtigungen

`NotificationService.notify(event)` → Empfänger ermitteln → Präferenzen, Ruhezeiten, Abwesenheit prüfen → `notifications` (In-App) + `notification_deliveries` je Kanal → Worker versendet E-Mail/Push. Wichtig-Markierung (`IMPORTANT`) darf Ruhezeiten **nicht** übersteuern, ohne dass dies in der Betriebsvereinbarung geregelt ist (ADR-014).

## 10. Dateien

Upload: `POST /files/uploads` → Presigned PUT (max. Größe, erlaubte MIME-Typen) → Client lädt hoch → `POST /files/{id}/complete` → Worker: Checksumme, MIME-Sniffing, Virenscan, Thumbnails, Text-Extraktion (nur nicht-sensible Dokumente) → `scan_status = CLEAN`. Download nur über `GET /files/{id}/download` → Rechteprüfung → 60-Sekunden-Presigned-GET. Videos: Größenlimit und ggf. Transcoding offen (ADR-019).

## 11. Integrationen

Adapter-Muster je System (`integrations/adapters/<system>.adapter.ts`) mit einheitlichem Interface `pull(since) / map() / upsert()`. Ergebnisse landen als **Read-Model** in `external_entities` (mit `expires_at`) bzw. – bei Gastromatic als führender Personalsoftware – direkt in `users`/`employee_profiles`/`employee_company_assignments`/`groups` mit `source = GASTROMATIC`; Felder mit externer Quelle sind in der UI schreibgeschützt. Neue Mitarbeitende werden als `PROVISIONED` angelegt und erst nach Freischaltung aktiv (ADR-021). Jeder Lauf schreibt `integration_sync_logs`; Secrets nur im Secret-Manager (`secret_ref`). Bis Phase 5 zeigen die Dashboard-Widgets "Belegung/Events/Dienstplan" einen leeren Zustand mit Hinweis (ADR-010).

## 12. Sicherheit (Querschnitt)

- Passwörter: Argon2id, Mindestlänge 12, Abgleich gegen bekannte kompromittierte Passwörter (k-Anonymity-Range-Abfrage oder lokale Liste), Rate-Limiting + progressive Sperre.
- Sessions: serverseitig, Token nur gehasht in DB, HttpOnly/Secure/SameSite, Idle- und Absolut-Timeout, Widerruf bei Passwortwechsel/Deaktivierung.
- CSRF-Schutz (SameSite + Double-Submit-Token für schreibende Requests), strikte CSP, keine Inline-Scripts.
- Rich-Text nur als strukturiertes JSON gespeichert, serverseitig gegen Whitelist validiert; HTML-Ausgabe nur gerendert, nie roh.
- Eingaben: Zod-Validierung an jeder Grenze; einheitliche Fehler (RFC 9457).
- Audit: sicherheitsrelevante Aktionen (Login-Fehler-Häufung, Rollenvergabe, Passwort-Reset, Rechteänderung, manuelle Erinnerung, Export, Integrationskonfig) – ohne Inhaltsdaten.
- Backups: täglich, verschlüsselt, EU, Restore-Test quartalsweise.

## 13. Accessibility & Mehrsprachigkeit (Querschnitt)

- Komponentenbibliothek mit axe-Tests in CI; Playwright-E2E mit Tastatur-only-Pfaden.
- Nutzereinstellungen (`user_settings`): Schriftgröße 100–200 %, Kontrast, reduzierte Bewegung, Theme, Vorlesen, Einfache Sprache, Auto-Übersetzung.
- Übersetzung on demand, Cache in `content_translations`, Original immer per Umschalter erreichbar, Kennzeichnung "maschinell übersetzt".
- Einfache Sprache: redaktionell gepflegt für Wissensartikel (`plain_language_text`), maschinell nur gekennzeichnet (ADR-018).

## 12a. Offene Schnittstellen

Open-API-Strategie (ADR-035): dokumentierte, versionierte REST-API für die eigene Oberfläche und für Drittsysteme (OAuth2-Clients mit Scopes), signierte Webhooks für ausgehende Ereignisse, Adapter für Systeme ohne API. Microsoft 365 (SSO, Outlook-Kalender, Teams-Hinweise) ist als Prüfauftrag vorgesehen. Ideen für weitere Funktionen: `docs/IDEEN_BACKLOG.md`.

## 13a. Stiftungsgruppe (Ausbaustufe 2)

Eine Installation für mehrere Gesellschaften der Stiftungsgruppe (ADR-034): Gesellschaftsbaum, Branding je Wirkungsort über Design-Tokens (Farben, Logos, Footer), Scopes mit Vererbung, gesellschaftsübergreifende Bereiche (News, Social, Wissen, Kontakte, Chat, Umfragen, Ideen) und strikt getrennte operative Daten. Ab Phase 1 im Modell angelegt, aktiviert nur für SGL.

**Design-Tokens je Gesellschaft (ADR-039):** `--brand` (Aktionsfarbe, Kontrast ≥ 4,5 : 1), `--nav-bg` (Flächenfarbe, Default = `--brand`), abgeleitete Dunkel-/Tönungsfarben, Logo-Komponente mit Regel „nur auf Weiß“ (weiße Logo-Fläche mit Schutzraum, auch im Dunkelmodus). Die Stiftung ist eine eigene Gesellschaft (`FOUNDATION`) mit eigenem Auftritt; Fachmodule lassen sich je Gesellschaft abschalten (`companies.disabled_modules`), z. B. Übergaben, Checklisten, Dienstplan und Belegung auf Stiftungsebene. Der Produktname „WIR“ ist global (ADR-038).

## 14. Phasen-Mapping auf diese Architektur

| Phase | Liefert zusätzlich | Abhängigkeit |
|---|---|---|
| 1 | Monorepo, CI/CD, `db` + Seed, Auth, Policy-Engine, Users/Gruppen/Gesellschaften/Rollen, Audit, Dashboard-Rahmen (Widgets leer), Settings | – |
| 2 | Content-Registry, Posts, Handovers, Kommentare, Reaktionen, Mentions, Lesestatus/Erinnerungen, Notifications (In-App + E-Mail), Chat, Dateien | Phase 1 |
| 3 | Wissen/SOP, Dokumente, Versionierung, Suche, KI-Assistent, Übersetzung | Phase 2 (Content, Files) |
| 4 | Aufgaben, Checklisten (+ wiederkehrend), On-/Offboarding, Umfragen, Ideen, Kontakte | Phase 2/3 |
| 5 | Integrationen, Dashboard-Widgets mit Live-Daten (Gastromatic-Stammdatensync ggf. vorziehen, ADR-021) | Phase 1 |
| 6 | PWA-Offline, Web Push, a11y-Härtung, optional RLS | alle |

Hinweis: Die Reihenfolge aus §12 gilt; die in §17 als "MVP" genannten Punkte (Onboarding, erweiterte Checklisten, Übersetzung von Chat/Kommentaren) folgen in späteren Phasen (ADR-009).
