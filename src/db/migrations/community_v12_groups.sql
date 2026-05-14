-- Community v12: group chats
-- Extends the existing dm_* tables with group metadata, member roles, and
-- system-event messages ("X added Y", "X left the group", etc.).
-- Additive only; existing 1:1 conversations keep working unchanged.

ALTER TABLE dm_conversations
    ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS photo_url  TEXT;

ALTER TABLE dm_conversation_members
    ADD COLUMN IF NOT EXISTS role     VARCHAR(10) NOT NULL DEFAULT 'member'
        CHECK (role IN ('member', 'admin')),
    ADD COLUMN IF NOT EXISTS left_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dm_members_active
    ON dm_conversation_members (conversation_id)
    WHERE left_at IS NULL;

-- System messages: 'group.create', 'group.add', 'group.remove', 'group.leave',
-- 'group.rename', 'group.photo', 'group.promote', 'group.demote'.
-- Body holds a short denormalized phrase ("Alice added Bob") so older clients
-- without the system renderer still see something readable.
ALTER TABLE dm_messages
    ADD COLUMN IF NOT EXISTS is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS system_event VARCHAR(20),
    ADD COLUMN IF NOT EXISTS system_meta  JSONB;

CREATE INDEX IF NOT EXISTS idx_dm_messages_system
    ON dm_messages (conversation_id, created_at DESC)
    WHERE is_system = TRUE AND deleted_at IS NULL;
