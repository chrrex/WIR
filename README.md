# WIR – Das Mitarbeiterportal

Das interne Portal für Kommunikation, Wissen und Zusammenarbeit von **Schloss & Gut Liebenberg** und – in Ausbaustufe 2 – der ganzen Gruppe der **DKB STIFTUNG**.

> **Stand: Phase 3+4** – Anmeldung, Rollen, Auftritt je Gesellschaft, Verwaltung (Phase 1) · News, Social, Übergaben, Chat (Phase 2) · **Wissen & SOPs, Dokumente, Suche und KI-Assistent, Aufgaben, Checklisten, Umfragen, Ideen, Kontakte, Team** (Phase 3+4). Als Nächstes: Anbindungen (Gastromatic, Flexkeeping, Eventtool).
> Alle Personen und Daten im Projekt sind **erfunden**. Bitte keine echten Mitarbeiterdaten eintragen, solange das System nicht produktiv betrieben wird.

---

## Im Browser ausprobieren (GitHub Codespaces)

Du brauchst nichts zu installieren – nur einen Browser und dein GitHub-Konto.

1. Oben auf dieser Seite auf den grünen Button **„Code“** klicken.
2. Reiter **„Codespaces“** → **„Create codespace on main“**.
3. Beim ersten Start richtet sich alles selbst ein (Datenbank, Testdaten). Das dauert etwa 3–5 Minuten.
4. Danach startet das WIR automatisch im Terminal **„wir“** (Datenbank-Updates werden dabei selbst eingespielt). Sobald dort `Ready` steht, unten im Reiter **„Ports“** bei **„WIR (Web-App)“** auf das Weltkugel-Symbol klicken.
   **Fehler 502?** Dann läuft das WIR noch nicht – kurz warten und neu laden. Hilft das nicht: im Terminal `npm run codespace` eingeben und auf `Ready` warten.
5. Zum Aufhören einfach den Tab schließen. Der Codespace schaltet sich nach 30 Minuten ohne Nutzung ab. Beim nächsten Mal unter **Code → Codespaces** wieder öffnen.

### Testzugänge (nur Entwicklung)

| Benutzername | Rolle | Was du siehst |
|---|---|---|
| `jana.m` | Mitarbeiterin Rezeption | Sicht der Mitarbeitenden |
| `maren.h` | Teamleitung Service | wie Mitarbeitende, plus Teamleitungsrechte |
| `lena.k` | Personal & IT (SGL) | **Verwaltung:** Freischalten aus Gastromatic, Einmal-Codes, Protokoll |
| `nora.s` | Kommunikation · DKB STIFTUNG | Auftritt der DKB STIFTUNG, gruppenweite Sicht ohne Hausmodule |
| `tom.b.extern` | Externer Dienstleister | befristeter Zugang, ohne KI und Mitarbeiterverzeichnis |
| `sven.r` | Küchenleitung | darf ans ganze Haus schreiben, SOPs pflegen, Checklisten-Vorlagen und Kontakte anlegen, Ideen bewerten |
| `tobias.k`, `selin.a`, `piotr.n` … | Kolleg:innen aus Service und Rezeption | zum Ausprobieren von Chat, Erwähnungen und Übergaben |

Passwort für alle oben: **`Wir-Demo-2026`**

**Noch schneller – Demo-Modus:** Im Codespace erscheint auf der Anmeldeseite eine Personenauswahl; in der App wechselst du oben in der gelben Leiste per Klick, ganz ohne Passwort. (Nur mit Testdaten – im Echtbetrieb ist der Demo-Modus aus.)

**Erstzugang ausprobieren:** Auf der Anmeldeseite „Ich habe einen Einmal-Code“ wählen, Benutzername `paula.s`, Code **`482 913`** – danach vergibst du ein eigenes Passwort.

**Freischaltung ausprobieren:** Als `lena.k` anmelden → **Verwaltung** → „Neu aus Gastromatic“ → **Freischalten**. Der angezeigte Code funktioniert sofort für die freigeschaltete Person.

**Phase 3+4 ausprobieren:**
- Als `sven.r` → **Checklisten** → „HACCP Kühlräume morgens“ starten und bei Kühlraum 1 z. B. `7` eintragen: Abweichung, Maßnahme nötig.
- Als `tobias.k` → **Wissen** → „Kühlkette“: „Gelesen und verstanden“. Als `sven.r` eine neue Version schreiben – die Bestätigung wird zurückgesetzt.
- Oben im Suchfeld z. B. `Defibrillator` – oder unten auf der Suchseite **„Frag das WIR“**. Als `jana.m` findest du die Küchen-SOP nicht, als `sven.r` schon.
- Als `jana.m` die anonyme Umfrage beantworten; als `lena.k` die Ergebnisse ansehen.

