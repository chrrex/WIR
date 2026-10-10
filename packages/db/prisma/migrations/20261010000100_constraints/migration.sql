-- =============================================================================
-- Ergänzende Constraints, die Prisma nicht ausdrücken kann.
-- ENTWURF: wird nach `prisma migrate dev --create-only` an die erste Migration
-- angehängt. Erfordert PostgreSQL >= 15 (NULLS NOT DISTINCT).
-- =============================================================================

-- --- RBAC -------------------------------------------------------------------
ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_scope_chk
    CHECK (NOT (company_id IS NOT NULL AND group_id IS NOT NULL));
CREATE UNIQUE INDEX user_roles_unique_scope
  ON user_roles (user_id, role_id, company_id, group_id) NULLS NOT DISTINCT;

-- --- Content-Registry: Subtyp muss zum type passen ---------------------------
-- Je Subtyp-Tabelle ein Trigger (Beispiel posts; analog für handovers,
-- knowledge_articles, documents, surveys, tasks, checklist_runs, ideas).
CREATE OR REPLACE FUNCTION assert_content_type() RETURNS trigger AS $$
BEGIN
  IF (SELECT type::text FROM content_items WHERE id = NEW.id) <> TG_ARGV[0] THEN
    RAISE EXCEPTION 'content_items.type mismatch for % (expected %)', NEW.id, TG_ARGV[0];
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER posts_type_chk BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('POST');
CREATE TRIGGER handovers_type_chk BEFORE INSERT ON handovers
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('HANDOVER');
CREATE TRIGGER knowledge_articles_type_chk BEFORE INSERT ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('KNOWLEDGE_ARTICLE');
CREATE TRIGGER documents_type_chk BEFORE INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('DOCUMENT');
CREATE TRIGGER surveys_type_chk BEFORE INSERT ON surveys
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('SURVEY');
CREATE TRIGGER tasks_type_chk BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('TASK');
CREATE TRIGGER checklist_runs_type_chk BEFORE INSERT ON checklist_runs
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('CHECKLIST_RUN');
CREATE TRIGGER ideas_type_chk BEFORE INSERT ON ideas
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('IDEA');

-- --- Zielgruppen & ACL -------------------------------------------------------
ALTER TABLE content_audiences ADD CONSTRAINT content_audiences_target_chk CHECK (
  (target_type = 'ALL_USERS' AND num_nonnulls(company_id, group_id, role_id, user_id) = 0) OR
  (target_type = 'COMPANY'   AND company_id IS NOT NULL AND num_nonnulls(group_id, role_id, user_id) = 0) OR
  (target_type = 'GROUP'     AND group_id   IS NOT NULL AND num_nonnulls(company_id, role_id, user_id) = 0) OR
  (target_type = 'ROLE'      AND role_id    IS NOT NULL AND num_nonnulls(company_id, group_id, user_id) = 0) OR
  (target_type = 'USER'      AND user_id    IS NOT NULL AND num_nonnulls(company_id, group_id, role_id) = 0)
);

ALTER TABLE resource_acl ADD CONSTRAINT resource_acl_target_chk CHECK (
  num_nonnulls(content_item_id, knowledge_category_id, document_category_id, contact_category_id) = 1
);
ALTER TABLE resource_acl ADD CONSTRAINT resource_acl_principal_chk CHECK (
  (principal_type = 'ALL_USERS' AND num_nonnulls(company_id, group_id, role_id, user_id) = 0) OR
  (principal_type = 'COMPANY'   AND company_id IS NOT NULL AND num_nonnulls(group_id, role_id, user_id) = 0) OR
  (principal_type = 'GROUP'     AND group_id   IS NOT NULL AND num_nonnulls(company_id, role_id, user_id) = 0) OR
  (principal_type = 'ROLE'      AND role_id    IS NOT NULL AND num_nonnulls(company_id, group_id, user_id) = 0) OR
  (principal_type = 'USER'      AND user_id    IS NOT NULL AND num_nonnulls(company_id, group_id, role_id) = 0)
);
ALTER TABLE resource_acl ADD CONSTRAINT resource_acl_actions_nonempty CHECK (cardinality(actions) > 0);

-- --- Exklusive Zuordnungen ----------------------------------------------------
ALTER TABLE reactions   ADD CONSTRAINT reactions_target_chk   CHECK (num_nonnulls(content_item_id, comment_id) = 1);
ALTER TABLE mentions    ADD CONSTRAINT mentions_target_chk    CHECK (num_nonnulls(content_item_id, comment_id, chat_message_id) = 1);
ALTER TABLE attachments ADD CONSTRAINT attachments_target_chk CHECK (num_nonnulls(content_item_id, comment_id, chat_message_id) = 1);
ALTER TABLE task_assignees ADD CONSTRAINT task_assignees_target_chk CHECK (num_nonnulls(user_id, group_id) = 1);

CREATE UNIQUE INDEX reactions_unique_content ON reactions (user_id, content_item_id, type) WHERE content_item_id IS NOT NULL;
CREATE UNIQUE INDEX reactions_unique_comment ON reactions (user_id, comment_id, type)      WHERE comment_id IS NOT NULL;
CREATE UNIQUE INDEX task_assignees_unique_user  ON task_assignees (task_id, user_id)  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX task_assignees_unique_group ON task_assignees (task_id, group_id) WHERE group_id IS NOT NULL;
CREATE UNIQUE INDEX task_one_responsible ON task_assignees (task_id) WHERE is_responsible;

