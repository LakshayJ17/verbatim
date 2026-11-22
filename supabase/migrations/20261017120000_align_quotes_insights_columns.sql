-- The app writes and reads quotes.user_id, quotes.speaker_name,
-- insights.user_id and insights.summary, but the initial schema created
-- quotes.speaker and insights.explanation without user_id. Inserts against
-- the initial schema fail, so analyses produced no quotes or insights.
--
-- This migration only adds columns and copies existing data across.
-- It does not drop or rename anything. Every statement is idempotent.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS speaker_name TEXT;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE insights ADD COLUMN IF NOT EXISTS summary TEXT;

-- explanation was NOT NULL; the app never writes it, so relax it.
ALTER TABLE insights ALTER COLUMN explanation DROP NOT NULL;

-- Backfill from existing columns and the owning source.
UPDATE quotes SET speaker_name = speaker WHERE speaker_name IS NULL AND speaker IS NOT NULL;
UPDATE insights SET summary = explanation WHERE summary IS NULL AND explanation IS NOT NULL;

UPDATE quotes q
SET user_id = s.user_id
FROM analyses a JOIN sources s ON s.id = a.source_id
WHERE q.analysis_id = a.id AND q.user_id IS NULL;

UPDATE insights i
SET user_id = s.user_id
FROM analyses a JOIN sources s ON s.id = a.source_id
WHERE i.analysis_id = a.id AND i.user_id IS NULL;

CREATE INDEX IF NOT EXISTS quotes_user_id_idx ON quotes(user_id);
CREATE INDEX IF NOT EXISTS insights_user_id_idx ON insights(user_id);
