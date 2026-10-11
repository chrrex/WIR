# Architecture Decisions – WIR · Das Mitarbeiterportal (Schloss & Gut Liebenberg)

Stand: 10.10.2026 · Entwurf v0.4 (Name WIR, Auftritt der DKB STIFTUNG eingearbeitet) · Grundlage: `docs/MASTER_SPEC.md`
Begleitdokumente: `docs/ARCHITECTURE.md`, `docs/ER_MODEL.md`, `docs/RBAC.md`, `docs/API_MODULES.md`, `prisma/schema.prisma`, `prisma/sql/0001_constraints_draft.sql`

Status-Legende: **ENTSCHIEDEN** = technisch festgelegt, im Schema umgesetzt · **EMPFEHLUNG** = so modelliert, braucht fachliche Bestätigung · **OFFEN** = Entscheidung nötig, bevor die genannte Phase startet.

---

## Übersicht

### Entscheidungen, die vor Phase 1 fallen müssen

| ADR | Thema | Status | Wer entscheidet |
|---|---|---|---|
| 022 | Anbieter: erst Vorgaben der DKB-Gruppe einholen, dann auswählen | WARTET | DKB-Gruppe, IT, Datenschutz |
| 021 | Gastromatic-API: Prüfauftrag (Zugang, Rechte, Gesellschaften, Endpunkte) | PRÜFUNG | IT, Gastromatic |

Am 05.10.2026 entschieden: 009 (Phasen nach §12), 011 (Benutzername + Einmal-Code), 020 (mehrere Gesellschaften), 021 (Gastromatic führend). 012 (Betriebsvereinbarung) ist bekannt und läuft parallel – blockiert Phase 1 nicht, Lesestatus bleibt bis dahin per Feature-Flag aus.

Am 06.10.2026 entschieden: 006 (Aushilfen und Externe befristet), 013 (Umfrageergebnisse ab 5 Antworten), 014 (Benachrichtigungszeiten selbst einstellen), 015 (Chat, 1:1 mit Gelesen-Häkchen), 018 (Einfache Sprache redaktionell mit KI-Hilfe), 019 (Videos mit Untertiteln), 023 (Chat 12 Monate), 024 (Notdienste von Firmen), 030 (Offline-Umfang), 036 (App-Leiste konfigurierbar). 011 (private E-Mail freiwillig für Reset), 013 (Freitext mit Hinweis), 016 (keine Gästenamen), 017 (Anhänge mit gemeinsamer Ansicht), 037 (alle dürfen News veröffentlichen, Moderationsteam, KI für alle Mitarbeitenden, Pilot Rezeption + Verkauf/Veranstaltungen), 023 (Fristen: Chat 12 Monate, Lesezeiten 30 Tage, HACCP 2 Jahre, Social ohne Automatik, Accounts manuell löschen). Leserliste für alle: als Einstellung je Gesellschaft, aktiv erst nach Betriebsvereinbarung (ADR-012).

Am 10.10.2026 entschieden: 040 (Umsetzungsregeln Phase 2).

Am 09.10.2026 entschieden: 038 (Name „WIR“ – Das Mitarbeiterportal), 039 (Auftritt der DKB STIFTUNG: Logo nur auf Weiß, eigene Sicht für Mitarbeitende der Stiftung).

### Entscheidungen, die vor späteren Phasen fallen müssen

| ADR | Thema | Status | Spätestens vor |
|---|---|---|---|
| 012 | Betriebsvereinbarung Lesestatus/Erinnerungen | BEKANNT | Go-live Lesestatus |
| 023 | Restliche Fristen (Sessions, Audit, Erinnerungen) und alle Fristen mit Datenschutz bestätigen | OFFEN | Phase 2 |
| 035 | Microsoft 365 (Teams/Outlook): technische Prüfung | PRÜFUNG | Phase 5 |
| 034 | Stiftungsgruppe: Gesellschaften, Datenschutzrahmen, Betriebsräte, Kosten | OFFEN | Ausbaustufe 2 |

### Technisch entschieden

001 NestJS-Backend · 002 pg-boss · 003 Monorepo/modularer Monolith · 004 Content-Registry · 005 RBAC + ACL, RLS optional · 006 Gruppen am User · 007 Rollenvergabe getrennt · 008 KI ohne Gesprächsspeicherung · 009 Phasen nach §12 · 010 Dashboard vor Integrationen · 011 Benutzername + Einmal-Code · 020 Mehrere Gesellschaften je Person · 021 Gastromatic führend · 025 Kapitel als Unterartikel · 026 On-/Offboarding-Modell · 027 Abwesenheiten ohne Grund · 028 Empfänger-Snapshot · 029 Prisma-Version & SQL-Ergänzungen · 032 Approval vorbereitet · 031 Social getrennt von News · 033 QR-Links nur mit Login · 034 Stiftungsgruppe als Ausbaustufe 2 · 035 Open-API-Strategie

---

## Gefundene Widersprüche in der Spec (Kurzliste)

| # | Stelle | Widerspruch | Auflösung |
|---|---|---|---|
| W1 | §5 vs. §21 | §5 listet `post_reads`, `handover_reads`; §21 fordert ein generisches `read_receipts` | generisch → ADR-004 |
| W2 | §5 vs. §19 | `idea_comments` separat; §19 verbietet Parallelmodelle (Kommentare) | generische `comments` → ADR-004 |
| W3 | §5 | `knowledge_permissions` + `document_permissions` parallel zu RBAC – zwei Rechtesysteme für dasselbe Problem | ein `resource_acl` → ADR-005 |
| W4 | §4/§6 | „Mitarbeiter n:m Gruppen über `user_groups`“, gleichzeitig externe User ohne Profil, die aber Zielgruppen angehören sollen; Tabellenname sagt „user“, Beziehung sagt „employee_profiles“ | Mitgliedschaft am User → ADR-006 |
| W5 | §4 vs. §15.4 | „Gesellschaft 1:n Mitarbeiter“, aber vier Gesellschaften mit gemeinsamem Personal sind im Hotelbetrieb üblich | ADR-020 |
| W6 | §12 vs. §17 | §17 nennt Onboarding, Checklisten, Übersetzung „MVP/hohe Priorität“; §12 legt Checklisten in Phase 4. „Phase 2“ bedeutet in §12 und §17 Unterschiedliches | ADR-009 |
| W7 | §3/§12 | Dashboard (Phase 1) soll Belegung, Events, Dienstplan zeigen – die Integrationen kommen erst in Phase 5 | ADR-010 |
| W8 | §3 vs. §12 | Push ist Teil der Benachrichtigungen (Phase 2) und der Erinnerungen, technisch aber erst Phase 6 | ADR-009 |
| W9 | §8 | Reset per „Einmalpasswort per E-Mail“ – ein Teil der Belegschaft (Housekeeping, Küche, Service, Aushilfen) hat keine dienstliche E-Mail; Klartext-Passwort per Mail ist zudem schwächer als ein Reset-Link | ADR-011 |
| W10 | §8 vs. §20 | „Keine Leistungs- oder Verhaltenskontrolle“ vs. personengenaue Leserlisten mit Zeitstempel und automatische Erinnerungen | ADR-012 |
| W11 | §15.1 vs. §20 | Anonyme Umfragen vs. Lesestatus/Erinnerungen für Umfragen („wer hat noch nicht teilgenommen?“) | ADR-013 |
| W12 | §15.5 vs. §8 | Automatische Übersetzung von Chatnachrichten an einen externen Anbieter vs. Datenminimierung/Drittlandtransfer | ADR-022 |
| W13 | §15.2 | `onboarding_templates` und `offboarding_templates` als getrennte Tabellen vs. §19 („keine Parallelmodelle“) | ein Modell → ADR-026 |
| W14 | §3 Kontakte | „Notfallkontakte“ – gemeint sind Notdienste von Dienstleistern **oder** private Notfallkontakte der Mitarbeitenden (sensible Daten)? | ADR-024 |
| W15 | §3 Dokumente | „Dokumente aus News/Wissen/Übergaben auch zentral auffindbar“ – sind Anhänge damit versionierte Dokumente mit eigener Rechteverwaltung? | ADR-017 |
| W16 | §16 | „Social Feed“ taucht nur hier auf – eigener Bereich mit Beiträgen aller Mitarbeitenden oder nur ein anderer Name für News? | ADR-031 |

---

## ADR-001 · Backend als eigener NestJS-Prozess — ENTSCHIEDEN

**Kontext:** Spec nennt Next.js und Node.js/TypeScript, ohne zu sagen, ob das Backend in Next.js-API-Routes läuft.
**Entscheidung:** Eigener NestJS-Prozess (`apps/api`), Next.js nur als UI/BFF.
**Gründe:** API-first und Integrationen (§2), WebSocket für Chat, Worker im selben Code, klare Modulgrenzen mit Guards, OpenAPI-Generierung. Next.js-Routes würden Autorisierungslogik zwischen UI und API verteilen.
**Konsequenz:** Zwei Deployables (web, api/worker). Eine Codebasis, ein Datenbankschema.

## ADR-002 · Job-Queue auf PostgreSQL (pg-boss) — ENTSCHIEDEN

**Entscheidung:** pg-boss statt Redis/BullMQ.
**Gründe:** Ein System weniger im Betrieb; Jobs können in derselben Transaktion wie Fachdaten angelegt werden (Outbox-Muster, keine verlorenen Benachrichtigungen). Lastprofil (ein Hotel, vier Gesellschaften, < 1.000 Nutzer) ist unkritisch.
**Revision:** Wenn Realtime-Fan-out über mehrere API-Instanzen nötig wird, Redis nur als Pub/Sub ergänzen.

## ADR-003 · Monorepo, modularer Monolith — ENTSCHIEDEN

Gemäß §2/§14. Struktur in `docs/ARCHITECTURE.md` §4. Modulgrenzen werden per Lint-Regel erzwungen, nicht nur per Konvention.

## ADR-004 · Content-Registry statt typ-spezifischer Querschnittstabellen — ENTSCHIEDEN

**Kontext:** W1, W2, W13; §19/§21 fordern Wiederverwendung, gleichzeitig hat Datenintegrität Priorität 4. Ein klassisches `content_type/content_id`-Feld hat keine Foreign-Key-Integrität und Prisma unterstützt keine polymorphen Relationen.
**Entscheidung:** Basistabelle `content_items` mit Shared-Primary-Key-Subtypen (`posts.id = content_items.id` usw.). Lesestatus, Erinnerungen, Kommentare, Reaktionen, Anhänge, Zielgruppen, ACL, Suchindex, Benachrichtigungen hängen per echtem FK an `content_items`.
**Ersetzt aus §5:** `post_targets`, `handover_targets` → `content_audiences`; `post_reads`, `handover_reads` → `read_receipts`; `idea_comments` → `comments`.
**Ausnahme:** `content_translations` bleibt polymorph (abgeleitete Daten, betrifft auch Chat/Checklistenpunkte); Aufräumen per Event.
**Konsequenz:** Typkonsistenz (Subtyp passt zu `content_items.type`) per Trigger abgesichert (`prisma/sql`). Chatnachrichten sind bewusst **keine** Content-Items (anderes Sichtbarkeitsmodell, Volumen).

