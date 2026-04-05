-- Migration: Add 'daily_log' activity type
-- Run this on the live database to allow the new daily log format

-- Drop the old CHECK constraint and add the new one
ALTER TABLE daily_entries
  DROP CONSTRAINT IF EXISTS daily_entries_activity_type_check;

ALTER TABLE daily_entries
  ADD CONSTRAINT daily_entries_activity_type_check
  CHECK (activity_type IN ('training', 'game', 'rest_day', 'other', 'daily_log'));
