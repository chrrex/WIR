# CLAUDE CODE – MASTER SPEC
Projekt: Interne Mitarbeiter-, Kommunikations- und Wissensplattform für Schloss & Gut Liebenberg

ARBEITSREGELN
- Dieses Dokument ist die konsolidierte fachliche und technische Grundlage.
- Nicht sofort die gesamte Anwendung generieren.
- Zuerst Architektur, Datenmodell, RBAC und API prüfen; Widersprüche/offene Entscheidungen nennen.
- Bestehende Module wiederverwenden; keine parallelen Datenmodelle für gleiche Funktionen.
- Serverseitige Berechtigungsprüfung ist verbindlich.
- Datenschutz, Security und Accessibility sind Querschnittsanforderungen.
- KI darf nur über permission-aware Retrieval auf Inhalte zugreifen.
- Externe Systeme bleiben jeweils führende Datenquelle.
- Nach jeder Phase: Tests, Security-/Accessibility-Prüfung und kurzer Statusbericht.
- Priorität: Security > Datenschutz > Berechtigungen > Datenintegrität > Accessibility > Einfachheit > Performance > Erweiterbarkeit.

Mitarbeiter-, Kommunikations- und Wissensplattform für Schloss & Gut Liebenberg

## 1. Projektziel
Entwicklung einer webbasierten internen Mitarbeiterplattform für Schloss & Gut Liebenberg. Die Plattform ist zentrale Oberfläche für interne Kommunikation, Zusammenarbeit, Wissen und relevante Betriebsinformationen. Hotelkit dient als konzeptionelles Vorbild, die Lösung soll jedoch eigenständig, schlank, modern und modular sein.

## 2. Technische Leitplanken
- Responsive Web-App für Desktop, Tablet und Smartphone; PWA als Ziel.
- Empfohlener Stack: Next.js/React/TypeScript, Node.js/TypeScript, PostgreSQL, Prisma, REST/OpenAPI.
- Modularer Monolith statt unnötiger Microservice-Architektur.
- Dateien in EU/EWR-konformem verschlüsseltem Object Storage; keine Binärdateien in PostgreSQL.
- Getrennte Development-, Staging- und Production-Umgebungen.
- Automatisierte Tests und CI/CD.
- API-first und integrationsfähig.

## 3. Funktionsumfang

### Dashboard
- News und ungelesene Inhalte
- heutige Veranstaltungen und Räume
- Zimmerbelegung, Anreisen, Abreisen
- persönliche Aufgaben und Dienstplan
- Übergaben und Benachrichtigungen
- rollenabhängige Darstellung

### Kommunikation
- News mit Rich-Text-Editor, Bildern, Anhängen, Kommentaren und Likes
- Zielgruppen und Lesestatus
- Leserübersicht und Erinnerungen
- 1:1-Chat und Gruppenchat bereits im MVP
- Schicht-/Teamübergaben mit Betreff, Zeitstempel, Bildern und Lesestatus
- @Mentions

### Benachrichtigungen
- In-App, E-Mail und Push
- normal/wichtig
- individuelle Notification Preferences
- Abwesenheitshinweise

### Wissen und KI
- hierarchisches Wiki mit Kategorien, Unterkategorien und Kapiteln
- strukturierter Editor, Bilder, Anhänge, Vorlagen
- Versionierung und Änderungsvergleich
- Spracheingabe über Speech-to-Text
- globale Suche
- KI-Assistent mit Quellen und strikt berechtigungsgeprüftem Retrieval

### Dokumente
- Kategorien und Unterkategorien
- Versionierung
- Berechtigungen: erstellen, lesen, bearbeiten, löschen, deaktivieren, herunterladen
- Dokumente aus News/Wissen/Übergaben etc. auch zentral auffindbar

### Zusammenarbeit
- Aufgaben mit Verantwortlichem, Priorität, Status und Fälligkeit
- Checklisten und wiederkehrende Abläufe
- Umfragen mit mehreren Antwortoptionen
- Ideenboard mit Kategorien, Verantwortlichen, Kommentaren und Statushistorie

### Mitarbeiter
- Mitarbeiterprofile, Gesellschaften, Gruppen, Rollen und Rechte
- mehrere Gruppen pro Mitarbeiter
- Abwesenheiten
- persönliche Einstellungen
- Profilbild, Tätigkeit, persönliche Angaben
- Personalsoftware als führende Quelle für Stammdaten, soweit möglich

