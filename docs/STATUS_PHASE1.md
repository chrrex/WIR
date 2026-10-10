# Statusbericht Phase 1

Stand: 10.10.2026 · Grundlage: `MASTER_SPEC.md` §12 (Phase 1) und §13 (Tests, Security- und Accessibility-Prüfung nach jeder Phase)

## Was Phase 1 liefert

| Spec Phase 1 | Umsetzung | Status |
|---|---|---|
| Architektur, ER-Modell, Prisma-Schema | `docs/`, `packages/db/prisma/schema.prisma` (77 Modelle), Init-Migration + SQL-Constraints | fertig |
| Authentication | Benutzername + Passwort; Erstzugang/Reset per Einmal-Code mit Pflicht-Passwortwechsel (ADR-011); Sessions; Sperre; Abmelden | fertig |
| RBAC | Rechtekatalog (81 Rechte), 11 Rollen, Scopes global/Gesellschaft/Gruppe mit Vererbung, Default Deny | fertig |
| Benutzer/Gruppen/Gesellschaften | Freischalten aus Gastromatic-Import, Einmal-Code ausgeben, deaktivieren; Gesellschaftsbaum mit Auftritt und Modulen je Gesellschaft | Kern fertig – Pflege von Gruppen, Gesellschaften und Rollenvergabe per Oberfläche folgt (bis dahin per Seed/Datenbank) |
| Dashboard-Grundstruktur | Startseite mit Bausteinen je Modul und Rolle; gruppenweite Sicht für die Stiftung | fertig (Inhalte ab Phase 2) |
| CI/CD | GitHub Actions: Datenbank, Migration, Tests, Build, Typprüfung | CI fertig – Deployment folgt nach Anbieterentscheidung (ADR-022) |
| Tests | 23 automatische Tests | grün |

## Tests

- **Rechte-Engine (Unit):** tabellengetrieben – Scopes, Vererbung im Gesellschafts- und Gruppenbaum, inaktive Personen, Listenfilter.
- **Durchlauf gegen echte Datenbank (e2e):** Default Deny, gleiche Fehlermeldung bei falschem Passwort und unbekanntem Namen, Auftritt SGL vs. DKB STIFTUNG (inkl. „Logo nur auf Weiß“ und abgeschaltete Hausmodule), Externe ohne KI/Verzeichnis, Erstzugang mit Code → Pflicht-Passwortwechsel → Code verbraucht, Freischaltung durch HR mit funktionierendem Code und Audit-Eintrag, keine Code-Ausgabe durch Teamleitung, Sperre nach 5 Fehlversuchen, Abmelden widerruft die Session.
- **Browser-Durchlauf:** Anmeldung, Start, Bereiche, Einstellungen (Dunkelmodus, Schriftgröße, Handy-Leiste), Verwaltung, Erstzugang am Handy.

## Sicherheit

- Passwörter Argon2id; Einmal-Codes 6-stellig, 24 h gültig, nur als HMAC-SHA256 (an Person gebunden) gespeichert, nach Nutzung bzw. neuer Ausgabe ungültig.
- Sessions serverseitig, Cookie `httpOnly`/`SameSite=Lax` (in Produktion `Secure`), in der DB nur der Token-Hash; Widerruf bei Abmeldung, Passwortwechsel, neuem Code und Deaktivierung.
- Sperre nach 5 Fehlversuchen für 15 Minuten; 10 Anmeldeversuche je Minute und IP; konstante Antwort bei unbekanntem Benutzernamen (Timing).
- Default Deny: globaler Guard, jede Route braucht Session; Funktionsrecht per Decorator, Scope-Prüfung im Handler; keine Code-Ausgabe für Personen mit weitergehenden Rechten (keine Eskalation).
- Audit-Protokoll für Anmeldung, Fehlversuche, Sperren, Codes, Freischaltung, Deaktivierung – ohne Codes, Passwörter oder Inhalte.
- HTTP-Sicherheitsheader (helmet), Eingaben mit Zod validiert, IDs als UUID geprüft.
- **Abhängigkeiten:** `npm audit` meldet 4 „high“ ausschließlich in Werkzeugen der Prisma-Kommandozeile (Prisma Studio: `mysql2`, `deepmerge-ts`) – nicht im Laufzeitpfad der API, MySQL wird nicht genutzt. Beobachten und mit dem nächsten Prisma-Update schließen.
- **Offen:** MFA für Admin-Rollen (ADR-011, vorbereitet im Schema), Bestätigung der privaten E-Mail und Self-Service-Reset, Passwort-Prüfung gegen bekannte Leaks, CSP-Feinschliff für die Web-App.

## Barrierefreiheit

- Automatische Prüfung mit axe-core (WCAG 2.1 A/AA) auf Anmeldung, Start, Einstellungen, Bereichsseiten und Verwaltung – Desktop und Smartphone, als SGL und als DKB STIFTUNG: **0 Verstöße**.
- Gefunden und behoben: zu schwacher Kontrast beim aktiven Menüpunkt; weiße Schrift auf dem Logo-Blau der DKB STIFTUNG (3,4 : 1). Lösung nach ADR-039: Auf Flächen unter 4,5 : 1 wird die Schrift automatisch „groß und fett“ (WCAG-Grenze 3 : 1 für große Schrift); Buttons nutzen das dunklere DKB Blue #0066CC.
- Tastaturbedienung, sichtbarer Fokus, „Zum Inhalt springen“, Schriftgröße 90–150 %, Dunkelmodus, weniger Bewegung, Touch-Ziele ≥ 44 px.
- **Offen:** manuelle Prüfung mit Screenreader (NVDA/VoiceOver) und mit Mitarbeitenden aus dem Pilot.

## Technische Entscheidungen in Phase 1

- **Prisma 7 mit Treiberadapter (`@prisma/adapter-pg`)** statt der früheren Rust-Engine: weniger Binärdateien, gleiche Typsicherheit. Die Datenbankverbindung steht in `prisma.config.ts`.
- **Init-Migration** aus dem Schema erzeugt; die SQL-Ergänzungen (Constraints, Trigger, Volltextindex) sind eine eigene Migration. Hinweis: Die Spalte `search_chunks.tsv` ist eine generierte Spalte – `prisma migrate dev` meldet dort eine Abweichung, die beabsichtigt ist.
- **Logos** liegen in Phase 1 als Dateien der Web-App (`apps/web/public/brand`), ausgewählt über den Kurznamen der Gesellschaft. Upload über die Verwaltung folgt mit den Dateien in Phase 2.
- **Web-App ruft die API über denselben Ursprung** (`/api/v1`, Next.js-Proxy) – keine CORS-Freigaben nötig.

## Nächste Schritte

1. Repository und Codespace gemeinsam testen; Rückmeldungen sammeln.
2. Phase 2: News, Kommentare, Reaktionen, Lesestatus (per Feature-Schalter aus bis zur Betriebsvereinbarung), Benachrichtigungen, @Erwähnungen, Chat, Übergaben, Dateien.
3. Parallel: Vorgaben der DKB-Gruppe zu Hosting und Code-Ablage (ADR-022), Gastromatic-Prüfauftrag (ADR-021).
