-- Add height (cm), weight (kg), and privacy toggle for height/weight visibility
ALTER TABLE users ADD COLUMN IF NOT EXISTS height NUMERIC(5,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS weight NUMERIC(5,1);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_height_weight BOOLEAN NOT NULL DEFAULT FALSE;