### Kontakte
- digitales Telefonbuch für Lieferanten, Partner, Reparatur-/Wartungsfirmen und Dienstleister
- Kontaktdaten, Notfallkontakte, Notizen, Dokumente

### Integrationen
- Personalsoftware
- Gastromatic
- Eventtool
- Flexkeeping
- Online-Bewertungstool
- Integrationsstatus, Sync-Logs und externe Mappings

### Administration
- zentrale Settings
- User-, Gruppen-, Gesellschafts-, Rollen- und Rechteverwaltung
- Kategorien
- Integrationen
- Security-Einstellungen
- Audit-Logs

## 4. Organisations- und Berechtigungsmodell
User-Account und Mitarbeiterprofil sind getrennt. Ein externer Benutzer kann einen Account ohne vollständiges Mitarbeiterprofil besitzen.
- Gesellschaft 1:n Mitarbeiter
- Mitarbeiter n:m Gruppen
- User n:m Rollen
- Rolle n:m Berechtigungen
- Berechtigungen granular, z. B. read/create/update/delete/deactivate/manage_users/reset_password/manage_groups/manage_integrations
- Serverseitige Autorisierung ist verbindlich; Frontend-Prüfungen ersetzen keine Backend-Sicherheit.
- Standardmäßig kein Zugriff.

## 5. Datenmodell / Tabellen

### Organisation und Identity
companies, users, employee_profiles, groups, user_groups, roles, permissions, role_permissions, user_roles

### Kommunikation
posts, post_targets, post_reads, comments, reactions, chat_conversations, chat_participants, chat_messages, handovers, handover_targets, handover_reads, notifications, notification_preferences

### Wissen
knowledge_categories, knowledge_articles, knowledge_versions, knowledge_permissions

### Dokumente
documents, document_versions, document_categories, document_permissions

### Aufgaben
tasks, task_assignees, checklists, checklist_items, checklist_runs

### Umfragen
surveys, survey_options, survey_responses

### Ideen
ideas, idea_categories, idea_status_history, idea_comments

### Mitarbeiter
absences, employee_settings

### Kontakte
contacts, contact_categories, contact_documents

### Integrationen
integrations, integration_sync_logs, external_entities, external_entity_mappings

### System
audit_logs

## 6. Zentrale Beziehungen
- companies 1:n employee_profiles
- employee_profiles n:m groups über user_groups
- users 1:0..1 employee_profiles
- users n:m roles über user_roles
- roles n:m permissions über role_permissions
- knowledge_articles 1:n knowledge_versions
- documents 1:n document_versions
- ideas 1:n idea_status_history
- ideas 1:n idea_comments
- posts 1:n post_reads
- chat_conversations 1:n chat_messages
- integrations 1:n integration_sync_logs

## 7. KI- und Sucharchitektur
Der KI-Assistent darf niemals unkontrolliert direkt auf die Datenbank zugreifen. Verbindlicher Ablauf: User → Authentication → Permission Context → Retrieval Layer → nur berechtigte Inhalte → KI-Modell → Antwort mit Quellen.
Globale Suche und KI müssen dieselbe Berechtigungslogik respektieren. MVP kann PostgreSQL Full-Text Search verwenden; Architektur für spätere semantische/Vector Search vorbereiten.

## 8. Sicherheit, Datenschutz und Betriebsrat
- Privacy by Design und Privacy by Default.
- Datenminimierung und definierte Aufbewahrungs-/Löschkonzepte.
- Verschlüsselung, sichere Sessions, MFA-Vorbereitung.
- Passwörter nie im Klartext; Schutz gegen kompromittierte Passwörter.
- Passwort-Reset nur für Berechtigte: temporäres Einmalpasswort per E-Mail, Passwortwechsel beim ersten Login, Reset im Audit-Log.
- Keine unnötige Leistungs- oder Verhaltenskontrolle.
- Lesebestätigungen und Audit-Logs zweckgebunden und datensparsam.
- Transparente technische Dokumentation für die Abstimmung mit dem Betriebsrat.

## 9. Accessibility und Mehrsprachigkeit
- Ziel WCAG 2.2 AA.
- Tastaturbedienung, Screenreader, 200-%-Textzoom, Kontrast, Fokuszustände, große Touch-Ziele, semantisches HTML.
- Schriftgröße und Darstellung individuell anpassbar.
- Vorlesefunktion / Text-to-Speech.
- Einfache Sprache als eigene Darstellungsoption.
- Jeder User besitzt eine bevorzugte Sprache.
- Automatische Übersetzung auf Wunsch; Original bleibt erreichbar.
- Initial Deutsch und Englisch; Architektur für weitere Sprachen, insbesondere Polnisch.

