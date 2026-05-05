-- Community v2: profile fields on users
-- Additive only. Nullable / constant defaults — metadata-only ALTERs in Postgres 11+.
-- v1 clients ignore unknown JSON keys so no client-side breakage.

ALTER TABLE users ADD COLUMN IF NOT EXISTS handle VARCHAR(30) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT
    CHECK (bio IS NULL OR length(bio) <= 200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(10) NOT NULL
    DEFAULT 'public'
    CHECK (profile_visibility IN ('public','friends','private'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_share_prefs JSONB NOT NULL
    DEFAULT '{"pr":true,"streak":true,"training":false}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_users_handle
    ON users(handle) WHERE handle IS NOT NULL;
