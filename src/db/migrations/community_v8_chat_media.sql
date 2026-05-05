-- Community v8: extend DM attachment types to include video and voice
-- Postgres requires dropping and re-adding the CHECK constraint to change values.

ALTER TABLE dm_messages
    DROP CONSTRAINT IF EXISTS dm_messages_attachment_type_check;

ALTER TABLE dm_messages
    ADD CONSTRAINT dm_messages_attachment_type_check
    CHECK (
      attachment_type IS NULL OR attachment_type IN
      ('post', 'training', 'pr', 'challenge', 'image', 'video', 'voice')
    );