-- --- Fachliche Plausibilität -------------------------------------------------
ALTER TABLE absences ADD CONSTRAINT absences_range_chk CHECK (ends_on >= starts_on);
ALTER TABLE user_settings ADD CONSTRAINT user_settings_font_chk CHECK (font_scale_percent BETWEEN 100 AND 200);
ALTER TABLE surveys ADD CONSTRAINT surveys_min_group_chk CHECK (min_group_size >= 3);
ALTER TABLE content_items ADD CONSTRAINT content_items_reminders_chk CHECK (max_reminders BETWEEN 0 AND 5);
-- Anonymität technisch erzwingen: bei anonymen Umfragen niemals respondent_id
CREATE OR REPLACE FUNCTION assert_survey_anonymity() RETURNS trigger AS $$
BEGIN
  IF NEW.respondent_id IS NOT NULL AND (SELECT is_anonymous FROM surveys WHERE id = NEW.survey_id) THEN
    RAISE EXCEPTION 'respondent_id must be NULL for anonymous survey %', NEW.survey_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER survey_responses_anonymity BEFORE INSERT OR UPDATE ON survey_responses
  FOR EACH ROW EXECUTE FUNCTION assert_survey_anonymity();

-- --- Suche -------------------------------------------------------------------
ALTER TABLE search_chunks DROP COLUMN IF EXISTS tsv;
ALTER TABLE search_chunks ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
  to_tsvector(CASE locale WHEN 'de' THEN 'german'::regconfig WHEN 'en' THEN 'english'::regconfig ELSE 'simple'::regconfig END,
              coalesce(title,'') || ' ' || coalesce(text,''))
) STORED;
CREATE INDEX search_chunks_tsv_gin ON search_chunks USING GIN (tsv);
CREATE INDEX contacts_name_trgm ON contacts USING GIN (organization_name gin_trgm_ops);
-- Später (Phase 3+): CREATE EXTENSION vector; ALTER TABLE search_chunks ADD COLUMN embedding vector(1024);
--                    CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);

-- --- Audit-Log append-only ---------------------------------------------------
-- app_runtime = DB-Rolle der Anwendung; app_retention = Rolle des Lösch-Jobs
-- Wird nur ausgeführt, wenn die Rollen existieren (Produktion); lokal/Codespaces übersprungen.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_runtime';
    EXECUTE 'GRANT INSERT, SELECT ON audit_logs TO app_runtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_retention') THEN
    EXECUTE 'GRANT DELETE ON audit_logs TO app_retention';
  END IF;
END $$;

-- --- Mehrere Gesellschaften je Mitarbeitende/r (ADR-020) ---------------------
ALTER TABLE employee_company_assignments
  ADD CONSTRAINT eca_range_chk CHECK (valid_to IS NULL OR valid_to >= valid_from);
CREATE UNIQUE INDEX eca_one_primary_open
  ON employee_company_assignments (employee_profile_id)
  WHERE is_primary AND valid_to IS NULL;

-- --- Social (ADR-031) --------------------------------------------------------
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_chk
  CHECK (num_nonnulls(content_item_id, comment_id) = 1);
-- Social-Beiträge: Kategorie Pflicht, Marktplatzfelder nur bei MARKETPLACE
ALTER TABLE posts ADD CONSTRAINT posts_social_chk CHECK (
  (kind = 'NEWS'   AND social_category IS NULL AND marketplace_intent IS NULL AND price_label IS NULL) OR
  (kind = 'SOCIAL' AND social_category IS NOT NULL
                   AND (social_category = 'MARKETPLACE' OR (marketplace_intent IS NULL AND price_label IS NULL)))
);
ALTER TABLE user_settings ADD CONSTRAINT user_settings_birthday_chk
  CHECK (birthday_month_day IS NULL OR birthday_month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
-- Lesestatus für Social technisch ausgeschlossen: Trigger auf content_items/posts
-- verhindert read_tracking_enabled = true bzw. requires_acknowledgement = true bei kind = 'SOCIAL'.

-- --- Stiftungsgruppe (ADR-034) ----------------------------------------------
ALTER TABLE company_brandings ADD CONSTRAINT company_brandings_color_chk
  CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'
     AND (primary_dark IS NULL OR primary_dark ~ '^#[0-9A-Fa-f]{6}$')
     AND (primary_tint IS NULL OR primary_tint ~ '^#[0-9A-Fa-f]{6}$')
     AND (accent_color IS NULL OR accent_color ~ '^#[0-9A-Fa-f]{6}$')
     AND (surface_color IS NULL OR surface_color ~ '^#[0-9A-Fa-f]{6}$'));
-- Markenregel (ADR-039): Logo nur auf Weiß → kein Negativ-Logo hinterlegen
ALTER TABLE company_brandings ADD CONSTRAINT company_brandings_logo_white_chk
  CHECK (NOT logo_requires_white OR logo_inverse_file_id IS NULL);
ALTER TABLE companies ADD CONSTRAINT companies_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);
-- Zyklenfreiheit des Baums per Trigger (rekursive CTE) prüfen; Kontrastprüfung erfolgt in der Anwendung.
