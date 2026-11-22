-- Rate limits, a tamper-proof usage count, and server-only quote writes.
--
-- Run in the Supabase SQL Editor (runs as `postgres`). Idempotent: safe to run
-- more than once. Touches nothing owned by Supabase (auth.*, storage.*).

------------------------------------------------------------------------------
-- 1. Rate limit events.
--    One row per counted action. Users have NO policies on this table, so
--    they can neither read nor delete their own history: deleting a video no
--    longer resets the daily analysis limit. Rows are written only through
--    consume_rate_limit() below.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_events_lookup_idx
  ON public.rate_limit_events (user_id, action, created_at DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the SECURITY DEFINER function touches it.

------------------------------------------------------------------------------
-- 2. consume_rate_limit(action, limit, window_seconds) -> boolean
--    Counts the caller's events for this action inside the window. Returns
--    false (and records nothing) when the limit is reached, otherwise records
--    one event and returns true. The caller is always auth.uid(), so a user
--    can only ever spend their own quota. Actions, limits and windows are
--    bounded so a direct API call can't be used to flood the table.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_action TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid UUID := auth.uid();
  used INTEGER;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN (
    'source_create', 'analysis_run', 'feedback', 'report',
    'comment', 'comment_daily', 'like', 'bookmark', 'follow', 'publish'
  ) THEN
    RAISE EXCEPTION 'Unknown rate limit action' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent requests from the same user for the same action.
  PERFORM pg_advisory_xact_lock(hashtext(uid::text || ':' || p_action));

  SELECT count(*) INTO used
  FROM public.rate_limit_events
  WHERE user_id = uid
    AND action = p_action
    AND created_at > NOW() - make_interval(secs => p_window_seconds);

  IF used >= p_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.rate_limit_events (user_id, action) VALUES (uid, p_action);

  -- Housekeeping: drop this user's events older than two days.
  DELETE FROM public.rate_limit_events
  WHERE user_id = uid AND created_at < NOW() - INTERVAL '2 days';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;

------------------------------------------------------------------------------
-- 3. Quotes and insights are written by the server only.
--    The old "Owner access" policies were FOR ALL, which let a signed-in user
--    INSERT a quote already marked 'verified' through the API. Owners keep
--    SELECT, UPDATE and DELETE; INSERT now needs the service role, which only
--    the analysis server action uses after running verification itself.
--    (Updates to text and verification_status are already blocked by the
--    lock_quote_verification trigger from 20261017140000.)
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner access" ON public.quotes;
DROP POLICY IF EXISTS "Owner read" ON public.quotes;
DROP POLICY IF EXISTS "Owner update" ON public.quotes;
DROP POLICY IF EXISTS "Owner delete" ON public.quotes;

CREATE POLICY "Owner read" ON public.quotes FOR SELECT USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = quotes.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Owner update" ON public.quotes FOR UPDATE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = quotes.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Owner delete" ON public.quotes FOR DELETE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = quotes.analysis_id AND sources.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owner access" ON public.insights;
DROP POLICY IF EXISTS "Owner read" ON public.insights;
DROP POLICY IF EXISTS "Owner update" ON public.insights;
DROP POLICY IF EXISTS "Owner delete" ON public.insights;

CREATE POLICY "Owner read" ON public.insights FOR SELECT USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = insights.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Owner update" ON public.insights FOR UPDATE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = insights.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Owner delete" ON public.insights FOR DELETE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM public.analyses
    JOIN public.sources ON sources.id = analyses.source_id
    WHERE analyses.id = insights.analysis_id AND sources.user_id = auth.uid()
  )
);
-- The "Public read" policies on quotes and insights (for published posts)
-- are unchanged.
