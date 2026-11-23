-- Security hardening from the November 2026 audit.
--
-- Run in the Supabase SQL Editor (runs as `postgres`). Idempotent: safe to run
-- more than once. Every section names the attack it closes. The common thread:
-- the app's checks live in server actions, but anyone signed in can also call
-- the database API directly with their own token, so the database itself has
-- to refuse what the app would refuse.

------------------------------------------------------------------------------
-- 1. Designs: users may create them, never change them.
--    Attack closed: publish a design for a verified quote, then PATCH
--    designs.quote_id to one of your rejected (hallucinated) quotes. The post
--    stayed public and showed the rejected text. Also closes pointing
--    rendered_image_url at any host or at an unchecked upload: that column is
--    now written only by the server (service role) after it checks the image.
------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.designs FROM anon, authenticated;
GRANT INSERT (user_id, quote_id, insight_id, configuration) ON public.designs TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'designs_configuration_size') THEN
    ALTER TABLE public.designs
      ADD CONSTRAINT designs_configuration_size
      CHECK (octet_length(configuration::text) <= 16384) NOT VALID;
  END IF;
END;
$$;

------------------------------------------------------------------------------
-- 2. Quotes and insights: written by the server only.
--    Attack closed: PATCH an insight's title/summary to any text (or a quote's
--    why_it_matters), then publish it under the real video's name.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner update" ON public.quotes;
DROP POLICY IF EXISTS "Owner update" ON public.insights;
REVOKE INSERT, UPDATE ON public.quotes, public.insights FROM anon, authenticated;

------------------------------------------------------------------------------
-- 3. Posts and comments: only the columns the app writes.
--    Attack closed: setting created_at to 2099 to pin a post to the top of
--    Discover (or a report/comment into the future); editing a comment after
--    it was reported (there is no edit feature).
------------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.posts FROM anon, authenticated;
GRANT INSERT (user_id, design_id, visibility, caption) ON public.posts TO authenticated;
GRANT UPDATE (visibility, caption, updated_at) ON public.posts TO authenticated;

REVOKE INSERT, UPDATE ON public.comments FROM anon, authenticated;
GRANT INSERT (post_id, user_id, content) ON public.comments TO authenticated;

