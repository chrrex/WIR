-- Meetings: Serien, Agenda, Live-Protokoll, Festschreiben, „Daraus machen …“ (ADR-061)
ALTER TYPE "ContentType" ADD VALUE IF NOT EXISTS 'MEETING';
ALTER TYPE "AppModule" ADD VALUE IF NOT EXISTS 'MEETINGS';
ALTER TYPE "TranslatableEntity" ADD VALUE IF NOT EXISTS 'AGENDA_ITEM';
ALTER TYPE "TranslatableEntity" ADD VALUE IF NOT EXISTS 'MEETING_DECISION';
CREATE TYPE "MeetingStatus" AS ENUM ('PLANNED', 'AGENDA_SET', 'LIVE', 'REVIEW', 'LOCKED', 'CANCELLED');
CREATE TYPE "MeetingAttendance" AS ENUM ('INVITED', 'PRESENT', 'ONLINE', 'EXCUSED', 'ABSENT');
CREATE TYPE "MeetingRole" AS ENUM ('LEAD', 'MINUTES', 'TIMEKEEPER');
CREATE TYPE "AgendaItemStatus" AS ENUM ('PROPOSED', 'SET', 'DONE', 'POSTPONED', 'PARKED', 'MERGED');
CREATE TYPE "MeetingLinkKind" AS ENUM ('TASK', 'KNOWLEDGE', 'NEWS', 'HANDOVER', 'CHECKLIST');

CREATE TABLE "meeting_series" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "company_id" UUID NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL,
  "member_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "recurrence_rule" TEXT,
  "duration_min" INTEGER NOT NULL DEFAULT 60,
  "location" TEXT,
  "online_url" TEXT,
  "agenda_lead_hours" INTEGER NOT NULL DEFAULT 26,
  "retention_years" INTEGER NOT NULL DEFAULT 3,
  "standard_items" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "lead_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "minutes_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "timekeeper_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE "meetings" (
  "id" UUID NOT NULL PRIMARY KEY REFERENCES "content_items"("id") ON DELETE CASCADE,
  "series_id" UUID REFERENCES "meeting_series"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "duration_min" INTEGER NOT NULL DEFAULT 60,
  "location" TEXT,
  "online_url" TEXT,
  "status" "MeetingStatus" NOT NULL DEFAULT 'PLANNED',
  "agenda_deadline" TIMESTAMPTZ(6),
  "agenda_set_at" TIMESTAMPTZ(6),
  "started_at" TIMESTAMPTZ(6),
  "ended_at" TIMESTAMPTZ(6),
  "submitted_at" TIMESTAMPTZ(6),
  "submitted_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "locked_at" TIMESTAMPTZ(6),
  "locked_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "retain_until" TIMESTAMPTZ(6),
  "cancel_note" TEXT
);
CREATE INDEX "meetings_series_id_starts_at_idx" ON "meetings"("series_id", "starts_at");
CREATE INDEX "meetings_status_starts_at_idx" ON "meetings"("status", "starts_at");
CREATE TRIGGER meetings_type_chk BEFORE INSERT ON meetings
  FOR EACH ROW EXECUTE FUNCTION assert_content_type('MEETING');

CREATE TABLE "meeting_attendees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "user_id" UUID REFERENCES "users"("id") ON DELETE CASCADE,
  "guest_name" TEXT,
  "guest_org" TEXT,
  "guest_email" TEXT,
  "role" "MeetingRole",
  "status" "MeetingAttendance" NOT NULL DEFAULT 'INVITED',
  CONSTRAINT "meeting_attendees_who_chk" CHECK (num_nonnulls("user_id", "guest_name") = 1)
);
CREATE UNIQUE INDEX "meeting_attendees_meeting_id_user_id_key" ON "meeting_attendees"("meeting_id", "user_id");