## 10. Integrationsprinzip
Externe Spezialsoftware bleibt jeweils führende Datenquelle. Die neue Plattform aggregiert Informationen und stellt sie zentral dar. Keine unnötige doppelte Stammdatenpflege.

## 11. Bewusst nicht im MVP
- Eigenes Störungsmeldungsmodul – bleibt zunächst im externen System, z. B. Flexkeeping.
- Schichttausch-Funktion.
- Komplexe Workflows, die bestehende Spezialsoftware ersetzen.

## 12. Entwicklungsreihenfolge

### Phase 1
Architektur, ER-Modell, Prisma-Schema, Authentication, RBAC, Benutzer/Gruppen/Gesellschaften, Dashboard-Grundstruktur, CI/CD, Tests

### Phase 2
News, Kommentare, Likes, Lesestatus, Notifications, @Mentions, Chat, Übergaben

### Phase 3
Wissensspeicher, Dokumente, Versionierung, Suche, KI-Assistent

### Phase 4
Aufgaben, Checklisten, Umfragen, Ideenboard, Kontakte

### Phase 5
Personalsoftware, Eventtool, Gastromatic, Flexkeeping, Bewertungstool

### Phase 6
PWA, Offline, Push, Accessibility-Härtung

## 13. Arbeitsauftrag an Claude Code
Nicht sofort die komplette Anwendung generieren. Zuerst Anforderungen analysieren, Widersprüche und offene Entscheidungen identifizieren, ER-Modell und Datenbankschema validieren, API- und Modulstruktur definieren und erst danach phasenweise implementieren. Nach jeder größeren Phase Tests, Security- und Accessibility-Prüfung durchführen und technische Entscheidungen dokumentieren.
Prioritäten: 1. Sicherheit, 2. Datenschutz, 3. Berechtigungen, 4. Datenintegrität, 5. Accessibility, 6. Einfachheit, 7. Performance, 8. Erweiterbarkeit.

## 14. Wichtige fachliche Entscheidungen
- Modularer Monolith statt Microservices.
- users und employee_profiles getrennt.
- PostgreSQL für relationale Kerndaten.
- Object Storage für Dateien.
- RBAC zentral und serverseitig.
- KI ausschließlich über permission-aware Retrieval.
- Externe Systeme bleiben führende Quellen.
- Soft Delete/Deaktivierung dort, wo Audit, Datenschutz und Datenintegrität dies erfordern.
- UUIDs als Primärschlüssel.
- created_at und updated_at auf fachlich sinnvollen Tabellen.

## 15. Ergänzung nach Feature-Review des Hotelkit-Vorbilds
Die zusätzlich geprüften Hotelkit-Funktionen wurden gegen die bestehende Spezifikation abgeglichen. Bereits vorhandene Funktionen werden nicht doppelt angelegt, sondern fachlich erweitert. Neue Funktionen werden nur ergänzt, wenn sie einen eigenständigen Mehrwert für Schloss & Gut Liebenberg bieten.

### 15.1 Umfragen – erweitert
- Umfragen bleiben ein eigener Inhaltstyp.
- Zusätzliche Anwendungsfälle: Teamzufriedenheit, Mitarbeitendenverpflegung, Trainingsfeedback, Eventfeedback, Prozessfeedback und Mitarbeitendenengagement.
- Ergebnisse müssen auswertbar sein; je nach Umfrage kann die Teilnahme anonym erfolgen.
- Umfragen können direkt aus News heraus erstellt bzw. eingebettet werden.

### 15.2 Mitarbeiter-Onboarding und Offboarding
- Ein standardisierter Onboarding-/Offboarding-Prozess wird als eigener Workflow auf Basis von Aufgaben und Checklisten ergänzt.
- Vorlagen können automatisch Aufgaben erzeugen und Verantwortliche zuweisen.
- Fortschritt des Onboardings ist für berechtigte Verantwortliche sichtbar.
- Verknüpfung mit relevanten Richtlinien, Dokumenten, Benefits und Anleitungen.
- Offboarding soll ebenfalls als Vorlage abbildbar sein.
- Keine Personalaktenfunktion: sensible HR-Dokumente bleiben nur für ausdrücklich berechtigte Nutzer sichtbar.

