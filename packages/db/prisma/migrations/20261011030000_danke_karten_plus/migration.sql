-- Danke-Karten: Mitunterschreiben, Gästelob, Erinnerungen (ADR-052)
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'SIGN';
ALTER TABLE "posts" ADD COLUMN "kudos_source" TEXT;
CREATE TABLE "thanks_reminders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "group_id" UUID REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "occasion" TEXT NOT NULL,
  "due_on" DATE NOT NULL,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "thanks_reminders_due_on_sent_at_idx" ON "thanks_reminders"("due_on", "sent_at");
