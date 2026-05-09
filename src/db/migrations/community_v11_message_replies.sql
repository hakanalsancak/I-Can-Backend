-- Community v11: in-thread replies (Telegram/WhatsApp style).
-- ON DELETE SET NULL so soft-deleting the original message gracefully
-- degrades any replies to "this message was removed" instead of cascading.

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
        REFERENCES dm_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dm_messages_reply_to
    ON dm_messages (reply_to_message_id)
 WHERE reply_to_message_id IS NOT NULL;
