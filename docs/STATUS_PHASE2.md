# Statusbericht Phase 2 – Kommunikation

Stand: 10.10.2026 · Grundlage: `MASTER_SPEC.md` §12 (Phase 2) und §13 · Entscheidungen: ADR-040

## Was Phase 2 liefert

| Spec Phase 2 | Umsetzung | Status |
|---|---|---|
| News | Zielgruppen (Teams, Gesellschaft, Stiftung), „Wichtig“ mit Benachrichtigung, Anheften, Fotos, Filter „ungelesen/wichtig“, Leitplanken nach ADR-037 | fertig |
| Kommentare, Likes | für News, Social und Übergaben; Löschen eigener Kommentare, Moderation | fertig |
| @Erwähnungen | Vorschläge beim Tippen; nur Personen, die den Inhalt sehen dürfen | fertig |
| Lesestatus | „18 von 24“, Liste gelesen/noch nicht, manuelle Erinnerung – **per Schalter aus bis zur Betriebsvereinbarung** | fertig (aus) |
| Notifications | In-App: Glocke mit Zähler, Zähler im Menü | fertig – Push/E-Mail in Phase 6 |
| Chat | 1:1 mit ✓✓, Gruppen, Fotos, Erwähnungen, Löschung nach 12 Monaten | fertig – Echtzeit per Abfrage, WebSocket später |
| Übergaben | je Team und Schicht, Fotos, Erwähnte aus anderen Teams, Rückfragen | fertig |
| zusätzlich | Social (Grüße, Biete & Suche, …) mit Melden und Moderation; Startseite mit echten Inhalten | fertig |

## Tests

35 automatische Tests (12 neu für Phase 2), alle grün, unter anderem:
- Sichtbarkeit nach Zielgruppe (Service/Rezeption ja, Küche nein, Externe nein), 404 statt Hinweis auf Existenz
- Leitplanken: Mitarbeitende nicht an alle, nicht „wichtig“, nicht an fremde Teams; Abteilungsleitung schon – mit Benachrichtigung
- Erwähnung benachrichtigt nur Berechtigte
- Lesestatus aus ohne Schalter; mit Schalter nur für Autor:in sichtbar, Erinnerung nur an Ungelesene
- Bild-Upload: Ergebnis ist WebP **ohne EXIF/GPS**, Abruf nur bei sichtbarem Inhalt
- Melden → Moderation ohne Namen der meldenden Person → Ausblenden
- Übergaben: Team und Erwähnte sehen sie, andere nicht
- Chat: ✓✓ erst nach Lesen, **keine Einsicht für Admins**, Gruppen nur mit Recht
- Neue Kollegin erhält laufende Haus-News nach Freischaltung, aber nicht fremde Team-News

Browser-Durchlauf am Desktop und Smartphone: News lesen, kommentieren mit Erwähnung, News mit Foto veröffentlichen, Social, Übergaben, Chat, Glocke, Moderation.

## Barrierefreiheit

axe-core (WCAG 2.1 A/AA) auf 58 Ansichten (Desktop und Smartphone, als Mitarbeiterin, Stiftung und Verwaltung): **0 Verstöße**. Gefunden und behoben: unzulässiges ARIA-Attribut am Erwähnungsfeld. Fotos bekommen eine Bildbeschreibung (Eingabefeld beim Hochladen).

## Sicherheit und Datenschutz

- Sichtbarkeit serverseitig über Empfängerlisten; alle Detailabrufe geben 404, wenn nicht sichtbar.
- Datenbank-Constraints greifen (z. B. Erwähnung hat genau ein Ziel – im Test aufgefallen und korrigiert).
- Fotos ohne Metadaten; nur Bildformate; max. 12 MB; Abruf geprüft; `nosniff`.
- Chat: keine Admin-Leserechte, keine Inhalte in Benachrichtigungen, automatische Löschung nach 12 Monaten.
- Gelesen-Markierung nur als Datum; Lesestatus nur mit Schalter und Berechtigung; Erinnerungen protokolliert.
- **Offen:** Virenscan und EU-Object-Storage für Dateien vor Produktivbetrieb; WebSocket statt Abfrage; Push/E-Mail mit Zeitfenstern (Phase 6); automatische Erinnerungen (Job-System); Übersetzung von News (Phase 3).

## Neue Testzugänge

Zusätzlich zu Phase 1 (Passwort jeweils `Wir-Demo-2026`): `sven.r` (Küchenleitung, darf ans ganze Haus und „wichtig“), `tobias.k`, `ana.f` (Service), `selin.a`, `jonas.w`, `piotr.n` (Rezeption), `marta.w` (Housekeeping). `lena.k` ist zusätzlich im Moderationsteam.
