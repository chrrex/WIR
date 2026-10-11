-- Checklisten für alle: Zuweisung, öffentlich/privat, gemeinsam/einzeln, mehr Feldtypen und Regeln (ADR-056)
ALTER TYPE "ChecklistResponseType" ADD VALUE IF NOT EXISTS 'CHOICE';
ALTER TYPE "ChecklistResponseType" ADD VALUE IF NOT EXISTS 'SIGNATURE';
ALTER TYPE "ChecklistResponseType" ADD VALUE IF NOT EXISTS 'HEADING';
CREATE TYPE "ChecklistVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "ChecklistCompletion" AS ENUM ('SHARED', 'EACH');

ALTER TABLE "checklists"
  ADD COLUMN "owner_id" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD COLUMN "visibility" "ChecklistVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "completion_mode" "ChecklistCompletion" NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "assignees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "due_in_hours" INTEGER;
-- Bestehende Team-Vorlagen: Team als Empfänger übernehmen
UPDATE "checklists" SET "assignees" = ARRAY['G:' || "group_id"::text] WHERE "group_id" IS NOT NULL;

ALTER TABLE "checklist_items"
  ADD COLUMN "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "flagged" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "require_note" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "require_photo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "create_task" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "show_if_item_id" UUID,
  ADD COLUMN "show_if_value" TEXT;
UPDATE "checklist_items" SET "flagged" = ARRAY['Nein'] WHERE "response_type" = 'YES_NO';

ALTER TABLE "checklist_runs" ADD COLUMN "assignee_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "checklists_owner_id_idx" ON "checklists"("owner_id");
