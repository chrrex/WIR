# RBAC- und Berechtigungsmodell

Stand: 05.10.2026 · Entwurf v0.1 · Tabellen: `roles`, `permissions`, `role_permissions`, `user_roles`, `user_groups`, `content_audiences`, `resource_acl`

## 1. Grundsätze

1. **Default Deny.** Ohne ausdrückliche Berechtigung kein Zugriff – auch nicht lesend.
2. **Serverseitig.** Jede Route deklariert ihren Permission-Key; Frontend blendet nur aus, entscheidet nie.
3. **Zwei Fragen, zwei Mechanismen:**
   - *Funktionsrecht (RBAC):* Darf die Person diese Art Aktion ausführen? → `permissions` über Rollen.
   - *Objektsichtbarkeit:* Darf die Person dieses konkrete Objekt sehen/bearbeiten? → Zielgruppe (`content_audiences`) oder ACL (`resource_acl`).
   Eine Aktion ist nur erlaubt, wenn **beide** zustimmen (Ausnahme: eigene Inhalte, s. 5.).
4. **Ein Ort für die Logik.** Policy-Engine (`packages/policy`) – genutzt von API, Suche, KI, Benachrichtigungen, Exporten.
5. **Least Privilege, zeitlich begrenzbar.** `user_roles.valid_until`; Rollenänderungen werden auditiert.

## 2. Scopes

Eine Rollenzuweisung gilt in genau einem Scope:

| Scope | `user_roles` | Bedeutung |
|---|---|---|
| Global | `company_id = NULL, group_id = NULL` | alle Gesellschaften |
| Gesellschaft | `company_id` gesetzt | nur Objekte/Nutzer dieser Gesellschaft (`content_items.company_id`; bei Personen alle aktiven `employee_company_assignments`) |
| Gruppe | `group_id` gesetzt | nur diese Gruppe inkl. Untergruppen (z. B. Teamleitung Housekeeping) |

Ein Recht im Gesellschafts-Scope erlaubt z. B. `users.manage` nur für Profile dieser Gesellschaft. Externe User ohne Profil gehören zur Gesellschaft der/des einladenden Verantwortlichen (Feld offen, ADR-006).

**Vererbung (ADR-034):** Gesellschaften bilden einen Baum (Stiftung → Wirkungsort → Gesellschaft). Ein Gesellschafts-Scope gilt für den Knoten und alle Untergesellschaften. Stiftungsweite Rollen (z. B. `foundation_editor` für gruppenweite News) liegen im Scope des Stiftungsknotens. Die Administration bleibt je Wirkungsort getrennt; niemand verwaltet Nutzer einer anderen Gesellschaft ohne ausdrücklichen Scope.

## 3. Permission-Katalog (Seed)

Schema: `<modul>.<aktion>`. *Sensibel* = `is_sensitive`, nur an wenige Rollen, Vergabe erfordert `roles.manage` im globalen Scope.

| Modul | Permissions |
|---|---|
| dashboard | `dashboard.view`, `dashboard.view_cross_company` |
| news | `news.read`, `news.create`, `news.publish`, `news.mark_important`, `news.require_read` (Lesestatus/Erinnerung/Pflichtlektüre), `news.update_any`, `news.delete_any`, `news.pin` |
| social | `social.read`, `social.post`, `social.moderate` (Meldungen bearbeiten, Beiträge ausblenden) |
| handovers | `handovers.read`, `handovers.create`, `handovers.update_any` |
| comments | `comments.create`, `comments.moderate` |
| reactions | `reactions.create` |
| chat | `chat.use`, `chat.create_group`, `chat.moderate` |
| read_status | `read_status.view_summary`, `read_status.view_details`, `reminders.send_manual` |
| notifications | `notifications.send_important` |
| knowledge | `knowledge.read`, `knowledge.create`, `knowledge.update`, `knowledge.publish`, `knowledge.delete`, `knowledge.manage_categories`, `knowledge.require_acknowledgement` |
| documents | `documents.read`, `documents.create`, `documents.update`, `documents.delete`, `documents.deactivate`, `documents.download`, `documents.manage_categories` |
| search / ai | `search.use`, `ai.use` |
| tasks | `tasks.read`, `tasks.create`, `tasks.assign`, `tasks.update_any` |
| checklists | `checklists.execute`, `checklists.manage_templates`, `checklists.approve`, `checklists.view_reports` |
| lifecycle | `lifecycle.start`, `lifecycle.view_progress`, `lifecycle.manage_templates` |
| surveys | `surveys.respond`, `surveys.create`, `surveys.view_results` |
| ideas | `ideas.read`, `ideas.create`, `ideas.manage` (Status, Verantwortliche) |
| contacts | `contacts.read`, `contacts.manage`, `contacts.view_emergency` |
| employees | `employees.directory`, `absences.view_team`, `absences.manage` |
| users *(sensibel)* | `users.read`, `users.manage`, `users.deactivate`, `users.delete` (endgültig löschen/anonymisieren), `users.reset_password` |
| groups / companies | `groups.manage`, `companies.manage`, `branding.manage` (Farben/Logos je Gesellschaft; Markenregeln wie „Logo nur auf Weiß“ setzt nur die Stiftungsadministration), `companies.manage_modules` (Module je Gesellschaft an/aus) |
| roles *(sensibel)* | `roles.manage` |
| integrations *(sensibel)* | `integrations.view_status`, `integrations.manage` |
| admin *(sensibel)* | `settings.manage`, `audit.read`, `security.manage`, `dashboard.manage_widgets` |

