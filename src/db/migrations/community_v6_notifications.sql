-- Community v6: per-user toggle for community-related push notifications
-- Additive only. Defaults TRUE so existing users opt-in by default.

ALTER TABLE users ADD COLUMN IF NOT EXISTS community_notifications_enabled
    BOOLEAN NOT NULL DEFAULT TRUE;
