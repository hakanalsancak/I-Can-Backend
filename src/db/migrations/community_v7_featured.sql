-- Community v7: Featured posts (editorial curation) + verified flag
-- Additive only.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS featured_posts (
    post_id     UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
    rank        SMALLINT NOT NULL DEFAULT 0,
    featured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ
);
-- Postgres requires functions in index predicates to be IMMUTABLE; NOW() isn't,
-- so we index everything and filter expiry at query time.
CREATE INDEX IF NOT EXISTS idx_featured_rank
    ON featured_posts (rank DESC, featured_at DESC);