CREATE TABLE "agenda_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "author_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "owner_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "duration_min" INTEGER NOT NULL DEFAULT 10,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "status" "AgendaItemStatus" NOT NULL DEFAULT 'PROPOSED',
  "confidential" BOOLEAN NOT NULL DEFAULT false,
  "viewer_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "notes" TEXT,
  "photo_file_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "spent_sec" INTEGER NOT NULL DEFAULT 0,
  "timer_at" TIMESTAMPTZ(6),
  "source_path" TEXT,
  "origin" TEXT,
  "carried_from_id" UUID REFERENCES "agenda_items"("id") ON DELETE SET NULL,
  "carried_at" TIMESTAMPTZ(6),
  "merged_into_id" UUID REFERENCES "agenda_items"("id") ON DELETE SET NULL,
  "follow_up_on" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX "agenda_items_meeting_id_sort_order_idx" ON "agenda_items"("meeting_id", "sort_order");
CREATE INDEX "agenda_items_status_idx" ON "agenda_items"("status");

CREATE TABLE "meeting_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "item_id" UUID NOT NULL REFERENCES "agenda_items"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "created_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE "meeting_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "item_id" UUID NOT NULL REFERENCES "agenda_items"("id") ON DELETE CASCADE,
  "decision_id" UUID REFERENCES "meeting_decisions"("id") ON DELETE SET NULL,
  "content_item_id" UUID REFERENCES "content_items"("id") ON DELETE CASCADE,
  "checklist_id" UUID REFERENCES "checklists"("id") ON DELETE CASCADE,
  "kind" "MeetingLinkKind" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "meeting_links_target_chk" CHECK (num_nonnulls("content_item_id", "checklist_id") = 1)
);
CREATE UNIQUE INDEX "meeting_links_content_item_id_key" ON "meeting_links"("content_item_id");

CREATE TABLE "meeting_addenda" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "meeting_id" UUID NOT NULL REFERENCES "meetings"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "author_id" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Festgeschriebene Protokolle sind unveränderlich (nur Nachträge, Anwesenheit bleibt Stand des Termins)
CREATE FUNCTION meetings_locked_guard() RETURNS trigger AS $$
DECLARE mid UUID;
BEGIN
  IF current_setting('wir.purge', true) = 'on' THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; -- Aufbewahrungsfrist abgelaufen
  -- Spalten je Tabelle nur im passenden Zweig ansprechen (PL/pgSQL prüft sonst den Datensatztyp)
  IF TG_TABLE_NAME = 'meetings' THEN mid := OLD.id;
  ELSIF TG_TABLE_NAME = 'meeting_decisions' THEN EXECUTE 'SELECT meeting_id FROM agenda_items WHERE id = $1.item_id' INTO mid USING OLD;
  ELSE EXECUTE 'SELECT $1.meeting_id' INTO mid USING OLD;
  END IF;
  IF TG_TABLE_NAME = 'meetings' THEN
    IF OLD.status = 'LOCKED' AND (NEW.status <> 'LOCKED' OR NEW.title <> OLD.title OR NEW.starts_at <> OLD.starts_at) THEN
      RAISE EXCEPTION 'Protokoll ist festgeschrieben';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM meetings WHERE id = mid AND status = 'LOCKED') THEN
    -- Übertrag ins nächste Meeting vermerken ist erlaubt (nur carried_at ändert sich)
    IF TG_TABLE_NAME = 'agenda_items' AND TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'carried_at') = (to_jsonb(OLD) - 'carried_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Protokoll ist festgeschrieben';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER meetings_locked BEFORE UPDATE ON meetings FOR EACH ROW EXECUTE FUNCTION meetings_locked_guard();
CREATE TRIGGER agenda_items_locked BEFORE UPDATE OR DELETE ON agenda_items FOR EACH ROW EXECUTE FUNCTION meetings_locked_guard();
CREATE TRIGGER meeting_decisions_locked BEFORE UPDATE OR DELETE ON meeting_decisions FOR EACH ROW EXECUTE FUNCTION meetings_locked_guard();
CREATE TRIGGER meeting_attendees_locked BEFORE UPDATE OR DELETE ON meeting_attendees FOR EACH ROW EXECUTE FUNCTION meetings_locked_guard();
