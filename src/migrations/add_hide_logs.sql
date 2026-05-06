-- Privacy toggle for friends seeing each other's daily logs (training, nutrition, sleep)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_logs BOOLEAN NOT NULL DEFAULT FALSE;
