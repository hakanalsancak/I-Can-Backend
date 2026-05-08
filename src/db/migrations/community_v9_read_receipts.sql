-- Community v9: WhatsApp-style read receipts on direct messages.
-- delivered_at: when the recipient first fetched the message (two gray ticks).
-- read_at:      when the recipient opened the chat after delivery (two colored ticks).

ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- Speeds up the bulk update that flips queued messages to delivered when the
-- recipient pulls a conversation page.
CREATE INDEX IF NOT EXISTS idx_dm_messages_undelivered
    ON dm_messages (conversation_id, sender_id)
 WHERE delivered_at IS NULL AND deleted_at IS NULL;