### 15.3 Wissensspeicher – SOP-Portal erweitert
- Der Wissensbereich soll ausdrücklich auch SOPs, Brand Standards, HACCP-Richtlinien, Mitarbeiterrichtlinien, Check-in-Prozesse, Geräte- und Reinigungsmittelanleitungen sowie Vorlagen/Formulare abbilden.
- Wissenseinträge und Dokumente können Bilder und Videos enthalten bzw. verknüpfen.
- Architektur für einen kontextbezogenen Schnellzugriff per QR-/NFC-Link vorbereiten, z. B. Anleitung direkt an einem Gerät. Dies ist zunächst eine optionale Erweiterung und kein MVP-Zwang.

### 15.4 Dashboard – personalisierbar
- Das Dashboard bleibt rollenabhängig, soll zusätzlich aber vom Benutzer innerhalb der administrativ erlaubten Grenzen personalisiert werden können.
- Widgets können priorisiert, ein-/ausgeblendet und angeordnet werden.
- Beispiele: persönliche Aufgaben, Termine, Teamupdates, Erinnerungen und relevante Prozesse.
- Die vier Gesellschaften können perspektivisch in einem übergreifenden Organisations-/Managementüberblick dargestellt werden, sofern der Benutzer dafür berechtigt ist.

### 15.5 Übersetzungen – Inhalte erweitern
- Die bereits vorgesehene automatische Übersetzung gilt ausdrücklich auch für Chatnachrichten, Kommentare und Checklisten.
- Original und Übersetzung müssen unterscheidbar bleiben.
- Übersetzung darf nicht die Originalversion überschreiben.
- Übersetzungsanbieter müssen austauschbar sein; eine konkrete Bindung an Google Translate ist nicht zwingend.

### 15.6 Aufgaben und Checklisten – fachlich erweitern
- Checklisten sollen für Schichten, HACCP/Hygiene, Events, Onboarding/Offboarding und Audit-Vorbereitung nutzbar sein.
- Aufgaben und Checklisten benötigen Fristen, Zuständigkeiten, Status und Fortschrittsanzeige.
- Wiederkehrende Checklisten müssen aus Vorlagen erzeugt werden können.
- Architektur für spätere Freigabe-/Approval-Workflows vorbereiten.

### 15.7 Beschwerden – bewusste Abgrenzung
- Ein digitales Gästebeschwerdemodul wurde im Feature-Review gefunden, ist aber bislang nicht Bestandteil des geplanten MVP.
- Falls später benötigt, sollte es als eigener Workflow mit Priorität, Status, Maßnahmen, Eskalationen, Erinnerungen, Kompensation und Auswertung konzipiert werden.
- Es darf nicht mit dem internen Störungsmeldungsmodul verwechselt werden; dieses bleibt zunächst extern.

## 16. Konsolidierte Funktionslandkarte nach Review
Folgende Bereiche gelten nach dem Review als Bestandteil der Zielarchitektur. Bereits zuvor definierte Funktionen werden hier nicht erneut spezifiziert, sondern nur als Modulzusammenhang dargestellt.
1. Dashboard: Personalisierbare Widgets, rollenabhängige Informationen, Aufgaben, Termine, Events, Belegung, An-/Abreisen, News, Erinnerungen.
2. Kommunikation: News, Social Feed, Chat, Übergaben, Kommentare, Likes, @Mentions, Lesestatus, Benachrichtigungen.
3. Wissen & SOP: Wiki, SOP-Portal, Richtlinien, Standards, Vorlagen/Formulare, Versionierung, Suche, Übersetzung, Spracheingabe, KI.
4. Dokumente: Strukturierte Ablage, Kategorien, Versionen, Rechte, Anhänge aus anderen Modulen.
5. Zusammenarbeit: Aufgaben, Checklisten, Umfragen, Ideen, Onboarding/Offboarding.
6. Mitarbeiter & Organisation: Profile, Gesellschaften, Gruppen, Rollen, Rechte, Abwesenheiten, Einstellungen.
7. Kontakte: Lieferanten, Partner, Reparatur-/Wartungsfirmen und Dienstleister.
8. Integrationen: Personalsoftware, Eventtool, Gastromatic, Flexkeeping, Bewertungstool und weitere APIs.
9. Administration: Settings, Berechtigungen, Integrationen, Kategorien, Audit-Logs, Security.

## 17. Priorisierung der neu geprüften Features
MVP / hohe Priorität: Onboarding/Offboarding über Checklisten; personalisierbares Dashboard; erweiterte Checklisten; Umfrageauswertung; Übersetzung von Chat, Kommentaren und Checklisten.
Phase 2: SOP-/Handbuch-Vorlagen und Medien; kontextbezogene QR-/NFC-Verknüpfungen; erweiterte Approval-Workflows.
Optional / später: Eigenes Gästebeschwerdemodul mit Eskalation, Kompensation und Auswertung.