Die Spec-Begriffe *read/create/update/delete/deactivate/download* bilden sich 1:1 auf Funktionsrechte **und** auf `ResourceAction` der ACL ab.

## 4. Rollen (Vorschlag, im Seed anlegbar und änderbar)

| Rolle | Typischer Scope | Kernrechte |
|---|---|---|
| `employee` | Global | dashboard.view, news.read, news.create/publish (ADR-037), social.read, social.post, handovers.read/create, comments.create, reactions.create, chat.use, knowledge.read, documents.read/download, search.use, ai.use, tasks.read, checklists.execute, surveys.respond, ideas.read/create, contacts.read, employees.directory |
| `external` | Gesellschaft/Gruppe | news.read, knowledge.read (nur freigegebene Kategorien), chat.use, checklists.execute – **kein** employees.directory, kein ai.use (ADR-006) |
| `team_lead` | Gruppe | + news.mark_important, news.require_read (Zielgruppe ⊆ eigene Gruppe), handovers.update_any, read_status.view_summary/details, reminders.send_manual, tasks.create/assign, checklists.approve, absences.view_team, lifecycle.view_progress, surveys.create/view_results |
| `department_head` | Gesellschaft | wie team_lead für die Gesellschaft + knowledge.publish, documents.*, checklists.manage_templates, lifecycle.start, ideas.manage |
| `editor_knowledge` | Global | knowledge.*, documents.create/update, knowledge.require_acknowledgement |
| `hr` | Gesellschaft | users.read, lifecycle.*, absences.manage, Zugriff auf sensible HR-Kategorien nur per ACL |
| `management` | Global | dashboard.view_cross_company, read_status.view_summary, surveys.view_results, audit.read (lesend) |
| `it_admin` | Global | users.manage/deactivate/reset_password, groups.manage, companies.manage, integrations.*, settings.manage, security.manage, dashboard.manage_widgets |
| `moderator` | Global bzw. Wirkungsort | social.moderate, comments.moderate, news.update_any/delete_any (nur ausblenden bei Meldung) – kleines benanntes Moderationsteam (ADR-037) |
| `role_admin` | Global | roles.manage (bewusst getrennt von it_admin – Vier-Augen bei Rechtevergabe, ADR-007) |

**Bewusst nicht vorgesehen:** eine Rolle, die *Inhalte* aller sensiblen Bereiche lesen darf. Auch `it_admin` sieht HR-Dokumente nur per ausdrücklicher ACL.

## 5. Objektsichtbarkeit – Regeln je Inhaltstyp