**Lesestatus ausprobieren:** Als `lena.k` die Umfrage oder ein Dokument öffnen – unten steht, wer gelesen bzw. teilgenommen hat und wer noch nicht. In der Demo ist der Lesestatus eingeschaltet; im Echtbetrieb erst nach der Betriebsvereinbarung (ADR-042).

**Neue Funktionen ausprobieren:**
- **Push:** Einstellungen → „Benachrichtigungen aufs Handy“ einschalten, Ruhezeit festlegen. (Auf dem iPhone erst „Teilen → Zum Home-Bildschirm“.)
- **Einarbeitung:** Als `lena.k` → Verwaltung → jemanden freischalten → „Einarbeitung starten“ – oder Menü **Einarbeitung** → „Plan starten“.
- **Freigabe:** Als `tobias.k` die Checkliste „Bankett Aufbau Schlosssaal“ abschließen, als `maren.h` freigeben oder zurückweisen.
- **Automatisch:** „HACCP Kühlräume morgens“ startet täglich um 6:00 von selbst; nach 4 Stunden ohne Abschluss erfährt es die Küchenleitung.

**Wissen mit Freigabe:** Als `jana.m` einen Eintrag schreiben (auch für die ganze Stiftungsgruppe) – als `jonas.w` (Teamleitung Rezeption) unter **Wissen → Zur Prüfung** freigeben, korrigieren oder ablehnen.

**Team & Abwesenheit:** Unter **Team** Kolleg:innen anklicken (Kontaktdaten, Abwesenheiten). Eigene Daten und Abwesenheit unter **Einstellungen → Mein Profil**. Maren ist in den Testdaten im Urlaub – das siehst du im Chat mit ihr und beim Schreiben einer Übergabe an den Service.

**Alles zurücksetzen:** im Terminal des Codespace `npm run reset-demo`.

---

## Aufbau

```
apps/
  api/     NestJS-API (/api/v1): Anmeldung, Sessions, Rechteprüfung, Verwaltung, Audit
  web/     Next.js-Web-App (PWA): Oberfläche für Handy und Desktop
packages/
  db/      Prisma-7-Schema, Migrationen, Seed (Testdaten), Rechtekatalog
docs/      Architektur, Entscheidungen (ADR), Rechte, Datenmodell, Spezifikation
index.html Klick-Demo (eine Datei, für GitHub Pages) – unabhängig von der echten App
```

- **Sicherheit:** Passwörter mit Argon2id, Einmal-Codes nur als HMAC gespeichert, Sessions serverseitig (Cookie nur mit Zufalls-Token), Sperre nach 5 Fehlversuchen, Begrenzung der Anmeldeversuche, Default Deny auf allen Routen, Audit-Protokoll.
- **Rechte:** Rollen mit Geltungsbereich (global / Gesellschaft / Gruppe), Vererbung im Gesellschaftsbaum Stiftung → Wirkungsort → Gesellschaft (`docs/RBAC.md`).
- **Auftritt je Gesellschaft:** Farben und Logo kommen aus der Datenbank. Das Logo der DKB STIFTUNG steht immer auf Weiß (ADR-039).

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | API (Port 3001) und Web-App (Port 3000) im Entwicklungsmodus starten |
| `npm run setup` | Datenbank migrieren und Testdaten anlegen |
| `npm run reset-demo` | Testdaten neu anlegen (löscht alles) |
| `npm test` | Tests: Rechte-Engine und Durchlauf Anmeldung/Verwaltung gegen die Datenbank |
| `npm run build` | Produktions-Build aller Teile |

## Lokal mit Docker (ohne Codespaces)

Voraussetzungen: Node.js 22 und Docker (oder Podman).

```bash
docker compose up -d                       # PostgreSQL 16
cp .env.example packages/db/.env
cp .env.example apps/api/.env
npm ci
npm run setup
npm run dev                                # → http://localhost:3000
```

## Dokumentation

- `docs/ARCHITECTURE.md` – technische Architektur
- `docs/ARCHITECTURE_DECISIONS.md` – Entscheidungen und offene Punkte (ADR)
- `docs/RBAC.md` – Rollen und Rechte
- `docs/ER_MODEL.md` – Datenmodell
- `docs/STATUS_PHASE1.md`, `docs/STATUS_PHASE2.md`, `docs/STATUS_PHASE3_4.md` – Statusberichte (Tests, Sicherheit, Barrierefreiheit)
- `docs/MASTER_SPEC.md` – fachliche Spezifikation