## 18. Datenmodell-Erweiterungen aus dem Review
- onboarding_templates
- onboarding_instances
- onboarding_steps
- offboarding_templates
- dashboard_preferences
- survey_results / geeignete Aggregationsstruktur
- content_translations bzw. generisches Translation-Modell
- content_media für Bilder/Videos und deren Zuordnung
- optional: qr_nfc_links für kontextbezogene Schnellzugriffe
Diese Entitäten sind nur anzulegen, wenn sie nach der konkreten fachlichen Modellierung tatsächlich benötigt werden. Bestehende Tabellen wie tasks, checklists, surveys, users und employee_profiles sollen wiederverwendet und nicht dupliziert werden.

## 19. Review-Regel für Claude Code
Bei der Umsetzung ist vor jeder neuen Tabelle oder Funktion zu prüfen, ob sie bereits durch ein bestehendes Modul abgedeckt ist. Keine parallelen Datenmodelle für gleiche Sachverhalte. Onboarding nutzt beispielsweise tasks/checklists und employee_profiles; Social Feed nutzt das bestehende Posts-/Comments-/Reactions-Modell; Übersetzungen werden als Querschnittsfunktion modelliert; SOPs sind eine Ausprägung des bestehenden Wissensmodells und kein zweites Wiki.

## 20. Lesestatus, Lesebestätigungen und Erinnerungen
Lesestatus und Erinnerungsfunktionen sind eine verbindliche Querschnittsfunktion für alle relevanten Inhalte. Sie dürfen nicht nur für News vorgesehen werden.
- Unterstützte Inhaltstypen: News, Übergaben, Dokumente, Wissenseinträge, Umfragen und – soweit fachlich sinnvoll – Aufgaben/Checklisten.
- Für jeden Inhalt wird erfasst, welche berechtigten Empfänger den Inhalt gelesen bzw. geöffnet haben und welche noch nicht.
- Die Oberfläche zeigt eine kompakte Zusammenfassung, z. B. '18 von 24 gelesen', idealerweise als Kreis-/Fortschrittsgrafik.
- Beim Anklicken der Zusammenfassung können berechtigte Verantwortliche die Empfänger einzeln sehen: gelesen / ungelesen und Zeitpunkt des Lesens.
- Die Anzeige berücksichtigt ausschließlich den tatsächlich berechtigten Empfängerkreis.
- Für ungelesene Inhalte kann eine Erinnerung ausgelöst werden.
- Erinnerungen können manuell durch berechtigte Benutzer ausgelöst oder – sofern konfiguriert – automatisch nach einer definierten Zeitspanne versendet werden.
- Erinnerungskanäle: In-App, Push und optional E-Mail, abhängig von Dringlichkeit und persönlichen Benachrichtigungseinstellungen.
- Das System muss verhindern, dass Erinnerungen unnötig mehrfach versendet werden; Wiederholungen benötigen eine definierte Logik.
- Lesestatus und Erinnerungen sind datenschutzkonform, zweckgebunden und nicht als allgemeines Leistungs- oder Kontrollinstrument auszulegen.
- Für Dokumente und Wissenseinträge ist zwischen 'gesehen/geöffnet' und – falls fachlich erforderlich – 'bestätigt/gelesen' zu unterscheiden. Eine reine Vorschau darf nicht automatisch eine verbindliche Kenntnisnahme bedeuten.
- Für wichtige Richtlinien/SOPs kann optional eine explizite 'Kenntnis genommen'-Bestätigung vorgesehen werden.

## 21. Technische Modellierung der Lesestatus-Funktion
Die Lesestatus-Funktion soll als wiederverwendbare Plattformkomponente konzipiert werden und nicht für jeden Inhaltstyp separat neu implementiert werden.
- Generisches read_receipts-Modell für Inhaltstyp, Inhalt-ID, User, Status und Zeitstempel.
- Separates reminder-Modell bzw. Reminder-Event-Modell für Empfänger, Inhalt, Versandkanal, Zeitpunkt, Status und Anzahl der Erinnerungen.
- Serverseitige Berechtigungsprüfung vor Anzeige von Leserlisten.
- Indizes auf content_type/content_id/user_id und recipient/status für schnelle Auswertungen.
- Audit-Log für administrative bzw. relevante manuelle Erinnerungsaktionen.
- Architektur muss sowohl individuelle Empfänger als auch Usergruppen unterstützen.