| Typ | Sichtbar für | Bearbeitbar durch |
|---|---|---|
| News, Übergaben, Umfragen | Empfänger aus `content_audiences` (Push-Inhalte) | Autor:in; `*.update_any` im Scope |
| Wissensartikel | `resource_acl` READ auf Artikel **oder** geerbt von Kategorie | ACL UPDATE / `knowledge.update` im Scope |
| Dokumente | wie Wissen; `DOWNLOAD` separat; Kategorien mit `is_sensitive` vererben nie an ALL_USERS | ACL / `documents.*` |
| Aufgaben | Ersteller:in, Zugewiesene (User oder Gruppe), Teamleitung im Scope | Zugewiesene (Status), Ersteller:in |
| Checklisten-Läufe | zugewiesene Gruppe; `checklists.view_reports` im Scope | ausführende Gruppe |
| Ideen | `ideas.read` (alle Mitarbeitenden), sofern nicht anders gescopt | Autor:in (bis IN_REVIEW), `ideas.manage` |
| Chat | ausschließlich aktuelle Teilnehmende; **keine** Admin-Leserechte auf Inhalte (ADR-015) | Absender:in (eigene Nachricht) |
| Kontakte | `contacts.read` + Kategorie-ACL; Notfallnummern `contacts.view_emergency` | `contacts.manage` |
| Entwürfe | nur Autor:in und Personen mit UPDATE | – |

Pflicht-Lektüre bei Wissen/Dokumenten: Ein optionaler Verteiler (`content_audiences`) legt fest, **wer erinnert und gezählt wird**. Er gewährt keinen Zugriff – Empfänger ohne ACL-Leserecht werden beim Veröffentlichen abgewiesen (Validierungsfehler, nicht still entfernt).

## 6. Auswertungsalgorithmus

```
PermissionContext(user) =
  { userId, userType, status,
    companyIds (alle aktiven Zuordnungen), groupIds (inkl. Elterngruppen), roleIds,
    grants: Map<permissionKey, Scope[]> }    // einmal pro Request, gecacht ≤ 60 s

can(ctx, permissionKey, resource?):
  if ctx.status != ACTIVE                         → deny
  scopes = ctx.grants[permissionKey]; if none     → deny
  if resource == null                             → allow (reine Funktionsprüfung)
  if not scopeCovers(scopes, resource)            → deny     // Gesellschaft/Gruppe passt?
  if not objectVisible(ctx, resource, action)     → deny     // Audience bzw. ACL
  → allow

objectVisible(ctx, item, action):
  item.status = DRAFT  → nur Autor:in oder ACL UPDATE
  item.type ∈ {POST, HANDOVER, SURVEY} and action = READ
       → ∃ content_recipients(item, ctx.userId, removed_at IS NULL)
  sonst → ∃ ACL-Eintrag (Objekt oder Kategorie-Kette mit inherit=true)
          mit action ∈ actions und Principal ∈ {ALL_USERS, ctx.companyIds,
          ctx.groupIds, ctx.roleIds, ctx.userId}

visibleContentFilter(ctx) → dieselbe Logik als SQL-WHERE (EXISTS-Subqueries),
  eingesetzt in Listen, Suche, KI-Retrieval, Exporten, Benachrichtigungs-Fan-out.
```

Testpflicht: Die Policy-Engine bekommt eine tabellengetriebene Testsuite (Rolle × Scope × Objekt × Aktion), und für jeden Inhaltstyp einen Test "`can()` und `visibleContentFilter()` liefern dieselbe Menge".

## 7. Besondere Schutzregeln

- **Leserlisten** (wer hat wann gelesen) standardmäßig nur mit `read_status.view_details` **und** MANAGE bzw. Autorenschaft am Objekt; je Gesellschaft auf „alle Empfänger:innen“ umstellbar (`read_list_visibility = ALL_RECIPIENTS`), nur nach Regelung in der Betriebsvereinbarung (ADR-012); die Zusammenfassung "18 von 24" mit `read_status.view_summary`. Keine personenübergreifende Auswertung ("Wer liest am wenigsten?") – es gibt keinen Endpunkt dafür (ADR-012).
- **Anonyme Umfragen:** Ergebnisse erst ab `min_group_size` Antworten, auch nicht für Admins; Freitext-Antworten nur gesammelt, ohne Reihenfolge nach Zeit.
- **Passwort-Reset:** `users.reset_password` nur im eigenen Scope, nie für Accounts mit höherer Rechtestufe (keine Eskalation über Reset); immer Audit-Eintrag.
- **Rollenvergabe:** Niemand kann Rechte vergeben, die er selbst nicht hat; `roles.manage` darf sich nicht selbst zuweisen.
- **Deaktivierte User:** Sessions sofort widerrufen, aus allen künftigen Verteilern raus, Inhalte bleiben mit Autorname erhalten.
- **Service-Accounts** (Integrationen): nur `integrations.*`-nahe Rechte, kein interaktiver Login.
