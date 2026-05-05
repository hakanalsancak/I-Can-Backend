-- Community v3: sport feed tables
-- Additive only.

CREATE TABLE IF NOT EXISTS sport_articles (
    id              BIGSERIAL PRIMARY KEY,
    sport           VARCHAR(50) NOT NULL,
    category        VARCHAR(20) NOT NULL CHECK (category IN
        ('training','recovery','mindset','news')),
    title           TEXT NOT NULL,
    original_title  TEXT NOT NULL,
    summary         TEXT NOT NULL,
    source_name     VARCHAR(100) NOT NULL,
    source_url      TEXT NOT NULL UNIQUE,
    image_url       TEXT,
    relevance_score SMALLINT NOT NULL,
    published_at    TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hash            VARCHAR(64) NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_articles_sport_recent
    ON sport_articles (sport, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category
    ON sport_articles (category, published_at DESC);

CREATE TABLE IF NOT EXISTS user_sport_prefs (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category   VARCHAR(20) NOT NULL CHECK (category IN
        ('training','recovery','mindset','news')),
    weight     REAL NOT NULL DEFAULT 1.0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, category)
);

CREATE TABLE IF NOT EXISTS article_interactions (
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    article_id BIGINT NOT NULL REFERENCES sport_articles(id) ON DELETE CASCADE,
    action     VARCHAR(10) NOT NULL CHECK (action IN ('view','open','save','dismiss')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, article_id, action)
);
CREATE INDEX IF NOT EXISTS idx_article_interactions_user
    ON article_interactions (user_id, created_at DESC);
