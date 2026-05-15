-- Tracks which users have tapped "Join Community" on the home screen.
-- The displayed community count is BASE_COMMUNITY_COUNT (314) + COUNT(*).
CREATE TABLE IF NOT EXISTS community_members (
  user_id   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
