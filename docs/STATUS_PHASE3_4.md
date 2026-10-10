# Statusbericht Phase 3+4 – Wissen & Zusammenarbeit

Stand: 10.10.2026 · Grundlage: `MASTER_SPEC.md` §12 (Phase 3 und 4) und §13 · Entscheidungen: ADR-041

Phase 3 und 4 wurden zusammengelegt. Ziel war möglichst wenig neuer Code: **keine Datenbank-Migration**, alle Bereiche bauen auf dem Content-Gerüst aus Phase 2 auf (Sichtbarkeit, Kommentare, Likes, Benachrichtigungen). Neu sind 8 API-Controller (~900 Zeilen) und 18 Seiten.

## Was geliefert ist

| Spec | Umsetzung | Status |
|---|---|---|
| Wissensspeicher | Kategorien, Arten (SOP, HACCP, Richtlinie …), Einfache Sprache, „Gelesen und verstanden“ je Version, Rückfragen | fertig |
| Versionierung | Wissen und Dokumente: jede Änderung = neue Version, alte lesbar | fertig |
| Dokumente | PDF/Word/Excel/PowerPoint, Typprüfung, vertrauliche Kategorien | fertig |
| Suche | Volltext deutsch, Hervorhebung, nur berechtigte Treffer, Suchfeld oben in jeder Seite | fertig |
| KI-Assistent | Antwort nur aus berechtigten Quellen, mit Quellenangabe; ohne Anbieter nur Fundstellen | fertig – **Anbieter offen** |
| Aufgaben | für mich / Personen / Teams, Fälligkeit, Priorität, Status, Rückfragen | fertig |
| Checklisten | Vorlagen, Läufe, Grenzwerte (HACCP), Pflicht-Maßnahme bei Abweichung, Meldung an Teamleitung | fertig – Wiederholung/Freigabe später |
| Umfragen | Skala, Auswahl, Freitext; anonym; Ergebnisse ab 5 Antworten | fertig |
| Ideenboard | Einreichen, Unterstützen, Kommentare, Status mit Verlauf | fertig |
| Kontakte | Lieferanten, Dienstleister, Notdienste mit Anruf-Button | fertig |
| zusätzlich | Team-Verzeichnis; Startseite zeigt Aufgaben, offene Checklisten, offene Umfrage | fertig |

## Tests

44 automatische Tests (9 neu), alle grün, unter anderem:
- Neue Wissens-Version setzt „bestätigt“ zurück; alte Version bleibt lesbar; fremde Teams sehen den Artikel nicht
- Suche/KI: Rezeption findet die Küchen-SOP **nicht**, die Haus-News schon; vertrauliche Dokumente nie; Externe ohne KI
- Dokument-Upload weist getarnte Dateien ab; Download nur für Berechtigte
- Aufgaben: Mitarbeitende vergeben nichts an andere, Teamleitung nur ans eigene Team; „Erledigt“ benachrichtigt
- Checkliste: 7,5 °C im Kühlraum = Abweichung, Abschluss erst mit Maßnahme, Meldung an die Teamleitung; Stiftung ohne Modul → 403
- Umfrage: anonym ohne Personenbezug in der Datenbank, keine Doppelabgabe, Ergebnisse erst ab 5
- Ideen-Status nur durch Leitung, Verlauf vollständig; Kontakte pflegen nur Berechtigte

## Barrierefreiheit

axe (WCAG 2 A/AA) auf allen neuen Seiten, Desktop und Handy, als Küchenleitung, Rezeption und Stiftung: **0 Verstöße**. Formulare mit Beschriftungen, Status als Text (nicht nur Farbe), Skalen als Tastengruppen.

## Bewusst offen

- KI-Anbieter festlegen (Vergleich mit 30 echten SOP-Fragen); Texterkennung in PDFs für die Suche
- Wiederkehrende Checklisten und automatische Erinnerungen (Job-System), Freigabe durch Leitung, Offline-Abhaken (Phase 6)
- On-/Offboarding-Abläufe (Datenmodell steht, ADR-009)
- Virenscan und EU-Object-Storage für Dateien vor dem Produktivbetrieb
