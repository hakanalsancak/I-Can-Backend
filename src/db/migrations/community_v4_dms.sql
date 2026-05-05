-- Community v4: direct messages
-- Additive only. Uses dm_* prefix so existing AI Coach 'conversations' / 'chat_messages' tables
-- (used by chatController) are untouched.

CREATE TABLE IF NOT EXISTS dm_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_group        BOOLEAN NOT NULL DEFAULT FALSE,
    title           VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_recent
    ON dm_conversations (last_message_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS dm_conversation_members (
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at    TIMESTAMPTZ,
    is_request      BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dm_members_user
    ON dm_conversation_members (user_id);

CREATE TABLE IF NOT EXISTS dm_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT CHECK (body IS NULL OR length(body) <= 2000),
    attachment_type VARCHAR(15) CHECK (attachment_type IS NULL OR attachment_type IN
        ('post','training','pr','challenge','image')),
    attachment_ref  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conv
    ON dm_messages (conversation_id, created_at DESC) WHERE deleted_at IS NULL;