------------------------------------------------------------------------------
-- 4. Backstop limits on what other people see.
--    Attack closed: posting comments or posts in a loop straight to the API,
--    which skipped the server actions' rate limits. These limits sit above
--    the app's own (10 comments/min, 200/day, 30 posts/hour), so normal use
--    never meets them; they only stop scripts.
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS comments_user_created_idx ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_created_idx ON public.posts (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_write_backstop()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  recent integer;
BEGIN
  IF public.request_role() NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'comments' THEN
    SELECT count(*) INTO recent FROM public.comments
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 minute';
    IF recent >= 15 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(*) INTO recent FROM public.comments
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 day';
    IF recent >= 300 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'posts' THEN
    SELECT count(*) INTO recent FROM public.posts
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
    IF recent >= 40 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_write_backstop ON public.comments;
CREATE TRIGGER enforce_write_backstop BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_backstop();
DROP TRIGGER IF EXISTS enforce_write_backstop ON public.posts;
CREATE TRIGGER enforce_write_backstop BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_backstop();

------------------------------------------------------------------------------
-- 5. Reports and feedback: written by the server only.
--    Attack closed: inserting hundreds of reports (on made-up targets) or
--    feedback rows dated in the future, which pushed every real one off the
--    admin pages; feedback needed no account at all. The server actions check
--    the target, rate-limit and then insert with the service role.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "reports: members insert own" ON public.reports;
REVOKE INSERT, UPDATE ON public.reports FROM anon, authenticated;

DROP POLICY IF EXISTS "Anyone can send feedback" ON public.feedback;
REVOKE INSERT, UPDATE ON public.feedback FROM anon, authenticated;

------------------------------------------------------------------------------
-- 6. Profiles: users may edit their name, username and bio, nothing else.
--    Attacks closed:
--    - username = another user's UUID, which took over /profile/<their id>
--      (the page now also looks up UUIDs by id only);
--    - deleting your own profile row, which detached your AI usage
--      (ON DELETE SET NULL) and reset your daily spending cap;
--    - megabyte-long names and bios shown in every feed card.
--    Usernames are stored lowercase; one existing mixed-case name is fixed
--    here (profile links match case-insensitively).
------------------------------------------------------------------------------
UPDATE public.profiles p
SET username = lower(p.username)
WHERE p.username <> lower(p.username)
  AND NOT EXISTS (SELECT 1 FROM public.profiles o WHERE o.username = lower(p.username));

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (username, full_name, bio, updated_at) ON public.profiles TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_username_format') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_full_name_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_full_name_length CHECK (full_name IS NULL OR char_length(full_name) <= 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_bio_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 500) NOT VALID;
  END IF;
END;
$$;

------------------------------------------------------------------------------
-- 7. Storage: no direct uploads to the public bucket.
--    Attack closed: uploading unlimited 10 MB files of any content to
--    public_graphics/posts/<uid>/ (free public hosting on this project), and
--    skipping the publish rate limit. Uploads now go only through one-time
--    signed URLs the server issues after its checks.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "public_graphics: owners upload png to own folder" ON storage.objects;

------------------------------------------------------------------------------
-- 8. consume_rate_limit: guests get nothing, and the video check is counted.
--    Guests can create new anonymous accounts at will, so a per-account limit
--    means little for them; they are refused here (members-only features are
--    already refused to guests in the app). "preflight" limits how often one
--    account can spend the YouTube Data API quota.
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
  IF coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'true' THEN
    RETURN FALSE;
  END IF;
  IF p_action NOT IN (
    'source_create', 'analysis_run', 'feedback', 'report', 'preflight',
    'comment', 'comment_daily', 'like', 'bookmark', 'follow', 'publish'
  ) THEN
    RAISE EXCEPTION 'Unknown rate limit action' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit' USING ERRCODE = '22023';
  END IF;

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

  DELETE FROM public.rate_limit_events
  WHERE user_id = uid AND created_at < NOW() - INTERVAL '2 days';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;

------------------------------------------------------------------------------
-- 9. Limits per network, for steps that happen before there is an account:
--    guest sign-in, sign-up, password attempts, feedback from visitors.
--    Supabase's own per-IP auth limits see the app server's address, not the
--    visitor's, so the server keys these on a hash of the visitor's IP (never
--    the IP itself). Only the service role can call it.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.key_rate_limit_events (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS key_rate_limit_events_lookup_idx
  ON public.key_rate_limit_events (key, action, created_at DESC);
ALTER TABLE public.key_rate_limit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.key_rate_limit_events FROM anon, authenticated;
-- No policies: only the function below touches it.

CREATE OR REPLACE FUNCTION public.consume_key_rate_limit(
  p_key TEXT,
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
  used INTEGER;
BEGIN
  IF p_key IS NULL OR length(p_key) < 8 OR length(p_key) > 128 THEN
    RAISE EXCEPTION 'Invalid key' USING ERRCODE = '22023';
  END IF;
  IF p_action NOT IN ('guest_create', 'signup', 'login', 'feedback_visitor') THEN
    RAISE EXCEPTION 'Unknown rate limit action' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_key || ':' || p_action));

  SELECT count(*) INTO used
  FROM public.key_rate_limit_events
  WHERE key = p_key AND action = p_action
    AND created_at > NOW() - make_interval(secs => p_window_seconds);

  IF used >= p_limit THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.key_rate_limit_events (key, action) VALUES (p_key, p_action);
  DELETE FROM public.key_rate_limit_events
  WHERE key = p_key AND created_at < NOW() - INTERVAL '2 days';
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_key_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_key_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

------------------------------------------------------------------------------
-- 10. Suspension takes effect at once.
--     A ban only stopped new sign-ins and token refreshes; the suspended
--     user's current session kept working for up to an hour, and they could
--     delete the banned account and sign up again with the same identity.
--     admin_revoke_sessions() ends every session (server actions then see no
--     user); delete_my_account() refuses banned accounts.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_revoke_sessions(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_sessions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = uid AND banned_until > NOW()) THEN
    RAISE EXCEPTION 'Suspended accounts cannot be deleted' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

------------------------------------------------------------------------------
-- 11. One analysis at a time per account, and a cap across everyone.
--     Attack closed: starting several long analyses at once. The daily
--     spending cap is checked before each call and spend is recorded after
--     it, so parallel runs all saw $0 spent and all went ahead.
--     Raises ANALYSIS_IN_PROGRESS / ANALYSIS_BUSY, which the app turns into
--     friendly messages. p_max_running comes from AI_MAX_CONCURRENT_ANALYSES.
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_analysis(uuid, integer);

CREATE OR REPLACE FUNCTION public.claim_analysis(
  p_source_id uuid,
  p_stale_seconds integer DEFAULT 600,
  p_max_running integer DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  stale interval := make_interval(secs => greatest(p_stale_seconds, 60));
  a record;
  has_row boolean;
  new_id uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'true' THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sources WHERE id = p_source_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Source not found' USING ERRCODE = '42501';
  END IF;

  -- One lock for all claims: they are short, and it makes the counts below exact.
  PERFORM pg_advisory_xact_lock(hashtext('claim_analysis:global'));

  SELECT id, status, updated_at INTO a
  FROM public.analyses
  WHERE source_id = p_source_id
  ORDER BY (status = 'completed') DESC, (status = 'processing') DESC, updated_at DESC
  LIMIT 1;
  has_row := FOUND;

  IF has_row THEN
    IF a.status = 'completed' THEN
      RETURN NULL;
    END IF;
    IF a.status = 'processing' AND a.updated_at > NOW() - stale THEN
      RETURN NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.analyses x JOIN public.sources s ON s.id = x.source_id
    WHERE s.user_id = uid AND x.source_id <> p_source_id
      AND x.status = 'processing' AND x.updated_at > NOW() - stale
  ) THEN
    RAISE EXCEPTION 'ANALYSIS_IN_PROGRESS' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM public.analyses x
      WHERE x.status = 'processing' AND x.updated_at > NOW() - stale) >= greatest(p_max_running, 1) THEN
    RAISE EXCEPTION 'ANALYSIS_BUSY' USING ERRCODE = 'P0001';
  END IF;

  IF NOT has_row THEN
    INSERT INTO public.analyses (source_id, status) VALUES (p_source_id, 'processing') RETURNING id INTO new_id;
    RETURN new_id;
  END IF;

  UPDATE public.analyses SET status = 'processing', updated_at = NOW() WHERE id = a.id;
  RETURN a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_analysis(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_analysis(uuid, integer, integer) TO authenticated;