## ADR-005 · RBAC + objektbezogene ACL; RLS als optionale zweite Linie — ENTSCHIEDEN

**Kontext:** W3. Spec will Rechte „erstellen/lesen/bearbeiten/löschen/deaktivieren/herunterladen“ pro Dokument bzw. Wissensbereich – das ist objektbezogen und mit reinem RBAC nicht abbildbar.
**Entscheidung:** RBAC für Funktionsrechte (mit Scope Global/Gesellschaft/Gruppe) + ein generisches `resource_acl` für Kategorien und Objekte (Principal: Alle, Gesellschaft, Gruppe, Rolle, User; Aktionen als Enum-Array; Vererbung). News/Übergaben/Umfragen nutzen stattdessen die Zielgruppe als Leserecht. Details `docs/RBAC.md`.
**RLS:** Nicht im MVP (Prisma + RLS erfordert Session-Variablen je Transaktion und erschwert Migrationen). Architektur hält es offen: alle Abfragen laufen ohnehin über `visibleContentFilter`. Bewertung in Phase 6.

## ADR-006 · Gruppenmitgliedschaft am User, externe Accounts — ENTSCHIEDEN (06.10.2026)

**Kontext:** W4.
**Entscheidung:** `user_groups(user_id, group_id)` – auch Externe (Aushilfen, Dienstleister, Partnerbetriebe) können Zielgruppen und Checklisten-Teams angehören. Organisatorische Zuordnung zur Gesellschaft bleibt am `employee_profile`.
**Entschieden (06.10.2026):** Zugang bekommen neben Festangestellten auch Aushilfen und Externe (Dienstleister, Partner) – immer befristet: Pflichtfeld `valid_until`, höchstens 12 Monate, Verlängerung durch die einladende Gesellschaft. Externe standardmäßig ohne Mitarbeiterverzeichnis und ohne KI-Assistent; Aushilfen mit Gastromatic-Datensatz laufen über den normalen Freischaltprozess (ADR-021).

## ADR-007 · Rollenvergabe getrennt von IT-Administration — ENTSCHIEDEN

`roles.manage` liegt in einer eigenen Rolle; niemand kann Rechte vergeben, die er selbst nicht hat, und sich nicht selbst höher stufen. Vergabe sensibler Rechte wird auditiert. Optional später Vier-Augen-Freigabe.

## ADR-008 · KI-Assistent ohne Gesprächsspeicherung — ENTSCHIEDEN (Anbieter siehe ADR-022)

Fragen und Antworten werden serverseitig nicht dauerhaft gespeichert (nur anonymes Feedback „hilfreich ja/nein“ + technische Metriken). Retrieval ausschließlich über `visibleContentFilter`; ausgeschlossen sind Chat, Entwürfe, Kategorien mit `is_sensitive`. Zitierte Quellen werden nachgeprüft (⊆ übergebene Chunks). Begründung: Datenminimierung, Betriebsrat (keine Auswertung, wer was fragt).

## ADR-009 · MVP-Umfang und Phasen — ENTSCHIEDEN (05.10.2026)

**Kontext:** W6, W8.
**Entscheidung:** Die Phasenfolge aus §12 gilt. Die in §17 als „MVP/hohe Priorität“ genannten Punkte – Onboarding/Offboarding, erweiterte Checklisten, personalisierbares Dashboard (über die Grundstruktur hinaus), Umfrageauswertung, Übersetzung von Chat/Kommentaren/Checklisten – kommen in späteren Phasen und sind **nicht** Voraussetzung für den ersten Produktivbetrieb. Das Datenmodell bleibt dafür vorbereitet (keine Migration nötig, nur Funktionen).
**Folgen:**
- Push: Datenmodell und Präferenzen ab Phase 2, Versand ab Phase 6; bis dahin In-App + E-Mail. Ein Vorziehen von Web-Push (Aufwand ca. 1 Sprint) bleibt möglich, falls Übergaben ohne Push im Alltag nicht funktionieren.
- §17 „Phase 2“ (SOP-Medien, QR/NFC, Approval) wird als „nach Phase 6 / bei Bedarf“ geführt.

## ADR-010 · Dashboard vor Integrationen — ENTSCHIEDEN

Widgets werden in Phase 1 als Registry mit Rechte-Mapping angelegt. Widgets ohne Datenquelle liefern `state: "unavailable"` und werden standardmäßig ausgeblendet. Ab Phase 5 kommen Daten aus `external_entities`. Kein Doppelpflegen von Belegungs-/Eventdaten zur Überbrückung (§10).

## ADR-011 · Login und Passwort-Reset ohne dienstliche E-Mail — ENTSCHIEDEN (05.10.2026)

**Kontext:** W9.
**Entscheidung:**
1. Login über **Benutzername** (E-Mail optional, `users.email` nullable).
2. Reset bzw. Erstzugang durch berechtigte Person (`users.reset_password`): System erzeugt einen **Einmal-Code** (kurzlebig, z. B. 24 h, nur gehasht gespeichert), der per verifizierter E-Mail oder **persönlich übergeben** wird (Kanal `IN_PERSON`). Beim ersten Login Pflicht-Passwortwechsel. Kein Klartext-Passwort per Mail. Jeder Reset wird auditiert.
3. Self-Service-Reset nur bei verifizierter E-Mail.
4. MFA: vorbereitet; Pflicht zunächst nur für Admin-Rollen.

**Entschieden (06.10.2026):** Mitarbeitende dürfen freiwillig eine private E-Mail-Adresse hinterlegen, die ausschließlich für „Passwort vergessen“ genutzt wird (`users.recovery_email`, getrennt von der dienstlichen `email`, nie für Benachrichtigungen oder im Verzeichnis). Ohne E-Mail bleibt der Einmal-Code über die Leitung. SSO mit Microsoft-Konten: siehe ADR-035.

## ADR-012 · Lesestatus, Leserlisten, automatische Erinnerungen und Betriebsrat — BEKANNT, Betriebsvereinbarung erforderlich

**Kontext:** W10. Personengenaue Leserlisten mit Zeitstempel sind objektiv geeignet, Verhalten zu überwachen → Mitbestimmung nach § 87 Abs. 1 Nr. 6 BetrVG. Die Notwendigkeit einer Betriebsvereinbarung ist der Hoteldirektion bekannt (05.10.2026). (Keine Rechtsberatung.)
**Technisch umgesetzt (datensparsam):**
- Lesestatus nur, wenn pro Inhalt `read_tracking_enabled` gesetzt (Default aus).
- Zusammenfassung „18 von 24“ und Einzelliste getrennt berechtigt; keine personenübergreifenden Auswertungen, keine Exporte, keine Historie über Inhalte hinweg.
- Löschung der Lesezeitpunkte **30 Tage** nach Archivierung des Inhalts (entschieden 06.10.2026); bei Pflicht-SOP bleibt nur „bestätigt Version n am Datum“ bis zur nächsten Version).
- Manuelle Erinnerungen auditiert; automatische nur mit Limit und Intervall.
- Feature-Flag `read_tracking` global abschaltbar, bis die Vereinbarung unterschrieben ist – Phase 2 kann damit ohne Lesestatus live gehen.
**Leserliste für alle Empfänger:innen (Wunsch 06.10.2026):** Gewünscht ist, dass alle Empfänger:innen sehen, wer einen Beitrag gelesen hat und wer nicht. Das geht über die Spec hinaus (§20: Einzelliste nur für „berechtigte Verantwortliche“; §8: kein Kontrollinstrument) und macht Leseverhalten für das ganze Team sichtbar. Umsetzung daher als **Einstellung je Gesellschaft** (`companies.read_list_visibility`): `AUTHOR_AND_LEADS` (Spec-Standard, voreingestellt) oder `ALL_RECIPIENTS`. Die Stufe „alle“ wird erst nach ausdrücklicher Regelung in der Betriebsvereinbarung aktiviert. Unabhängig davon: Lesezeitpunkte nur als Datum, Löschung nach 30 Tagen, keine Auswertungen über Inhalte hinweg.
**Zuarbeit für die Betriebsvereinbarung:** `docs/RBAC.md` §7 und ADR-008, -013, -014, -015, -023 beschreiben Zweck, Einsichtsrollen und Fristen bereits in prüfbarer Form.

## ADR-013 · Anonyme Umfragen — ENTSCHIEDEN (06.10.2026)

**Entschieden:** Ergebnisse anonymer Umfragen erst ab **5 Antworten** (auch für Admins). Freitextfragen sind erlaubt – mit Hinweis beim Ausfüllen („Schreibstil kann Rückschlüsse erlauben“); Freitexte werden in zufälliger Reihenfolge und ohne Zeitstempel angezeigt.

**Kontext:** W11.
**Modell:** Teilnahme (`survey_participations`: WER, nur Datum) und Antwort (`survey_responses`: WAS, `respondent_id = NULL`) sind ohne Verknüpfung getrennt; Trigger verhindert `respondent_id` bei anonymen Umfragen. Erinnerungen an Nicht-Teilnehmende sind damit möglich, ohne Antworten zuordnen zu können.
**Restrisiko:** Bei sehr kleinen Teams sind Antworten trotzdem zuordenbar → Ergebnisse erst ab `min_group_size` (Default 5, technisch min. 3), auch für Admins.
**Bestätigung nötig:** Mindestgruppengröße; ob Freitext bei anonymen Umfragen erlaubt ist (Schreibstil verrät Personen).
`survey_results` aus §18 wird **keine** Tabelle – Ergebnisse werden aggregiert berechnet.

## ADR-014 · Benachrichtigungszeiten selbst einstellen — ENTSCHIEDEN (06.10.2026)

**Entscheidung:** Jede Person legt selbst fest, **wann** sie **welche** Benachrichtigungen auf welchem Kanal bekommt – z. B. „Übergaben per Push nur Mo–Fr 6–22 Uhr“, „wichtige News auch am Wochenende“, „Social nie per Push“. Außerhalb der eigenen Zeitfenster werden Push und E-Mail zurückgestellt und am Beginn des nächsten Fensters gebündelt zugestellt; in der App ist alles sofort sichtbar.
**Umsetzung:** `notification_preferences` je Ereignistyp und Kanal mit Zeitfenster (`window_start`, `window_end`, `weekdays`) und optionalem Mindest-Wichtigkeitsfilter. Sinnvolle Voreinstellungen je Rolle (z. B. Push 7–21 Uhr an Werktagen); die Plattform übersteuert die persönliche Einstellung nie – auch nicht bei „wichtig“.
**Betriebsrat:** Freiwilligkeit und Voreinstellungen in die Betriebsvereinbarung aufnehmen.

## ADR-015 · Chat — ENTSCHIEDEN (06.10.2026), Aufbewahrung siehe ADR-023

- Chatinhalte sind nur für Teilnehmende sichtbar; **keine** Admin-Leseberechtigung, nicht in globaler Suche, nicht im KI-Index.
- Kein „gelesen von“ pro Person in Gruppenchats; nur eigener Ungelesen-Zähler.
- **1:1-Chat: „gelesen“-Häkchen immer an** (Entscheidung 06.10.2026). Sichtbar nur für die beiden Beteiligten, nie für Dritte oder Admins, keine Auswertung. Hinweis: In Chats zwischen Führungskraft und Mitarbeitenden kann das Erwartungsdruck erzeugen – in der Betriebsvereinbarung aufgreifen.
- Aufbewahrung: Vorschlag 12 Monate, danach automatische Löschung (siehe ADR-023).
- Gruppenchats: Anlegen über `chat.create_group`; Moderation nur für Chat-Admins innerhalb des Chats.

