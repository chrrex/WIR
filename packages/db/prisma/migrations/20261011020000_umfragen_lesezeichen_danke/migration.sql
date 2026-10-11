-- Abstimmungen in News/Übergaben, Lesezeichen, Danke-Karten (ADR-050, ADR-051)
ALTER TYPE "SocialCategory" ADD VALUE IF NOT EXISTS 'THANKS';
ALTER TABLE "posts" ADD COLUMN "kudos_motif" TEXT, ADD COLUMN "kudos_group_id" UUID;
ALTER TABLE "posts" ADD CONSTRAINT "posts_kudos_group_id_fkey" FOREIGN KEY ("kudos_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "polls" (
  "id" UUID NOT NULL PRIMARY KEY REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "question" TEXT NOT NULL,
  "multiple" BOOLEAN NOT NULL DEFAULT false,
  "closes_at" TIMESTAMPTZ(6)
);
CREATE TABLE "poll_options" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "poll_id" UUID NOT NULL REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "poll_options_poll_id_idx" ON "poll_options"("poll_id");
CREATE TABLE "poll_votes" (
  "option_id" UUID NOT NULL REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("option_id", "user_id")
);
CREATE INDEX "poll_votes_user_id_idx" ON "poll_votes"("user_id");

CREATE TABLE "bookmarks" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "content_item_id" UUID NOT NULL REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "content_item_id")
);
