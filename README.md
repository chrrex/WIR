# WIR – Das Mitarbeiterportal

Das interne Portal für Kommunikation, Wissen und Zusammenarbeit von **Schloss & Gut Liebenberg** und – in Ausbaustufe 2 – der ganzen Gruppe der **DKB STIFTUNG**.

> **Stand: Phase 2** – Anmeldung, Rollen und Rechte, Auftritt je Gesellschaft, Verwaltung (Phase 1) sowie **News, Social, Übergaben, Kommentare, Erwähnungen, Benachrichtigungen und Chat** (Phase 2). Wissen & SOPs, Dokumente und Suche folgen in Phase 3.
> Alle Personen und Daten im Projekt sind **erfunden**. Bitte keine echten Mitarbeiterdaten eintragen, solange das System nicht produktiv betrieben wird.

---

## Im Browser ausprobieren (GitHub Codespaces)

Du brauchst nichts zu installieren – nur einen Browser und dein GitHub-Konto.

1. Oben auf dieser Seite auf den grünen Button **„Code“** klicken.
2. Reiter **„Codespaces“** → **„Create codespace on main“**.
3. Beim ersten Start richtet sich alles selbst ein (Datenbank, Testdaten). Das dauert etwa 3–5 Minuten.
4. Danach startet das WIR automatisch. Es öffnet sich ein neuer Tab – falls nicht: unten im Reiter **„Ports“** bei **„WIR (Web-App)“** auf das Weltkugel-Symbol klicken.
5. Zum Aufhören einfach den Tab schließen. Der Codespace schaltet sich nach 30 Minuten ohne Nutzung ab. Beim nächsten Mal unter **Code → Codespaces** wieder öffnen.

### Testzugänge (nur Entwicklung)

| Benutzername | Rolle | Was du siehst |
|---|---|---|
| `jana.m` | Mitarbeiterin Rezeption | Sicht der Mitarbeitenden |
| `maren.h` | Teamleitung Service | wie Mitarbeitende, plus Teamleitungsrechte |
| `lena.k` | Personal & IT (SGL) | **Verwaltung:** Freischalten aus Gastromatic, Einmal-Codes, Protokoll |
| `nora.s` | Kommunikation · DKB STIFTUNG | Auftritt der DKB STIFTUNG, gruppenweite Sicht ohne Hausmodule |
| `tom.b.extern` | Externer Dienstleister | befristeter Zugang, ohne KI und Mitarbeiterverzeichnis |
| `sven.r` | Küchenleitung | darf an das ganze Haus schreiben und „wichtig“ markieren |
| `tobias.k`, `selin.a`, `piotr.n` … | Kolleg:innen aus Service und Rezeption | zum Ausprobieren von Chat, Erwähnungen und Übergaben |

Passwort für alle oben: **`Wir-Demo-2026`**

**Erstzugang ausprobieren:** Auf der Anmeldeseite „Ich habe einen Einmal-Code“ wählen, Benutzername `paula.s`, Code **`482 913`** – danach vergibst du ein eigenes Passwort.

**Freischaltung ausprobieren:** Als `lena.k` anmelden → **Verwaltung** → „Neu aus Gastromatic“ → **Freischalten**. Der angezeigte Code funktioniert sofort für die freigeschaltete Person.

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
- `docs/STATUS_PHASE1.md`, `docs/STATUS_PHASE2.md` – Statusberichte (Tests, Sicherheit, Barrierefreiheit)
- `docs/MASTER_SPEC.md` – fachliche Spezifikation