## ADR-016 · Gästedaten aus Integrationen — ENTSCHIEDEN (06.10.2026)

**Entschieden:** Keine Gästenamen im Dashboard. Angezeigt werden nur Hausbelegung in %, Anzahl Anreisen und Anzahl Abreisen (plus Veranstaltungen aus dem Eventtool mit Raum, Uhrzeit und Personenzahl). Hinweis: Veranstaltungstitel aus dem Eventtool sollten keine Personennamen enthalten (z. B. „Hochzeit“ statt „Hochzeit Müller“) – ggf. wird im Adapter nur der Veranstaltungstyp übernommen.


Für das Dashboard reichen aggregierte Werte (Belegung %, Anzahl An-/Abreisen, Event-Titel, Raum, Uhrzeit, Personenzahl). **Keine Gästenamen oder Kontaktdaten** in `external_entities` im MVP. Read-Model läuft per `expires_at` ab. Falls Namen nötig (z. B. VIP-Anreise für Rezeption), nur rollenbeschränkt und nur für den laufenden Tag.

## ADR-017 · Anhänge vs. Dokumente — ENTSCHIEDEN (06.10.2026)

**Kontext:** W15.
Anhänge an News/Wissen/Übergaben bleiben **Anhänge** (`attachments` → `file_objects`) mit den Rechten des Elterninhalts – sie werden nicht zu versionierten Dokumenten mit eigener ACL. „Zentral auffindbar“ = eine Ansicht `GET /files-hub`, die alle für den User sichtbaren Anhänge plus Dokumente durchsucht. Ein Anhang kann per Aktion „als Dokument übernehmen“ in die Dokumentenablage kopiert werden.

## ADR-018 · Einfache Sprache — ENTSCHIEDEN (06.10.2026)

**Entscheidung:** Redaktionell mit KI als Hilfe – die KI erstellt auf Knopfdruck einen Vorschlag, die verantwortliche Person prüft und gibt ihn frei. Erst die freigegebene Fassung ist für alle sichtbar.

Hintergrund: Maschinell erzeugte „einfache Sprache“ kann bei SOPs/HACCP fachlich falsch werden. Modell: für Wissensartikel redaktionell gepflegtes Feld (`knowledge_versions.plain_language_text`); maschinelle Vereinfachung nur on demand und deutlich als „automatisch vereinfacht – verbindlich ist das Original“ gekennzeichnet (`content_translations.is_plain_language`).

## ADR-019 · Videos — ENTSCHIEDEN (06.10.2026)

**Entscheidung:** Kurze Videos in Wissensartikeln sind möglich, Untertitel sind Pflicht (WCAG 2.2 AA). Umsetzung: max. 200 MB, MP4/H.264, Untertitel-Datei (VTT) als Pflichtfeld für Videos in Wissensartikeln; Transcoding erst bei Bedarf.

## ADR-020 · Mitarbeitende in mehreren Gesellschaften — ENTSCHIEDEN (05.10.2026)

**Kontext:** W5. Bestätigt: Es gibt Personal, das mehreren Gesellschaften zugeordnet ist.
**Entscheidung:** Neue Tabelle `employee_company_assignments` (Profil ↔ Gesellschaft, mit `is_primary`, Tätigkeit je Gesellschaft, `valid_from`/`valid_to`, `source`). `employee_profiles.company_id` bleibt als Hauptgesellschaft erhalten und wird zusätzlich als `is_primary`-Zeile geführt.
**Folgen:**
- Gesellschafts-Scopes (HR, Abteilungsleitung, Admins) prüfen gegen **alle aktiven Zuordnungen** – eine Person ist für jede ihrer Gesellschaften sichtbar und adressierbar.
- Zielgruppe „Gesellschaft X“ umfasst alle aktiv zugeordneten Personen.
- Quelle der Zuordnungen ist nach Möglichkeit Gastromatic (Betriebe/Locations je Mitarbeiter:in, ADR-021); lokale Pflege nur, wenn Gastromatic die Zuordnung nicht liefert.
- Constraint: genau eine offene Hauptzuordnung je Profil (`prisma/sql`).

## ADR-021 · Gastromatic als führende Quelle für Personalstammdaten — ENTSCHIEDEN, technische Prüfung offen

**Entscheidung (05.10.2026):** Gastromatic ist die Personalsoftware und führend für Personalstammdaten. Eine separate Personalsoftware-Integration entfällt; `DataSource.PERSONNEL_SYSTEM` wurde aus dem Schema entfernt.

**Zielbild „automatische Anlage, manuelle Freischaltung“:**
1. Sync-Job liest Mitarbeitende aus Gastromatic (Polling, z. B. stündlich; Webhooks falls angeboten).
2. Unbekannte Personen → `users` mit Status **`PROVISIONED`** (neu im Enum) + `employee_profiles` + `employee_company_assignments`; Mapping in `external_entity_mappings`.
3. Berechtigte Person (HR/Abteilungsleitung) sieht eine Liste „Neu aus Gastromatic“, prüft Gruppen/Rollen und **schaltet live** → Status `INVITED`, Einmal-Code nach ADR-011, `activated_at` gesetzt, Audit-Eintrag.
4. Änderungen (Name, Tätigkeit, Betriebe) werden überschrieben; diese Felder sind in der Plattform schreibgeschützt.
5. Austrittsdatum in Gastromatic → automatische Deaktivierung zum Austrittstag, optional Start der Offboarding-Vorlage.
6. Selbst gepflegt bleiben nur Plattformfelder: Profilbild, „Über mich“, Sprache, Einstellungen.

