-- Reaktionen auf Chat-Nachrichten: 👍 👎 ❤️ 🎉 (ADR-048)
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'THUMBS_UP';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'THUMBS_DOWN';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'HEART';
ALTER TYPE "ReactionType" ADD VALUE IF NOT EXISTS 'CELEBRATE';

ALTER TABLE "reactions" ADD COLUMN "chat_message_id" UUID;
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "reactions_chat_message_id_idx" ON "reactions"("chat_message_id");

ALTER TABLE reactions DROP CONSTRAINT reactions_target_chk;
ALTER TABLE reactions ADD CONSTRAINT reactions_target_chk CHECK (num_nonnulls(content_item_id, comment_id, chat_message_id) = 1);
CREATE UNIQUE INDEX reactions_unique_chat ON reactions (user_id, chat_message_id, type) WHERE chat_message_id IS NOT NULL;
