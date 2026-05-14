BEGIN;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY apple_transaction_id
            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
    FROM subscriptions
    WHERE apple_transaction_id IS NOT NULL
)
UPDATE subscriptions AS s
SET apple_transaction_id = NULL,
    updated_at = NOW()
FROM ranked AS r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_apple_transaction_unique
ON subscriptions(apple_transaction_id)
WHERE apple_transaction_id IS NOT NULL;

COMMIT;
