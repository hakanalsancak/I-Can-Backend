-- Influencer / partner promo code attribution.
--
-- Design: We use TWO Apple "Subscription Offers" in App Store Connect
-- (one per product, both 10% off). Each offer holds unlimited custom codes.
-- Apple's JWS only carries the offer_identifier, not the redeemed code text,
-- so per-influencer attribution is captured in our app *before* Apple's sheet
-- is shown (see pending_code_claim).
--
-- Everything is managed via SQL directly:
--   * Add code:   INSERT INTO influencer_codes (...)
--   * See uses:   SELECT FROM influencer_redemptions
--   * Pay out:    SELECT ... GROUP BY influencer_name

-- One row per redeemable code. Each row IS an influencer entry — if the same
-- person has multiple codes (MIKE10, MIKEFIT), insert one row per code with
-- the same influencer_name.
CREATE TABLE IF NOT EXISTS influencer_codes (
  code TEXT PRIMARY KEY,
  influencer_name TEXT NOT NULL,
  influencer_email TEXT,
  -- Flat bounty paid per net (non-refunded) new subscription, in USD cents.
  payout_yearly_cents INTEGER NOT NULL DEFAULT 400,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencer_codes_name
  ON influencer_codes(influencer_name);

-- Captures the code the user typed *before* Apple's redeem sheet is presented.
-- When the redemption webhook arrives we join on user_id to credit the right
-- code. One pending claim per user; expires after 1 hour.
CREATE TABLE IF NOT EXISTS pending_code_claim (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX IF NOT EXISTS idx_pending_code_claim_expires
  ON pending_code_claim(expires_at);

-- One row per successful offer-code redemption — this is the "did someone use
-- a code?" table. influencer_name is denormalised so payout reports keep
-- working even if you rename or disable the code row later.
-- original_transaction_id is unique to prevent double-credit.
CREATE TABLE IF NOT EXISTS influencer_redemptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  influencer_name TEXT NOT NULL,
  original_transaction_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  offer_identifier TEXT,
  -- 'active' once redeemed; 'refunded' / 'revoked' suppresses payout.
  status TEXT NOT NULL DEFAULT 'active',
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  refunded_at TIMESTAMPTZ,
  -- Snapshot of the bounty rate at time of redemption so changing
  -- payout_*_cents later doesn't rewrite history.
  payout_cents INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_influencer_redemptions_code
  ON influencer_redemptions(code);
CREATE INDEX IF NOT EXISTS idx_influencer_redemptions_name
  ON influencer_redemptions(influencer_name);
CREATE INDEX IF NOT EXISTS idx_influencer_redemptions_redeemed_at
  ON influencer_redemptions(redeemed_at);
