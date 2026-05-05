-- Community v5: moderation columns
-- Additive only. Both columns are nullable / defaulted, so v1 clients ignore them.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_suspended
    ON users(suspended_until) WHERE suspended_until IS NOT NULL;
