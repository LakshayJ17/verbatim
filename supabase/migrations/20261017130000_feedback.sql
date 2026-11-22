-- Feedback sent from the /feedback form. Only what is needed to read and
-- answer it: the message, an optional reply email, the page it came from
-- and, if signed in, the user id. Anyone can submit; nobody can read rows
-- through the public API (read them in the Supabase dashboard).

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000),
  email TEXT CHECK (email IS NULL OR char_length(email) <= 254),
  page TEXT CHECK (page IS NULL OR char_length(page) <= 200),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can send feedback" ON feedback;
CREATE POLICY "Anyone can send feedback" ON feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());