**Datenminimierung:** Gastromatic liefert in vergleichbaren Anbindungen auch Adresse, Geburtsdatum und private Telefonnummern ([Hypersoft-Doku](https://dokumentation.hypersoft.de/Content/Interfaces/gastromatic_Mitarbeiterstamm.htm)). Diese Felder werden **nicht** übernommen. Übernommen werden nur: Name, Personalnummer, Tätigkeit/Arbeitsbereich, Betrieb/Location, Ein-/Austrittsdatum, optional dienstliche Kontaktdaten. Abwesenheiten nur als „abwesend von–bis“ ohne Grund (ADR-027).

**Prüfauftrag vor Umsetzung (an Gastromatic bzw. IT):**

| # | Frage | Warum |
|---|---|---|
| 1 | API-Zugang: Gastromatic stellt laut Partner-Dokus **Client ID und Client Secret** aus (OAuth-Client-Credentials) – für welchen Vertrag/Tarif, Kosten? | Voraussetzung |
| 2 | Lassen sich die Leserechte des API-Zugangs je Datenbereich einschränken? (Andere Anbieter fordern z. B. Lesezugriff auf alles außer Bewegungsdaten und Abwesenheiten.) | Datenminimierung |
| 3 | Ein API-Zugang für alle vier Gesellschaften oder je Gesellschaft/Betrieb? Wie werden Betriebe (LocationIDs) den Gesellschaften zugeordnet? | ADR-020 |
| 4 | Welche Endpunkte gibt es: Mitarbeitende, Betriebe, Arbeitsbereiche/Abteilungen, Dienstplan/Schichten, Abwesenheiten? Gibt es eine Feldauswahl? | Mapping, Dashboard „Mein Dienstplan“ |
| 5 | Änderungsabfrage (`updated_since`) oder Webhooks? Rate-Limits? | Sync-Design |
| 6 | Wird ein Austritt als Datum geliefert, bevor er wirksam wird? | Automatische Deaktivierung |
| 7 | Gibt es eine Sandbox/Testmandanten? | Staging ohne Echtdaten |
| 8 | AVV mit Gastromatic deckt die Weitergabe an die Plattform ab? | Datenschutz |

**Quellen:** [Hypersoft – gastromatic Einrichtung (Client ID/Secret, LocationIDs)](https://documentation.hypersoft.de/Content/Interfaces/gastromatic_Setup.htm) · [Beekeeper – gastromatic-Anbindung (API-Schnittstelle mit Leserechten)](https://help.beekeeper.io/hc/en-us/articles/19734469892242-Gastromatic)

**Phase:** Da die automatische Anlage den Pflegeaufwand für Phase 1 deutlich senkt, empfehle ich, den **Stammdaten-Sync** aus Phase 5 nach vorn zu ziehen (Ende Phase 1 / Anfang Phase 2), sobald der Prüfauftrag positiv beantwortet ist. Dienstplan-Widget bleibt Phase 5. Bis dahin: CSV-Import aus Gastromatic als Übergangslösung mit gleicher Mapping-Logik.

## ADR-022 · Externe Anbieter: Hosting, KI, Übersetzung, Sprache — EMPFEHLUNG, wartet auf DKB-Gruppe

**Stand 06.10.2026:** Vor der Auswahl wird bei der DKB-Gruppe angefragt, ob es freigegebene Cloud-Anbieter, Rahmenverträge oder Vorgaben gibt (Hosting, KI, Übersetzung, Microsoft 365). Die Empfehlung unten ist die Rückfallposition.

Anforderungen an alle: Verarbeitung in EU/EWR, AVV nach Art. 28 DSGVO, keine Nutzung der Daten zum Training, austauschbar über Adapter (§15.5). Vor Auswahl bitte prüfen, ob die **DKB-Gruppe bereits freigegebene Cloud-Anbieter oder Vorgaben** hat – das kann die Auswahl verkürzen.

| Baustein | Empfehlung | Alternative | Begründung / zu prüfen |
|---|---|---|---|
| **Hosting** (App, PostgreSQL, Object Storage, Secrets, Backups) | **STACKIT** (Schwarz Gruppe, Rechenzentren in Deutschland): Kubernetes oder Cloud Foundry, PostgreSQL Flex, Object Storage | IONOS Cloud; AWS Region Frankfurt | Deutscher Anbieter, kein US-Mutterkonzern (CLOUD-Act-Thema entfällt), alle Bausteine aus einer Hand, ein AVV |
| **KI-Assistent (LLM)** | Zweistufig entscheiden: (a) **STACKIT AI Model Serving** mit offenen Modellen (u. a. Llama 3.3 70B, GPT-OSS 120B, Gemma 4) in der Region EU01; (b) **Claude über Amazon Bedrock** mit regionalem Endpunkt Frankfurt bzw. EU-Inferenzprofil | Mistral (FR) | (a) maximale Souveränität, gleicher Anbieter wie Hosting; (b) in der Regel stärkere Antwortqualität bei deutschen Fachtexten. Vorschlag: vor Phase 3 beide mit 30 echten SOP-Fragen vergleichen, dann festlegen. Hinweis: Ich bin selbst ein Claude-Modell – der Vergleich sollte deshalb an euren eigenen Testfragen entschieden werden, nicht an meiner Einschätzung. |
| **Embeddings / semantische Suche** (später) | STACKIT AI Model Serving (E5 Mistral 7B bzw. Qwen3-Embedding) | gleicher Anbieter wie LLM | Daten bleiben beim Hosting-Anbieter |
| **Übersetzung** | **DeepL API Pro** mit AVV | LLM-basierte Übersetzung über den gewählten KI-Anbieter | DeepL Pro löscht Texte nach der Übersetzung und trainiert nicht damit; AVV nur über Pro/Vertrieb. Zu prüfen: Verarbeitungsort ist vertraglich nicht auf eigene Server festgelegt. Free-Version ist ausgeschlossen. |
| **Speech-to-Text** | Whisper (Open Source) selbst betrieben auf STACKIT-GPU oder als Batch im Worker | Azure AI Speech, Region Germany West Central | STACKIT bietet aktuell kein STT im Model Serving an. Volumen ist gering (Diktat von Wiki-Texten), Selbstbetrieb vermeidet weiteren Auftragsverarbeiter. |
| **Text-to-Speech (Vorlesen)** | Browser-eigene Sprachausgabe (`speechSynthesis`) | – | Läuft auf dem Gerät, keine Datenübertragung; Qualität geräteabhängig, für den Zweck ausreichend |
| **E-Mail-Versand** | EU-Transaktionsmail-Dienst (z. B. Brevo oder Mailjet, beide mit EU-Verarbeitung) bzw. vorhandener Exchange/SMTP-Relay | – | Erinnerungen und Einmal-Codes nur mit minimalem Inhalt („Neue Mitteilung in der App“) |
| **Web Push** | Standard-Web-Push (VAPID) | – | Läuft technisch zwingend über die Push-Dienste von Google/Apple/Mozilla; Inhalt Ende-zu-Ende verschlüsselt, trotzdem nur generische Texte ohne Inhalte senden |
| **Fehler-Tracking / Monitoring** | Sentry selbst gehostet oder Sentry EU-Region; Grafana-Stack auf STACKIT | – | Keine Inhaltsdaten in Logs |
| **Virenscan** | ClamAV selbst betrieben | – | Kein Dateiversand an Dritte |

**Quellen (Stand 05.10.2026):** [STACKIT – verfügbare Modelle](https://docs.stackit.cloud/products/data-and-ai/ai-model-serving/basics/available-shared-models/) · [Claude in Amazon Bedrock – EU-Regionen](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock) · [DeepL Pro – Datenschutz/AVV](https://a7.de/en/blog/can-i-use-deepl-at-work/)

**Noch zu tun:** Kostenschätzung je Option, AVVs anfordern, Datenschutz-Folgenabschätzung für KI-Assistent und Lesestatus.

## ADR-023 · Aufbewahrungs- und Löschfristen — TEILWEISE ENTSCHIEDEN

**Entschieden (06.10.2026):** Chat 12 Monate, Lesezeitpunkte 30 Tage, HACCP-Checklisten 2 Jahre, Social ohne automatische Löschung, Accounts manuell deaktivieren und löschen. Übrige Werte sind Vorschläge; alle Fristen vom Datenschutz bestätigen lassen und in die Betriebsvereinbarung übernehmen.

**Hinweise zu zwei Entscheidungen:**
- *Accounts ohne Automatik:* Berechtigte (`users.delete`) können Zugänge deaktivieren und endgültig löschen bzw. anonymisieren (mit Audit-Eintrag). Weil die DSGVO verlangt, dass Daten nicht länger als nötig gespeichert werden, zeigt die Verwaltung eine Liste „seit mehr als 6 Monaten deaktiviert“ als Erinnerung; die Löschung bleibt eine bewusste Aktion. Beim Löschen werden Social-Beiträge, private E-Mail und Einstellungen entfernt; dienstliche Inhalte (News, SOPs, Übergaben) bleiben als „ehemalige:r Mitarbeiter:in“.
- *Social ohne Frist:* Eigene Beiträge sind jederzeit löschbar und werden beim Löschen des Accounts entfernt. Empfehlung: im Datenschutzkonzept begründen und regelmäßig (z. B. jährlich) überprüfen.

| Daten | Frist |

|---|---|
| Sessions | 30 Tage nach Ablauf |
| Lesezeitpunkte | **30 Tage** nach Archivierung des Inhalts (entschieden); Kenntnisnahme Pflicht-SOP bis Folgeversion + 12 Monate (Vorschlag) |
| Erinnerungen, Notification-Deliveries | 90 Tage |
| Chatnachrichten | **12 Monate (entschieden)** |
| Audit-Logs | 12 Monate (sicherheitsrelevant), Rechteänderungen 3 Jahre |
| HACCP-Checklisten-Läufe | **2 Jahre** (entschieden) |
| Social-Beiträge | **keine automatische Löschung** (entschieden); Biete & Suche endet nach 30 Tagen |
| Integrations-Read-Models | bis `expires_at` (Tage) |
| Deaktivierte Accounts | **manuell** deaktivieren und löschen (entschieden); Erinnerungsliste nach 6 Monaten |

## ADR-024 · „Notfallkontakte“ — ENTSCHIEDEN (06.10.2026)

**Entschieden:** Gemeint sind Notdienste von Firmen. Private Notfallkontakte von Mitarbeitenden bleiben in Gastromatic und werden nicht übernommen.

Modelliert sind **Notdienste von Firmen** (`contacts.is_emergency_contact`, `emergency_phone`) – z. B. 24/7-Aufzug, Heizung, Schlüsseldienst. **Private Notfallkontakte von Mitarbeitenden** sind nicht modelliert; sie gehören in die Personalsoftware (Datenminimierung, keine Personalakte §15.2). 

## ADR-025 · Wiki-Struktur: Kategorien → Unterkategorien → Artikel → Kapitel — ENTSCHIEDEN

Kategorien als Baum (`knowledge_categories.parent_id`); Kapitel sind Artikel mit `parent_article_id`, damit jedes Kapitel eigene Version, Lesestatus und Verlinkung (QR, Checklistenpunkt) haben kann. SOPs, Richtlinien, HACCP, Brand Standards sind `article_type` desselben Modells – kein zweites Wiki (§19).

## ADR-026 · On-/Offboarding als ein Lifecycle-Modell — ENTSCHIEDEN

**Kontext:** W13.
`lifecycle_templates (kind)` → `lifecycle_template_steps` → beim Start `lifecycle_instances` für ein Profil; jeder Schritt erzeugt eine **Aufgabe** (`tasks`) und/oder einen **Checklisten-Lauf** (`checklist_runs`) und kann eine Richtlinie mit Kenntnisnahme verlinken. Fortschritt = erledigte Tasks/Runs der Instanz. Keine eigenen „onboarding_steps“-Ausführungsdaten. Sensible HR-Dokumente werden nur verlinkt, nie in die Plattform kopiert.

## ADR-027 · Abwesenheiten ohne Grund — ENTSCHIEDEN

`absences.type` kennt keinen Wert „krank“. Andere sehen nur „abwesend bis …“. Gesundheitsdaten (Art. 9 DSGVO) bleiben in der Personalsoftware. Urlaub/Dienstreise/Schulung können optional als Typ gezeigt werden – Sichtbarkeit für Kolleg:innen bitte mit Betriebsrat bestätigen.

## ADR-028 · Empfängerkreis als Snapshot mit Nachtrag — ENTSCHIEDEN

Die Basis für „x von y gelesen“ wird beim Veröffentlichen materialisiert (`content_recipients`). Neue Gruppenmitglieder werden bei `include_late_joiners` nachgetragen; Austretende werden mit `removed_at` aus der Zählung genommen, aber nicht gelöscht (Nachvollziehbarkeit „wer war Empfänger“). So bleibt die Zahl stabil und erklärbar.

## ADR-029 · Prisma-Version und SQL-Ergänzungen — ENTSCHIEDEN

- Schema validiert mit Prisma 6.19 (Schema-Engine-WASM). Prisma 7 verlagert die Datenbank-URL in `prisma.config.ts`; Wechsel zu Beginn von Phase 1 prüfen.
- Was Prisma nicht ausdrücken kann, steht in `prisma/sql/0001_constraints_draft.sql` (CHECKs, partielle Unique-Indizes, `NULLS NOT DISTINCT`, Typ-Trigger, Anonymitäts-Trigger, generierte `tsvector`-Spalte, Audit-Rechte) und wird an die erste Migration angehängt. Die generierte Spalte `search_chunks.tsv` muss in der Migrations-Pipeline gegen Drift-Erkennung abgesichert werden.
- Erfordert PostgreSQL ≥ 15.

## ADR-030 · Offline-Umfang der PWA — ENTSCHIEDEN (06.10.2026)

**Entschieden:** Offline nutzbar sind (1) Checklisten abhaken, (2) zuletzt geöffnete SOPs lesen, (3) Übergaben schreiben und (4) zuletzt geladene News und Chats lesen. Geschriebenes wird verschlüsselt im Gerät zwischengespeichert und automatisch übertragen, sobald wieder Netz da ist; die App zeigt deutlich „noch nicht gesendet“.
**Technische Folgen ab Phase 2/4:** Alle schreibenden Endpunkte für Übergaben und Checklisten-Punkte akzeptieren eine vom Gerät erzeugte ID + `Idempotency-Key` und einen Geräte-Zeitstempel (doppeltes Senden ist harmlos). Konfliktregel: letzter Eintrag je Checklistenpunkt gewinnt, Übergaben kollidieren nicht. Offline-Cache wird beim Abmelden und bei Sperrung des Accounts gelöscht; sensible Kategorien werden nie offline gespeichert.

Ursprüngliche Analyse:

Spec sagt nur „Offline“ (Phase 6). Relevante Fälle: HACCP-/Schicht-Checklisten in Kühlräumen, Keller, Außengelände ohne Empfang; SOP-Lesen am Gerät. Empfehlung: offline **lesen** für zuletzt geöffnete Wissensartikel und **Checklisten-Läufe abhaken** mit späterer Synchronisation (Konfliktregel: letzter Eintrag pro Punkt gewinnt, Zeitstempel vom Gerät). Chat/News offline nur lesend aus Cache. Falls Offline-Checklisten gewollt sind, muss das API-Design der Run-Items das ab Phase 4 berücksichtigen (idempotente Updates mit Client-Zeitstempel).

## ADR-031 · Social: Privates unter Kolleg:innen, getrennt von News — ENTSCHIEDEN (05.10.2026)

**Kontext:** W16. Gewünscht ist ein eigener Bereich für private Beiträge, z. B. Urlaubsgrüße mit Foto oder „Wer möchte mein Fahrrad kaufen?“.
**Entscheidung:** Social nutzt dasselbe Modell wie News (`posts` + Kommentare, Reaktionen, Anhänge, Übersetzung) mit `posts.kind = SOCIAL` – kein zweites Feed-Modell (§19). Eigener Menüpunkt „Social“, getrennt von den dienstlichen News.

| Regel | News | Social |
|---|---|---|
| Wer darf posten | Redaktion, Leitungen (`news.publish`) | alle Mitarbeitenden (`social.post`), Externe standardmäßig nicht |
| Kategorien | – | Grüße & Momente · Biete & Suche · Glückwünsche · Freizeit & Sport · Sonstiges |
| Sichtbarkeit | Zielgruppe | wählbar: alle Kolleg:innen / eigene Gesellschaft / eigenes Team |
| Lesestatus, Kenntnisnahme, Erinnerungen | optional | **technisch ausgeschlossen** |
| Benachrichtigungen | nach Präferenz | standardmäßig aus (Opt-in), nie „wichtig“ |
| Biete & Suche | – | Preis als Freitext, „erledigt“-Markierung, endet automatisch nach 30 Tagen; Kontakt per 1:1-Chat |
| Aufbewahrung | nach ADR-023 | eigene Beiträge jederzeit löschbar; keine automatische Löschung (06.10.2026) |
| Moderation | Leitungen | Melden-Funktion (`content_reports`), Bearbeitung durch `social.moderate`; Nutzungsregeln beim ersten Posten bestätigen |
| Suche / KI | ja | Social in globaler Suche ja, **nicht** im KI-Index |

**Geburtstage & Jubiläen:** nur mit Opt-in in den eigenen Einstellungen; Geburtstag wird selbst als Tag/Monat eingetragen (ohne Jahr) und nicht aus Gastromatic übernommen. Jubiläen aus dem Eintrittsdatum nur bei Opt-in.
**Schema:** `PostKind`, `SocialCategory`, `MarketplaceIntent`, Felder `price_label`, `listing_closed_at` an `posts`; Opt-in-Felder an `user_settings`; neue Tabelle `content_reports`. Constraints in `prisma/sql`.
**Betriebsrat:** Social ist freiwillig; keine Auswertung von Aktivität (wer postet/liked wie viel). In die Betriebsvereinbarung (ADR-012) aufnehmen.

## ADR-032 · Freigabe-Workflows vorbereitet — ENTSCHIEDEN

Kein generisches Workflow-Modul (§11 „keine komplexen Workflows“). Vorbereitet sind `checklists.requires_approval` und `checklist_runs.approval_status/approved_by/approved_at`; Wissensartikel haben Versionsstatus DRAFT/PUBLISHED. Ein generisches `approval_requests`-Modell erst, wenn ein zweiter Anwendungsfall konkret wird.

## ADR-033 · QR-/NFC-Links nur mit Login — ENTSCHIEDEN

QR-Code enthält nur einen nicht erratbaren Slug (`/q/{slug}`); Aufruf erfordert Anmeldung und Leserecht auf das Ziel. Keine öffentlich lesbaren Anleitungen über QR (Gäste könnten Codes scannen).

---

## ADR-034 · Stiftungsgruppenweite Nutzung (Ausbaustufe 2) — ENTSCHIEDEN (05.10.2026), Details offen

**Anforderung (Hoteldirektion):** Das System soll in einem zweiten Schritt in der gesamten Stiftungsgruppe genutzt werden – mit Farben und Logos der jeweiligen Gesellschaften. Gesellschaftsübergreifende Funktionen sind erwünscht.

**Entscheidung: eine Installation, mehrere Gesellschaften (kein separates System je Haus).**
- `companies` wird ein Baum: `FOUNDATION` (Stiftung) → `LOCATION` (Wirkungsort/Marke, z. B. Schloss & Gut Liebenberg) → `LEGAL_ENTITY` (die Gesellschaften darunter). Die vier SGL-Gesellschaften hängen unter dem Wirkungsort SGL.
- **Branding** je Knoten in `company_brandings` (Aktionsfarbe, Flächenfarbe für Navigation, Dunkel-/Tönungsfarbe, Logo positiv/negativ bzw. Regel „Logo nur auf Weiß“, Favicon, Footer, optional eigene Domain – Details ADR-039). Auflösung: Hauptgesellschaft der Person → nächster Knoten mit Branding. Farben werden beim Speichern auf WCAG-Kontrast geprüft; die UI nutzt ausschließlich Design-Tokens, damit ein Wechsel ohne Code-Änderung wirkt.
- **Scopes erben nach unten:** Eine Rolle im Scope „Wirkungsort SGL“ gilt für alle vier SGL-Gesellschaften; „Stiftung“ für alle. Zielgruppen und ACL-Principals vom Typ `COMPANY` schließen Untergesellschaften ein.
- **Gesellschaftsübergreifend (Ausbaustufe 2):** stiftungsweite News, Social mit Sichtbarkeit „ganze Stiftungsgruppe“, geteilte Wissensbereiche (Richtlinien, Vorlagen), gemeinsames Kontakt-/Lieferantenverzeichnis, Chats über Gesellschaften hinweg, gruppenweite Umfragen und Ideen, ein Login für Personal in mehreren Gesellschaften (ADR-020).
- **Bleibt getrennt:** Administration, Rollen und Gruppen je Gesellschaft; Dienstplan, Belegung, Übergaben, Checklisten; vertrauliche Dokumente; Integrationen (je Gesellschaft eigene Zugangsdaten); Feature-Schalter wie Lesestatus je Gesellschaft (unterschiedliche Betriebsvereinbarungen).
- **Phase 1 legt das bereits an** (Baum, Scopes mit Vererbung, Tokens), aktiviert ist nur SGL. Ausbaustufe 2 ist damit Konfiguration plus Onboarding, kein Umbau.

**Offen vor Ausbaustufe 2:**
| # | Frage | Wer |
|---|---|---|
| 1 | Welche Gesellschaften/Wirkungsorte, in welcher Reihenfolge? Farben und Logos liefern | Stiftung, Marketing |
| 2 | Datenschutzrahmen: Es gibt kein Konzernprivileg – Vereinbarung zwischen den Gesellschaften (gemeinsame Verantwortlichkeit Art. 26 DSGVO bzw. Auftragsverarbeitung) für gemeinsame Bereiche | Datenschutz der Gesellschaften |
| 3 | Mitbestimmung je Gesellschaft bzw. Konzern-/Gesamtbetriebsrat | Geschäftsführungen, HR |
| 4 | Wer betreibt und bezahlt die Plattform (Kostenverteilung, Stiftungs-IT)? | Stiftung, Geschäftsführungen |
| 5 | Nutzen die anderen Gesellschaften ebenfalls Gastromatic oder andere Personalsoftware? (je Gesellschaft eigener Adapter möglich) | IT |
| 6 | Eigene Domain je Wirkungsort oder eine gemeinsame Adresse? | IT, Marketing |
| 7 | Freigabe der Stiftung für ihr Logo im WIR und offizielle Logo-Dateien (SVG, positiv) | Stiftung, Kommunikation |

## ADR-035 · Open-API-Strategie und Microsoft 365 (Teams/Outlook) — ENTSCHIEDEN (Strategie) / PRÜFUNG (Microsoft 365)

**Anforderung (05.10.2026):** Weitere Tools sollen angebunden werden können; neue Systeme ohne Umbau. Eine Anbindung der Microsoft-Teams-/Outlook-Welt wäre wünschenswert, muss aber technisch geprüft werden.

**Open-API-Strategie (entschieden):**
1. **API-first:** Jede Funktion der Plattform ist über die dokumentierte REST-API (OpenAPI 3.1, versioniert `/api/v1`) erreichbar – die eigene Oberfläche nutzt dieselbe API.
2. **Eingehend (andere Systeme → Plattform):** registrierte `api_clients` mit OAuth2 Client Credentials, eng begrenzten Scopes, Rate-Limit, optional IP-Allowlist, Ablaufdatum; jeder Zugriff wird protokolliert. Sensible Kategorien und Chats sind für API-Clients grundsätzlich gesperrt.
3. **Ausgehend (Plattform → andere Systeme):** `webhook_subscriptions` für Ereignisse (z. B. `task.created`, `checklist_run.completed`, `user.activated`), HMAC-signiert, mit Wiederholungen; Nutzlast nur IDs und Minimaldaten.
4. **Adapter für Systeme ohne passende API:** einheitliches Adapter-Interface (`pull/map/upsert`); `integrations.key` ist frei wählbar, d. h. neue Systeme brauchen keine Schemaänderung. Je Gesellschaft eigene Zugänge möglich (ADR-034).
5. **Führendes System bleibt führend** (§10) – die Plattform spiegelt nur, was sie anzeigen muss.

**Microsoft 365 – Prüfauftrag:** Technisch läuft das über Microsoft Graph und Entra ID; ob und in welchem Umfang hängt vom vorhandenen M365-Mandanten und den Lizenzen ab.
| Mögliche Anbindung | Weg | Zu prüfen |
|---|---|---|
| Anmeldung mit Microsoft-Konto (SSO) | Entra ID (OpenID Connect) | Wer hat ein M365-Konto? Mitarbeitende ohne Konto behalten Benutzername + Einmal-Code (ADR-011) |
| Kalender-Synchronisation mit Outlook | Graph Calendar API | Richtung (nur Plattform → Outlook oder beidseitig), Freigabe durch IT/Admin-Consent |
| Benachrichtigungen in Teams | Teams-Bot bzw. Graph Activity Feed | Kanal vs. persönlicher Chat, Datenschutz der Inhalte (nur Hinweis + Link) |
| Plattform als Tab in Teams | Teams-App mit eingebetteter Web-App | Zustimmung der IT, Tenant-Richtlinien |
| Dateien aus SharePoint/OneDrive verlinken | Graph Files API | Rechte bleiben in M365 |

Vor Umsetzung: Bestandsaufnahme des M365-Mandanten (Lizenzen, Nutzerkreis, Richtlinien der DKB-Gruppe), Datenschutzprüfung, ggf. Prototyp.

## ADR-036 · Smartphone-Navigation selbst konfigurierbar — ENTSCHIEDEN (06.10.2026)

Die untere Leiste der App ist je Person konfigurierbar (bis zu vier Bereiche plus „Mehr“). Voreinstellung: **Start · News · Übergaben · Chat · Mehr**. Gesellschaften können je Rolle eine andere Voreinstellung festlegen (z. B. Küche mit Checklisten). Gespeichert in `user_settings.mobile_nav_items`; nur Bereiche, auf die die Person Rechte hat, sind wählbar.

## ADR-037 · Veröffentlichen, Moderation, KI-Nutzerkreis und Pilot — ENTSCHIEDEN (06.10.2026)

- **News veröffentlichen:** Alle Mitarbeitenden dürfen dienstliche News veröffentlichen. Damit der Unterschied zu Social und die Bedeutung von „wichtig“ erhalten bleiben, schlage ich drei Leitplanken vor (Rechte, jederzeit änderbar):
  1. „Wichtig“, Lesestatus, Erinnerungen und Pflichtlektüre setzen nur Leitungen (`news.mark_important`, `news.require_read`).
  2. Zielgruppe „ganze Gesellschaft/Stiftung“ nur für Abteilungsleitungen und Direktion; alle anderen an eigene Teams/Abteilungen.
  3. News lassen sich melden; das Moderationsteam kann sie ausblenden.
- **Moderation:** ein kleines, benanntes Moderationsteam (2–3 Personen, Rolle `moderator`) bearbeitet Meldungen zu Social, Kommentaren und News. Empfehlung: Zusammensetzung mit dem Betriebsrat abstimmen.
- **KI-Assistent:** alle Mitarbeitenden inkl. Azubis; Aushilfen und Externe ohne (ADR-006).
- **Pilot:** Start mit **Rezeption** und **Verkauf / Veranstaltungen**. Folge für die Reihenfolge: Übergaben, Chat, News und das Veranstaltungs-Widget sind für den Pilot am wichtigsten; die Eventtool-Anbindung früh prüfen. HACCP-Checklisten (Küche) folgen nach dem Pilot.

## ADR-038 · Produktname „WIR – Das Mitarbeiterportal“ — ENTSCHIEDEN (09.10.2026)

**Entscheidung:** Die Plattform heißt **WIR**, im Untertitel „Das Mitarbeiterportal“. Der Name kommt aus dem Motto „Weil Wir Wirkt“ und trägt über die ganze Stiftungsgruppe, weil er keinen Ort nennt. Den Arbeitstitel „Wirkstatt“ haben wir verworfen.

**Schreibweise und Sprachgebrauch**
- Wortmarke immer in Versalien: **WIR**. Im Text mit Artikel „das WIR“: „steht im WIR“, „Willkommen im WIR“.
- Erste Nennung in Dokumenten: „WIR – Das Mitarbeiterportal“.
- Der Name ist ein globaler Produktname (Konfiguration `APP_NAME`, Manifest der PWA, E-Mail- und SMS-Texte). Er wird nicht je Gesellschaft geändert; jede Gesellschaft bringt nur ihr Logo und ihre Farben mit (ADR-034, ADR-039).

**Offen:** Marken- und Domainprüfung (DPMA, Domain z. B. für eine eigene Adresse). Da „WIR“ ein gewöhnliches Wort ist, ist eine Marke eher als Wort-Bild-Marke realistisch; für den internen Gebrauch nicht zwingend.

## ADR-039 · Auftritt der DKB STIFTUNG und Sicht für Stiftungsmitarbeitende — ENTSCHIEDEN (09.10.2026)

**Anforderung (Hoteldirektion):** Mitarbeitende der Stiftung sehen das WIR im Corporate Design der DKB STIFTUNG, mit Logo und dem richtigen Blau. **Verbindliche Markenregel: Das Logo der DKB STIFTUNG wird immer auf weißem Hintergrund dargestellt.**

**Entscheidung**
1. **Die Stiftung ist eine Gesellschaft im Baum** (`companies.kind = FOUNDATION`) mit eigenem `company_brandings`-Eintrag. Wer der Stiftung zugeordnet ist (`employee_company_assignments`), bekommt deren Auftritt – automatisch beim Anmelden, ohne Umschalter.
2. **Zwei Farben statt einer:** `primary_color` ist die Aktionsfarbe (Buttons, Links) und muss mit weißer Schrift mindestens 4,5 : 1 Kontrast erreichen. `surface_color` ist die Farbe großer Flächen (Navigation, Kopfzeile, Anmeldeseite).
   - DKB STIFTUNG: Fläche **#1A8FE3** (Blau des Logos), Aktion **#0066CC** (DKB Blue laut Markenrichtlinie). Grund: Weiße Schrift auf #1A8FE3 erreicht nur rund 3,4 : 1 (#0066CC: 5,6 : 1) und wäre für Buttons zu schwach; auf großen Flächen mit kräftiger Schrift ist sie vertretbar und trifft den Markenton.
   - SGL: beide Farben #6B7A3E (Fläche = Aktion).
3. **Logo nur auf Weiß:** `logo_requires_white = true`. Die UI zeigt das positive Logo auf einer weißen Fläche mit Schutzraum – in der Navigation, in der mobilen Kopfzeile, auf der Anmeldeseite und in Dialogen, auch im Dunkelmodus. Ein Negativ-Logo darf für diese Gesellschaft nicht hinterlegt werden (DB-Constraint `company_brandings_logo_white_chk`).
4. **Module je Gesellschaft:** `companies.disabled_modules`. Für die Stiftungsebene sind `HANDOVERS`, `CHECKLISTS`, `SHIFTS` und `OCCUPANCY` abgeschaltet. Wer nur der Stiftung zugeordnet ist, sieht diese Bereiche nicht; wer zusätzlich einem Haus zugeordnet ist, sieht sie für dieses Haus. Die Rechteprüfung bleibt serverseitig (RBAC), die Modulschaltung blendet zusätzlich aus.
5. **Startseite für Stiftungsmitarbeitende:** Überblick über die Gesellschaften im WIR statt der Hauskennzahlen; gruppenweite News und von den Häusern für die Gruppe freigegebene Inhalte. Interne Themen eines Hauses (z. B. HACCP-Pflichtlektüre in Liebenberg) erscheinen nicht.

**Umsetzung:** Felder `surface_color`, `logo_requires_white` in `company_brandings`, Enum `AppModule` und `companies.disabled_modules` in `schema.prisma`; Constraints in `0001_constraints_draft.sql`. In der Demo zeigt die Person „Nora S. (DKB STIFTUNG)“ diese Sicht.

**Offen:** Freigabe der Stiftung zur Logo-Nutzung und offizielle Logo-Dateien als SVG (ADR-034, Frage 7).

## ADR-040 · Umsetzung Phase 2 (Kommunikation) — ENTSCHIEDEN (10.10.2026)

1. **Empfänger:innen werden beim Veröffentlichen festgeschrieben** (`content_recipients`). Sichtbar ist ein Beitrag für Empfänger:innen und Autor:in. Neue Kolleg:innen erhalten laufende Beiträge ihrer Zielgruppen der letzten 60 Tage bei der Freischaltung („include_late_joiners“).
2. **Leitplanken für News (ADR-037) als Recht:** neues Recht `news.publish_wide` für Zielgruppe „ganze Gesellschaft/Stiftung“ (Abteilungsleitung, Redaktion Stiftung). Alle anderen schreiben an eigene Teams. „Wichtig“ (`news.mark_important`) und Anheften (`news.pin`) bleiben Leitungen vorbehalten. Externe erhalten nur Inhalte, die an ihre Gruppe oder sie persönlich gehen.
3. **Gelesen-Markierung:** Damit „ungelesen“ funktioniert, wird je Person und Beitrag ein Eintrag mit **Datum ohne Uhrzeit** gespeichert. Einsehbar ist er nur über den Lesestatus – und der ist nur verfügbar, wenn der Schalter `feature.read_tracking` an ist **und** der Beitrag mit Lesestatus veröffentlicht wurde (ADR-012). Bis zur Betriebsvereinbarung ist der Schalter aus.
4. **Erinnerungen** nur manuell, an Ungelesene, höchstens zweimal je Person und Beitrag, protokolliert. Automatische Erinnerungen folgen mit dem Job-System.
5. **Erwähnungen** benachrichtigen nur Personen, die den Inhalt sehen dürfen. Bei Übergaben werden Erwähnte außerhalb des Teams ausdrücklich Empfänger:innen.
6. **Social:** nie „wichtig“, ohne Lesestatus; Benachrichtigung der Autor:in bei Kommentaren nur mit Opt-in. Biete & Suche endet nach 30 Tagen. Meldungen gehen anonym an Personen mit `social.moderate`; Ausblenden ist protokolliert.
7. **Chat:** Abfrage alle 4 Sekunden im offenen Chat (WebSocket später, ADR-001). Keine Benachrichtigung mit Nachrichteninhalt; Erwähnungen in Gruppen erzeugen einen Hinweis ohne Text. Nachrichten werden nach 365 Tagen automatisch gelöscht (ADR-023). Gruppen anlegen: `chat.create_group` (Leitungen).
8. **Bilder:** Jedes hochgeladene Foto wird serverseitig neu berechnet (WebP, max. 2000 px) – dadurch entfallen Ortsdaten und andere Metadaten. Abruf nur, wenn der zugehörige Inhalt bzw. Chat sichtbar ist. Speicher in Phase 2: lokales Verzeichnis (`STORAGE_DIR`); vor Produktivbetrieb EU-Object-Storage und Virenscan.
9. **Benachrichtigungen** in Phase 2 nur in der App (Glocke, Zähler). Push und E-Mail mit persönlichen Zeitfenstern (ADR-014) folgen in Phase 6.

## ADR-041 · Umsetzung Phase 3+4 (Wissen & Zusammenarbeit) — ENTSCHIEDEN (10.10.2026)

Phase 3 und 4 wurden zusammengelegt und bewusst schlank umgesetzt: **kein neues Datenmodell, keine Migration** – alle Bereiche nutzen das vorhandene Content-Gerüst (Empfänger:innen, Sichtbarkeit, Kommentare, Likes, Benachrichtigungen).

1. **Wissen:** jede Änderung ist eine neue Version, alte bleiben lesbar. „Gelesen und verstanden“ gilt je Version (nur Datum gespeichert, ADR-012); verlangen dürfen es Abteilungsleitung und Redaktion Wissen. Zahlen „x von y bestätigt“ sehen nur Berechtigte zum Bearbeiten, ohne Namen. Optional „Einfache Sprache“ als zweiter Text.
2. **Dokumente:** PDF, Word, Excel, PowerPoint bis 20 MB, Typ per Dateikennung geprüft, unverändert gespeichert, Versionen. Kategorien mit `is_sensitive` (z. B. Personal) werden **nie** indexiert – also nie in Suche oder KI.
3. **Suche & KI = ein Retrieval-Weg:** Volltext (Postgres, deutsch) über Wissen, Dokumente und News; Treffer nur aus Inhalten, bei denen die Person Empfänger:in ist. Der KI-Assistent bekommt ausschließlich diese Treffer als Quellen, antwortet mit Quellenangaben, Fragen werden nicht gespeichert. Ohne konfigurierten Anbieter (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` – OpenAI-kompatible Schnittstelle) zeigt er nur die passenden Fundstellen. **Anbieterwahl bleibt offen** (STACKIT vs. Bedrock, Test mit 30 echten SOP-Fragen). Social, Chat und Übergaben sind bewusst nicht durchsuchbar.
4. **Aufgaben:** an sich selbst (alle mit `tasks.create`), an Personen und Teams nur mit `tasks.assign` im passenden Geltungsbereich. Ändern dürfen Zugewiesene und Ersteller:in; abbrechen nur die Ersteller:in. „Erledigt“ benachrichtigt die Ersteller:in.
5. **Checklisten:** Vorlage → Lauf mit Momentaufnahme der Punkte. Temperatur/Zahl gegen Grenzwerte; jede Abweichung braucht eine eingetragene Maßnahme, sonst kein Abschluss. Abweichungen gehen als „wichtig“ an die Teamleitung. Wiederkehrende Läufe (RRULE), Freigabe durch Leitung und Offline-Abhaken folgen mit dem Job-System bzw. Phase 6.
6. **Umfragen (ADR-013):** Teilnahme und Antwort getrennt; anonym = keine Personen-ID (DB-Trigger). Ergebnisse erst ab 5 Antworten, Freitexte in zufälliger Reihenfolge, Datum ohne Uhrzeit. Zielgruppen nach denselben Regeln wie News.
7. **Ideen:** sichtbar fürs ganze Haus, Unterstützen = Like, Status mit Verlauf nur durch `ideas.manage`; Einreicher:in wird benachrichtigt.
8. **Kontakte:** nur externe Firmen/Notdienste (ADR-024), Notdienstnummer als großer Anruf-Button. Pflege mit `contacts.manage` (neu bei Abteilungsleitung); `contacts.view_emergency` neu für alle Mitarbeitenden.
9. **Team:** Verzeichnis der eigenen Gesellschaft(en) – Name, Tätigkeit, Bereich, Leitung. Keine privaten Daten.
10. **Ausgeschaltete Module sperren jetzt auch die API** (nicht nur das Menü), z. B. Checklisten und Übergaben für die Stiftung → 403.

## ADR-042 · Lesestatus für alle dienstlichen Einträge — ENTSCHIEDEN (10.10.2026)

**Wunsch der Hoteldirektion:** Bei allen Einträgen sehen, wer gelesen hat und wer nicht.
**Umsetzung:**
- Gilt automatisch für News, Übergaben, Wissen, Dokumente, Aufgaben, Checklisten und Ideen. Bei Umfragen zählt die **Teilnahme** – Antworten bleiben anonym (ADR-013). Das Häkchen pro Beitrag beim Schreiben entfällt (`news.require_read` gestrichen).
- **Nicht** für Social (privat, ADR-031) und Chat (1:1 hat ✓✓, Gruppen nicht).
- Gelesen = Detailseite geöffnet; bei Dokumenten auch Öffnen der Datei. Gespeichert wird nur das Datum.
- Sehen dürfen weiterhin nur Autor:in sowie Leitungen mit `read_status.view_summary`/`view_details`; erinnern mit `reminders.send_manual` (max. 2×).
- **Der globale Schalter `feature.read_tracking` bleibt.** In der Demo ist er an. Für den Echtbetrieb gilt weiter ADR-012: personengenaue Leserlisten sind mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 6 BetrVG) – Schalter erst nach unterschriebener Betriebsvereinbarung einschalten. (Keine Rechtsberatung.)

## ADR-043 · Push, Hintergrund-Erinnerungen, Freigabe, Ein-/Austritt — ENTSCHIEDEN (10.10.2026)

Ohne Datenbank-Migration – alle Tabellen waren vorbereitet.

1. **Push aufs Handy (Web-Push, VAPID):** Jedes Gerät meldet sich in den Einstellungen selbst an. Inhalt = Titel der Benachrichtigung, Chat nie mit Nachrichtentext. **Ruhezeit** je Person (z. B. 21–7 Uhr): kein Push, in der App bleibt alles sichtbar. Schlüssel aus `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT`; ohne Angabe (Entwicklung) einmalig erzeugt und in `system_settings` abgelegt. iPhone: nur als installierte App (Home-Bildschirm). Gebündelter Versand nach Ende der Ruhezeit und E-Mail folgen bei Bedarf.
2. **Hintergrund-Job alle 5 Minuten:** wiederkehrende Checklisten starten (täglich oder Mo–Fr zur Uhrzeit, Zeitzone Europe/Berlin, fällig nach 4 Stunden); überfällige an die Teamleitung (wichtig); Aufgaben in 24 h fällig; „Gelesen und verstanden“ nach 3 Tagen offen (einmal je Version); Umfrage endet in 24 h. Jede Erinnerung höchstens einmal je Person und Anlass (dedupeKey); ein Lauf startet auch mit mehreren Servern nie doppelt. Abschaltbar mit `JOBS=off`.
3. **Freigabe (Vier-Augen-Prinzip)** je Vorlage: nach Abschluss „wartet auf Freigabe“ an die Teamleitung; wer abgeschlossen hat, kann nicht selbst freigeben; Zurückweisen öffnet die Liste wieder und benachrichtigt mit Hinweis.
4. **Ein- und Austritt:** Vorlagen (Personal) mit Schritten „Tag x“, zuständig die Person selbst oder ihre Teamleitung (sonst wer startet), optional Pflichtlektüre. Start (Abteilungsleitung, Personal) erzeugt je Schritt eine Aufgabe und gibt verlinkte Artikel/Dokumente der Person frei. Fortschritt sehen Person, Startende und `lifecycle.view_progress`. Plan schließt sich, wenn alle Schritte erledigt sind. Nach dem Freischalten in der Verwaltung direkt „Einarbeitung starten“.

## ADR-044 · Freie Empfänger, Teamleitungen an alle, Dokument-Kategorien, Lesestatus in Listen — ENTSCHIEDEN (11.10.2026)

1. **Übergaben** haben kein festes Team mehr: Empfänger:innen frei kombinierbar aus Gruppen der eigenen Gesellschaft(en) und einzelnen Personen; mit @ Erwähnte kommen dazu. „Ganze Gesellschaft“ bzw. „alle“ nur mit `news.publish_wide` (wie News, ADR-037). Das Team einer Übergabe (Filter) ist die erste gewählte Gruppe, sonst das eigene Team.
2. **News, Wissen, Dokumente, Umfragen:** Gruppen *und/oder* Gesellschaften in einer Auswahl, gegliedert nach „Alle & Gesellschaften“ und „Gruppen“. Leitplanke 2 aus ADR-037 präzisiert: **jede Gruppe der eigenen Gesellschaft** ist für alle erlaubt (vorher nur das eigene Team); ganze Gesellschaft/Stiftung weiterhin nur Leitungen.
3. **„Alle Mitarbeitenden der Gesellschaft“** (News, Übergaben) dürfen jetzt auch **Teamleitungen** – für die Gesellschaft ihres Teams (`news.publish_wide` über die eigene Gruppe). „Alle Gesellschaften der Stiftungsgruppe“ bleibt der Redaktion Stiftung vorbehalten. (Entscheidung Hoteldirektion 11.10.2026)
4. **Dokument-Kategorien als Baum:** Unterkategorien beliebig tief, Ordneransicht mit Pfad, Suche über alle Dokumente; anlegen, umbenennen, ausblenden mit `documents.manage_categories` (Abteilungsleitung, Personal). „Vertraulich“ vererbt sich auf Unterkategorien; beim Verschieben in eine vertrauliche Kategorie verschwindet das Dokument aus Suche und KI. Kategorien mit Dokumenten lassen sich nicht ausblenden.
5. **Startseite:** Social-Beiträge mit Foto bekommen ein kleines Kamera-Symbol.
6. **Lesestatus in allen Listen** („8/12 gelesen“, bei Umfragen „teilgenommen“) für Autor:in und Leitungen – dieselben Regeln wie auf der Detailseite; Teamleitungen sehen ihn bei allem, was an ihr Team ging.

## ADR-045 · Wissen: alle schreiben, Teamleitung gibt frei; Kategorien; stiftungsweit — ENTSCHIEDEN (11.10.2026)

- **Alle Mitarbeitenden** (`knowledge.create`) schreiben Einträge. Ohne eigenes Freigaberecht landen sie als **Entwurf** bei der **Teamleitung der Autor:in** (`knowledge.publish` über die eigene Gruppe; Abteilungsleitung und Redaktion für die Gesellschaft). Diese **gibt frei**, **korrigiert und gibt frei** oder **lehnt mit Pflicht-Begründung ab**; die Autor:in überarbeitet und reicht erneut ein. Eigene Einträge gibt immer jemand anderes frei. Entwürfe sind nicht in Suche/KI und für niemanden außer Autor:in und Prüfenden sichtbar. Ablehnungen stehen im Audit-Protokoll.
- **Stiftungsgruppenweit:** Zielgruppe „Ganze Stiftungsgruppe“ ist für Wissen frei wählbar – die Freigabe durch die Teamleitung sichert ab. Eigene Kategorie „Stiftungsgruppe“.
- **Kategorien als Baum** (Unterkategorien), gepflegt mit `knowledge.manage_categories` (Abteilungsleitung, Redaktion Wissen); gemeinsamer Baustein mit den Dokumenten.
- Inhaltliche Änderungen an veröffentlichten Artikeln (neue Version) weiterhin mit `knowledge.update`.

## ADR-046 · Team-Profil, Personen in der Suche, Abwesenheiten — ENTSCHIEDEN (11.10.2026)

- **Suche** findet Kolleg:innen (Name, Tätigkeit, Bereich) – nur mit Verzeichnisrecht, nur eigene Gesellschaften.
- **Team → Profil:** E-Mail, Durchwahl, dienstliches Handy, Position, Bereiche, Abwesenheiten; „Nachricht schreiben“. Alle Kontaktangaben pflegt jede Person **selbst und freiwillig** (Einstellungen → Mein Profil); nur dienstliche Angaben. Externe sehen keine Profile.
- **Abwesenheit** trägt jede Person selbst ein: Urlaub, Dienstreise, Fortbildung oder „abwesend“ – **bewusst ohne Krankheit oder andere Gründe** (Art. 9 DSGVO), optional mit Hinweis wie „Vertretung: …“. Angezeigt im Team (Filter „heute abwesend“), im Profil, in der Suche, **im Chat** beim Anschreiben und **beim Schreiben einer Übergabe** für alle gewählten Empfänger:innen.
- Migration `20261011000000_profil_abwesenheit`: `employee_profiles.phone_mobile`, `absences.note`.

## ADR-047 · Demo-Modus: Personen ohne Passwort wechseln — ENTSCHIEDEN (11.10.2026)

Für Vorführungen und Tests: Auf der Anmeldeseite eine Personenauswahl, in der App eine gelbe Leiste „Demo-Modus“ mit Wechsel per Auswahlliste. **Doppelt abgesichert:** nur mit Umgebungsvariable `DEMO_MODE=true` (im Codespace gesetzt) **und** nur, wenn die Datenbank den Testdaten-Marker `demo.seeded` trägt, den ausschließlich der Seed setzt. Fehlt eines davon, gibt es die Routen nicht (404). Beim Start warnt die API deutlich. Jeder Wechsel steht im Audit-Protokoll. Nur aktive Personen; die bisherige Sitzung wird beendet.

## ADR-048 · Chat: ein Start für Einzel- und Gruppenchat; Reaktionen — ENTSCHIEDEN (11.10.2026)

- Ein Knopf „Neuer Chat“: eine Person gewählt → Einzelchat, mehrere → Gruppe (Name nötig; anlegen weiterhin nur mit `chat.create_group`). Einzel- und Gruppenchats stehen gemeinsam in einer Liste neben dem Verlauf.
- Reaktionen auf Nachrichten: 👍 👎 ❤️ 🎉 – je Person und Art einmal, per Klick an/aus; wer reagiert hat, sehen nur die Teilnehmenden (wie den Chat selbst). Keine Benachrichtigung für Reaktionen. Migration `20261011010000_chat_reaktionen` (Enum-Werte, `reactions.chat_message_id`).
- Dieselben vier Reaktionen gibt es bei News und Social (`POST /content/:id/reactions`, gemeinsame Komponente `Reactions`); die Listen zeigen eine Kurzform („👍 3 ❤️ 1“). Ideen behalten „Unterstützen“ (LIKE) – daraus entsteht die Rangliste „Beste Ideen“ (Top 5, ohne abgelehnte) neben der Ideenliste.

## ADR-049 · Profilfoto — ENTSCHIEDEN (11.10.2026)

- Freiwillig in „Einstellungen › Mein Profil“: hochladen, ändern, entfernen. Das Foto wird serverseitig neu berechnet (256 × 256 px, Ausschnitt per Motiverkennung, WebP, ohne Metadaten) und in `employee_profiles.avatar_file_id` gespeichert; das alte Foto wird gelöscht markiert.
- Abruf über `GET /files/avatar/:userId` für alle Angemeldeten (5 Min. Cache); ohne Foto 404 ohne Cache – die Oberfläche zeigt dann wie bisher Initialen. So brauchen die Listen-Antworten kein zusätzliches Feld, nur die Personen-ID.
- Angezeigt überall, wo bisher Initialen standen: Kopfzeile, Team, Teamprofil, Chatliste, Social, Kommentare, News- und Übergabe-Verfasser:innen, Verwaltung.

## ADR-050 · Abstimmungen, Planen, Lesezeichen — ENTSCHIEDEN (11.10.2026)

- **Abstimmung** in News und Übergaben: eine Frage, 2–10 Antworten, optional mehrere Antworten und ein Ende. Bewusst *nicht anonym* (Namen sichtbar für alle Empfänger:innen, wie bei Reaktionen); für anonyme Fragen bleiben die Umfragen (ADR-013). Stimme ändern oder zurückziehen bis zum Ende. Tabellen `polls`, `poll_options`, `poll_votes`.
- **Planen**: News und Übergaben mit `publishAt` (Zukunft, max. 90 Tage) → Status `SCHEDULED`; bis dahin sieht nur die Autor:in den Beitrag (Listen mit „geplant für …“). Der Job (alle 5 Min.) veröffentlicht und verschickt erst dann die Benachrichtigungen (`ContentService.announce`, gleiche Logik wie beim sofortigen Veröffentlichen). Empfänger:innen werden beim Anlegen festgelegt.
- **Lesezeichen** („Gemerkt“): für alle Inhalte mit Detailseite, nur für die Person selbst sichtbar; die Liste zeigt nur, was noch sichtbar ist. Tabelle `bookmarks`.

## ADR-051 · Danke-Karten — ENTSCHIEDEN (11.10.2026)

- Alle mit `social.post` können einzelnen Personen (bis 10) und/oder einem Team danken – stiftungsweit. Motive: Gastgeberschaft, Teamgeist, Hilfsbereitschaft, Nachhaltigkeit, „Weil Wir Wirkt“; Text max. 300 Zeichen.
- Öffentlich (an alle, im Social-Bereich mit Reaktionen und Kommentaren) oder „nur an die Bedankten“. Die Bedankten (bei Teams alle Mitglieder) bekommen eine Benachrichtigung.
- Keine Ranglisten und keine Auswertung pro Person für Vorgesetzte (keine Leistungskontrolle, Betriebsrat). Jede:r sieht die eigene Sammlung „Meine Danke-Karten“ in den Einstellungen; das Dashboard zeigt die letzten Karten und nur die Gesamtzahl des Monats.
- Umsetzung als Social-Kategorie `THANKS` (`posts.kudos_motif`, `posts.kudos_group_id`, bedankte Personen in `mentions`). Migration `20261011020000_umfragen_lesezeichen_danke`.

## ADR-052 · Danke-Karten plus — ENTSCHIEDEN (11.10.2026)

- **Klappkarte**: eigene, flache Illustration je Motiv (inline SVG, keine fremden Bilder); vorne Motiv und Empfänger:innen, hinten Text und Unterschriften. Umdrehen per Klick oder Knopf (Tastatur), die verdeckte Seite ist `inert`.
- **Konfetti** beim ersten Öffnen einer Karte an dich (auch als Team-Mitglied); gemerkt nur im Browser, kein Lesestatus bei Social (ADR-031). Bei „weniger Bewegung“ kein Konfetti.
- **Mitunterschreiben**: Reaktion `SIGN`, nicht für Autor:in und Bedankte. Namen erscheinen als Unterschriften auf der Kartenrückseite.
- **Gästelob** (Motiv `GUEST`, ⭐): nur Leitungen (Teamleitung oder `news.publish_wide`), optional mit Quelle (`posts.kudos_source`), ohne Gästenamen.
- **Erinnerung nach Veranstaltungen**: Leitungen planen Anlass, Datum und Team (`thanks_reminders`); am Morgen danach (ab 8 Uhr) kommt eine Benachrichtigung mit vorausgefüllter Karte. Später legt das Eventtool solche Erinnerungen automatisch an.
- **Danke-Album**: eigene Karten als Druckansicht („Als PDF speichern“) – nur für die Person selbst.
- Migration `20261011030000_danke_karten_plus`.

## ADR-053 · Leichteres Menü, DKB-Logo auf großer Weißfläche — ENTSCHIEDEN (11.10.2026)

- Seitenleiste hell (Fläche wie der Inhalt) mit normaler Schriftstärke; aktive Seite in der Markenfarbe als zarte Fläche mit schmalem Balken. Die Markenfarbe steht nur noch in der Markenfläche oben (Logo + WIR).
- Damit entfällt „groß und fett“ für Flächen mit wenig Kontrast (ADR-039) im Menü – die Schrift steht nicht mehr auf der Markenfarbe.
- DKB STIFTUNG (`logoRequiresWhite`): Markenfläche oben, mobile Kopfzeile und Banner sind weiß, das Logo steht frei mit viel Luft statt auf einem kleinen weißen Schild. Auf der Anmeldeseite ein weißes Band über die ganze Breite. Gilt auch im Dunkelmodus (`data-logo="white"`).
## ADR-054 · Automatische Übersetzung und Leichte Sprache — ENTSCHIEDEN (11.10.2026, Anbieter offen → ADR-022)

- In den Einstellungen: eigene Sprache (de, en, pl, uk, ro, bg, hu, tr, es, id), „automatisch übersetzen“ und „Leichte Sprache“ (`user_settings.locale/auto_translate/plain_language`, schon im Modell vorhanden – keine Migration).
- Übersetzt werden News, Übergaben, Social (inkl. Danke-Karten), Wissen, Kommentare und Chat – Titel und Text. Die Oberfläche (Menü, Knöpfe) bleibt vorerst deutsch.
- Das Original wird nie verändert. Ein Hinweis oben zeigt, dass übersetzt wird, mit „Original anzeigen“ (gilt für die Sitzung). Übersetzte Texte tragen das passende `lang`-Attribut (Screenreader).
- Server lädt das Original selbst und nur, was die Person sehen darf (gleiche Sichtbarkeit wie der Inhalt). Ergebnis im Zwischenspeicher `content_translations` (Schlüssel inkl. Hash des Originals – bei Änderung wird neu übersetzt).
- Quellsprache = Sprache der Autor:in beim Schreiben; gleiche Sprache wird nicht übersetzt. Redaktionell gepflegte „Einfache Sprache“ im Wissen hat Vorrang vor der Maschine.
- Anbieter austauschbar über Umgebungsvariablen: DeepL (Übersetzung), OpenAI-kompatibles KI-Modell (Leichte Sprache, ersatzweise Übersetzung). Ohne Anbieter: nur bereits vorhandene Übersetzungen (Demo: hinterlegte Beispiele für Polnisch und Leichte Sprache).

## ADR-055 · Verwaltung: Personen, Teams & Gruppen, Häuser, Rollen — ENTSCHIEDEN (11.10.2026)

- **Personen:** Stammdaten (Anzeigename, Tätigkeit, Ablaufdatum), Teams & Leitung, Rollen mit Geltungsbereich (Haus oder Team) und optionaler Befristung. Neue Personen außerhalb von Gastromatic (Externe mit Pflicht-Ablaufdatum, Aushilfen, Praktikant:innen) direkt anlegen – mit Einmal-Code.
- **Teams & Gruppen:** anlegen, umbenennen, auflösen; Mitglieder und Leitungen pflegen. Eigene Gruppen quer über Teams (Art „Gruppe“, z. B. **Azubis**, Ersthelfer:innen) stehen sofort als Empfänger zur Wahl. Leitung = Mitgliedschaft mit `is_lead` **und** Rolle „Teamleitung“ für genau dieses Team (wird automatisch gesetzt/entfernt). Gesellschaftsübergreifende Gruppen nur mit globalem Recht.
- **Häuser:** Module an/aus, Sichtbarkeit der Lesestatus-Namen, Name, Fußzeile und Farben. Die Aktionsfarbe muss mit weißer Schrift ≥ 4,5 : 1 haben (Server prüft). Logos spielt weiterhin die IT ein (Markenprüfung).
- **Rollen & Rechte:** alle Rollen mit verständlich benannten Rechten; Standardrollen sind fest, eigene Rollen (z. B. „Azubi-Betreuung“) frei zusammenstellbar und löschbar, solange nicht vergeben.
- **Leitplanken:** alles nur im eigenen Bereich (Gesellschaft); sensible Rechte, die man selbst nicht hat, kann man nicht vergeben; eigene Rollen ändert eine zweite Person (Vier-Augen); jede Änderung steht im Protokoll.
- Demo: `lena.k` hat zusätzlich „Rechteverwaltung“, damit alles ausprobiert werden kann. **Im Echtbetrieb** liegen IT-Administration und Rechteverwaltung bei verschiedenen Personen.

## ADR-056 · Checklisten für alle — ENTSCHIEDEN (11.10.2026)

- **Alle dürfen anlegen:** Jede:r baut eigene Checklisten und weist sie Personen, Gruppen (z. B. Azubis) oder sich selbst zu. Bearbeiten dürfen die Ersteller:in und Personen mit „Vorlagen verwalten“.
- **Öffentlich oder privat:** Öffentliche Vorlagen sieht das ganze Haus (zum Starten und Kopieren), private nur Ersteller:in und Zugewiesene.
- **Gemeinsam oder jede:r einzeln:** „Gemeinsam“ = ein Durchlauf, den alle Zugewiesenen zusammen abhaken. „Jede:r einzeln“ = ein eigener Durchlauf pro Person (max. 200), nur sie darf ihn bearbeiten.
- **Feldtypen:** Häkchen, Ja/Nein/n. a., Auswahl, Text, Zahl mit Grenzen, Temperatur, Foto, Unterschrift, Zwischenüberschrift. Je Punkt: Pflicht, „Text muss eingegeben werden“, „Foto ist Pflicht“, Hinweis.
- **Clever:** Kritische Antworten (z. B. „Nein“, „Mangel“) werden markiert, verlangen eine Bemerkung und legen auf Wunsch automatisch eine Folgeaufgabe an. Punkte können nur bei einer bestimmten Antwort erscheinen („Foto vom Mangel“). Fälligkeit, Wiederholung, Vier-Augen-Abnahme, Rückfragen, Druck/PDF-Bericht.
- **Versionen:** Bearbeiten erzeugt eine neue Version; laufende und erledigte Durchläufe behalten ihre Punkte (Nachweis, z. B. HACCP).
- **Starten:** Wer zugewiesen ist (oder bearbeiten darf), startet für alle Zugewiesenen; sonst startet man nur für sich selbst.

## Nächste Schritte

1. Anbieterauswahl (ADR-022) bestätigen und Gastromatic-Prüfauftrag (ADR-021) stellen.
2. Parallel: Monorepo-Gerüst, CI/CD, erste Migration aus `schema.prisma` + SQL-Ergänzungen, Seed für Rollen/Permissions, Policy-Engine mit Testsuite.
3. Nach Phase 1: Statusbericht mit Test-, Security- und Accessibility-Ergebnissen (Spec §13).
