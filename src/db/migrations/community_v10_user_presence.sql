-- Community v10: lightweight user presence.
-- last_seen_at is bumped from the auth middleware (debounced in-process so we
-- only write at most once every ~30s per user). "Online" is computed at read
-- time as last_seen_at within the last 90s — keeps the read path index-free.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
