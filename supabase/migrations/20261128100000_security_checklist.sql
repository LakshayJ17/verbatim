-- Security checklist follow-ups. Safe to run more than once.
--
-- 1. collection_items: only items the user can see can be added.
-- 2. Database rate limits for designs, collections and collection items.
-- 3. New per-account and per-network limit names used by the app.

------------------------------------------------------------------------------
-- 1. collection_items
--    The policy only checked that the collection belonged to the user, so the
--    API accepted the id of someone else's private quote, insight or post
--    (an IDOR). The referenced row must now be visible to the user: their
--    own, or part of a public post. Quote and insight reads go through their
--    own row level security, so a private item stays out of reach.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner access" ON public.collection_items;
CREATE POLICY "Owner access" ON public.collection_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = collection_items.collection_id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  AND EXISTS (
    SELECT 1 FROM public.collections c
    WHERE c.id = collection_items.collection_id AND c.user_id = auth.uid()
  )
  AND (
    (item_type = 'quote' AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = collection_items.quote_id))
    OR (item_type = 'insight' AND EXISTS (SELECT 1 FROM public.insights i WHERE i.id = collection_items.insight_id))
    OR (item_type = 'post' AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = collection_items.post_id AND (p.visibility = 'public' OR p.user_id = auth.uid())
    ))
  )
);

------------------------------------------------------------------------------
-- 2. Rate limits in the database for writes that skip the server actions.
--    Browsers can insert designs, collections and collection items through
--    the API directly, which skipped the app's limits. These sit well above
--    the app's own limits (120 designs and 30 collections an hour), so normal
--    use never meets them; they only stop scripts.
------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS designs_user_created_idx ON public.designs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collections_user_created_idx ON public.collections (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collection_items_collection_added_idx ON public.collection_items (collection_id, added_at DESC);

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
  ELSIF TG_TABLE_NAME = 'designs' THEN
    SELECT count(*) INTO recent FROM public.designs
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
    IF recent >= 200 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'collections' THEN
    SELECT count(*) INTO recent FROM public.collections
      WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
    IF recent >= 50 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'collection_items' THEN
    SELECT count(*) INTO recent
      FROM public.collection_items ci
      JOIN public.collections c ON c.id = ci.collection_id
      WHERE c.user_id = auth.uid() AND ci.added_at > now() - interval '1 hour';
    IF recent >= 500 THEN
      RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_write_backstop ON public.designs;
CREATE TRIGGER enforce_write_backstop BEFORE INSERT ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_backstop();
DROP TRIGGER IF EXISTS enforce_write_backstop ON public.collections;
CREATE TRIGGER enforce_write_backstop BEFORE INSERT ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_backstop();
DROP TRIGGER IF EXISTS enforce_write_backstop ON public.collection_items;
CREATE TRIGGER enforce_write_backstop BEFORE INSERT ON public.collection_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_write_backstop();

------------------------------------------------------------------------------
-- 3. Limit names. Saving designs, creating collections and editing a profile
--    are now limited per account; resending the confirmation email is limited
--    per network. Same functions as the 20261123100000 migration, with the new
--    names added to each allowed list.
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
    'comment', 'comment_daily', 'like', 'bookmark', 'follow', 'publish',
    'design_save', 'collection_create', 'profile_update'
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
  IF p_action NOT IN ('guest_create', 'signup', 'login', 'feedback_visitor', 'resend_confirmation') THEN
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
