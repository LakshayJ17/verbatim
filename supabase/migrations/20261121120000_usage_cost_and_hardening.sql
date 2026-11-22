-- Reliability, integrity, usage/cost tracking and the admin usage dashboard.
--
-- Run in the Supabase SQL Editor (runs as `postgres`), after all earlier
-- migrations. Idempotent: safe to run more than once.
--
--  1. Profiles are created by a trigger on auth.users, and missing ones are
--     backfilled. (Sign-up could fail to create a profile, after which every
--     insert by that user failed on its foreign key.)
--  2. Sources, transcripts and analyses are written by the server only.
--     Quote verification trusts transcripts, so a user who could insert one
--     could get an invented quote marked 'verified'; a user who could edit a
--     source could point it at a 10-hour video after preflight.
--  3. claim_analysis(): one analysis per source, one run at a time.
--  4. public_post_sources(): source title/link/categories for public posts
--     (they were invisible to everyone but the author).
--  5. usage_events, ai_usage: what users do and what each AI call costs.
--  6. analysis_cache, transcript_cache: one AI call / one transcript fetch
--     per video, shared across users.
--  7. Admin aggregate functions for /admin/usage (service role only).
--
-- NOTE: no UNIQUE constraint is added on analyses.source_id or
-- transcripts.source_id. PostgREST would then treat the relation as
-- one-to-one and return an object instead of an array, changing the shape
-- every page reads. claim_analysis() prevents duplicates instead.

------------------------------------------------------------------------------
-- 1. Profiles for every auth user
------------------------------------------------------------------------------

-- Lowercase ASCII slug, 3..20 chars (mirrors baseUsername() in utils/auth/username.ts).
CREATE OR REPLACE FUNCTION public.make_username(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN length(s) >= 3 THEN s
    WHEN s = '' THEN 'user'
    ELSE left('user_' || s, 20)
  END
  FROM (
    SELECT rtrim(left(btrim(regexp_replace(lower(coalesce(split_part(p_input, '@', 1), '')), '[^a-z0-9]+', '_', 'g'), '_'), 20), '_') AS s
  ) t
$$;

CREATE OR REPLACE FUNCTION public.create_profile_for_user(
  p_id uuid,
  p_email text,
  p_meta jsonb,
  p_anonymous boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  meta jsonb := coalesce(p_meta, '{}'::jsonb);
  anon boolean := coalesce(p_anonymous, false);
  full_name text;
  base text;
  candidate text;
  attempt int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id) THEN
    RETURN;
  END IF;

  full_name := left(coalesce(nullif(meta->>'full_name', ''), nullif(meta->>'name', ''), CASE WHEN anon THEN 'Guest User' ELSE '' END), 100);
  base := CASE WHEN anon THEN 'guest' ELSE public.make_username(coalesce(
    nullif(meta->>'user_name', ''),
    nullif(meta->>'preferred_username', ''),
    nullif(full_name, ''),
    p_email
  )) END;

  LOOP
    candidate := CASE
      WHEN anon THEN 'guest_' || substr(replace(p_id::text, '-', ''), 1, 8 + attempt * 2)
      ELSE left(base || '_' || lpad(floor(random() * (CASE WHEN attempt < 3 THEN 10000 ELSE 1000000 END))::int::text, CASE WHEN attempt < 3 THEN 4 ELSE 6 END, '0'), 30)
    END;
    BEGIN
      INSERT INTO public.profiles (id, username, full_name, avatar_url)
      VALUES (p_id, candidate, full_name, meta->>'avatar_url')
      ON CONFLICT (id) DO NOTHING;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt >= 8 THEN
        RETURN; -- the app's ensureProfile() repairs it on first use
      END IF;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_for_user(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  BEGIN
    PERFORM public.create_profile_for_user(NEW.id, NEW.email, NEW.raw_user_meta_data, NEW.is_anonymous);
    IF NOT coalesce(NEW.is_anonymous, false) THEN
      INSERT INTO public.usage_events (user_id, event, properties)
      VALUES (NEW.id, 'signed_up', jsonb_build_object('via', 'trigger'));
    END IF;
  EXCEPTION WHEN others THEN
    -- A profile problem must never block sign-up.
    RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

------------------------------------------------------------------------------
-- 5. Usage tracking tables (created before the trigger that writes to them)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.usage_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event TEXT NOT NULL CHECK (char_length(event) BETWEEN 1 AND 64),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usage_events_created_idx ON public.usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_event_created_idx ON public.usage_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_user_created_idx ON public.usage_events (user_id, created_at DESC);
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
-- No policies: written and read with the service role only.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'gemini',
  model TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('transcript', 'video')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'cache_hit')),
  error_code TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  audio_prompt_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  thoughts_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  finish_reason TEXT,
  transcript_calls INTEGER NOT NULL DEFAULT 0,
  injection_flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON public.ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON public.ai_usage (user_id, created_at DESC);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: every existing auth user gets a profile.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id, u.email, u.raw_user_meta_data, u.is_anonymous
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  LOOP
    PERFORM public.create_profile_for_user(r.id, r.email, r.raw_user_meta_data, r.is_anonymous);
  END LOOP;
END;
$$;

------------------------------------------------------------------------------
-- 6. Shared caches (service role only)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.transcript_cache (
  external_id TEXT PRIMARY KEY CHECK (char_length(external_id) BETWEEN 1 AND 64),
  language TEXT,
  segments JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.transcript_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analysis_cache (
  external_id TEXT NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 64),
  mode TEXT NOT NULL CHECK (mode IN ('transcript', 'video')),
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (external_id, mode, model, prompt_version)
);
ALTER TABLE public.analysis_cache ENABLE ROW LEVEL SECURITY;

------------------------------------------------------------------------------
-- 2. Server-only writes for sources, transcripts and analyses.
--    Owners keep SELECT and DELETE (deleting a source cascades as before).
------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner access" ON public.sources;
DROP POLICY IF EXISTS "Owner read" ON public.sources;
DROP POLICY IF EXISTS "Owner delete" ON public.sources;
CREATE POLICY "Owner read" ON public.sources FOR SELECT USING (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);
CREATE POLICY "Owner delete" ON public.sources FOR DELETE USING (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
);

DROP POLICY IF EXISTS "Owner access" ON public.transcripts;
DROP POLICY IF EXISTS "Owner read" ON public.transcripts;
DROP POLICY IF EXISTS "Owner delete" ON public.transcripts;
CREATE POLICY "Owner read" ON public.transcripts FOR SELECT USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM public.sources WHERE sources.id = transcripts.source_id AND sources.user_id = auth.uid())
);
CREATE POLICY "Owner delete" ON public.transcripts FOR DELETE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM public.sources WHERE sources.id = transcripts.source_id AND sources.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owner access" ON public.analyses;
DROP POLICY IF EXISTS "Owner read" ON public.analyses;
DROP POLICY IF EXISTS "Owner delete" ON public.analyses;
CREATE POLICY "Owner read" ON public.analyses FOR SELECT USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM public.sources WHERE sources.id = analyses.source_id AND sources.user_id = auth.uid())
);
CREATE POLICY "Owner delete" ON public.analyses FOR DELETE USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM public.sources WHERE sources.id = analyses.source_id AND sources.user_id = auth.uid())
);

-- Transcripts used to be stored as a JSON-encoded string; store arrays.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, normalized_segments #>> '{}' AS raw FROM public.transcripts WHERE jsonb_typeof(normalized_segments) = 'string' LOOP
    BEGIN
      UPDATE public.transcripts SET normalized_segments = r.raw::jsonb WHERE id = r.id;
    EXCEPTION WHEN others THEN
      NULL; -- leave unparseable rows; the app reads both shapes
    END;
  END LOOP;
END;
$$;

------------------------------------------------------------------------------
-- 3. claim_analysis(source_id, stale_seconds) -> analysis id, or NULL when
--    the source already has a completed analysis or a run in progress.
--    Only the source's owner (non-guest) may call it.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_analysis(p_source_id uuid, p_stale_seconds integer DEFAULT 600)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  uid uuid := auth.uid();
  a record;
  new_id uuid;
BEGIN
  IF uid IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'true' THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sources WHERE id = p_source_id AND user_id = uid) THEN
    RAISE EXCEPTION 'Source not found' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('claim_analysis:' || p_source_id::text));

  SELECT id, status, updated_at INTO a
  FROM public.analyses
  WHERE source_id = p_source_id
  ORDER BY (status = 'completed') DESC, (status = 'processing') DESC, updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.analyses (source_id, status) VALUES (p_source_id, 'processing') RETURNING id INTO new_id;
    RETURN new_id;
  END IF;

  IF a.status = 'completed' THEN
    RETURN NULL;
  END IF;
  IF a.status = 'processing' AND a.updated_at > NOW() - make_interval(secs => greatest(p_stale_seconds, 60)) THEN
    RETURN NULL;
  END IF;

  UPDATE public.analyses SET status = 'processing', updated_at = NOW() WHERE id = a.id;
  RETURN a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_analysis(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_analysis(uuid, integer) TO authenticated;

------------------------------------------------------------------------------
-- 4. public_post_sources(post_ids) -> the video details behind public posts
--    (and unlisted posts asked for by exact id, like get_unlisted_post()).
--    Only title, channel, link and categories: never the analysis itself.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.public_post_sources(p_post_ids uuid[])
RETURNS TABLE (post_id uuid, title text, creator_name text, source_url text, categories text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, s.title, s.creator_name, s.source_url, s.categories
  FROM public.posts p
  JOIN public.designs d ON d.id = p.design_id
  LEFT JOIN public.quotes q ON q.id = d.quote_id
  LEFT JOIN public.insights i ON i.id = d.insight_id
  JOIN public.analyses a ON a.id = coalesce(q.analysis_id, i.analysis_id)
  JOIN public.sources s ON s.id = a.source_id
  WHERE p.id = ANY (p_post_ids[1:200])
    AND p.visibility IN ('public', 'unlisted')
$$;

REVOKE ALL ON FUNCTION public.public_post_sources(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_post_sources(uuid[]) TO anon, authenticated;

------------------------------------------------------------------------------
-- 7. Spend and admin aggregates (service role only)
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ai_spend_since(p_since timestamptz, p_user uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(sum(estimated_cost_usd), 0)
  FROM public.ai_usage
  WHERE created_at >= p_since
    AND (p_user IS NULL OR user_id = p_user)
$$;

REVOKE ALL ON FUNCTION public.ai_spend_since(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_since(timestamptz, uuid) TO service_role;

-- One row per UTC day for the last p_days days (including days with no activity).
CREATE OR REPLACE FUNCTION public.admin_usage_daily(p_days integer DEFAULT 30)
RETURNS TABLE (
  day date,
  new_users integer,
  active_users integer,
  sources_added integer,
  analyses_completed integer,
  analyses_failed integer,
  cache_hits integer,
  cost_usd numeric,
  downloads integer,
  posts_published integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH days AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'utc')::date - (least(greatest(p_days, 1), 365) - 1),
      (now() AT TIME ZONE 'utc')::date,
      interval '1 day'
    )::date AS day
  ),
  ev AS (
    SELECT (created_at AT TIME ZONE 'utc')::date AS day, event, user_id
    FROM public.usage_events
    WHERE created_at >= (now() AT TIME ZONE 'utc')::date - least(greatest(p_days, 1), 365)
  ),
  ai AS (
    SELECT (created_at AT TIME ZONE 'utc')::date AS day, status, estimated_cost_usd
    FROM public.ai_usage
    WHERE created_at >= (now() AT TIME ZONE 'utc')::date - least(greatest(p_days, 1), 365)
  )
  SELECT
    d.day,
    (SELECT count(*) FROM public.profiles pr WHERE (pr.created_at AT TIME ZONE 'utc')::date = d.day AND pr.username NOT LIKE 'guest\_%')::int,
    (SELECT count(DISTINCT user_id) FROM ev WHERE ev.day = d.day AND user_id IS NOT NULL)::int,
    (SELECT count(*) FROM ev WHERE ev.day = d.day AND event = 'source_added')::int,
    (SELECT count(*) FROM ai WHERE ai.day = d.day AND status IN ('success', 'cache_hit'))::int,
    (SELECT count(*) FROM ai WHERE ai.day = d.day AND status = 'error')::int,
    (SELECT count(*) FROM ai WHERE ai.day = d.day AND status = 'cache_hit')::int,
    (SELECT coalesce(sum(estimated_cost_usd), 0) FROM ai WHERE ai.day = d.day),
    (SELECT count(*) FROM ev WHERE ev.day = d.day AND event IN ('image_downloaded', 'image_shared'))::int,
    (SELECT count(*) FROM ev WHERE ev.day = d.day AND event = 'post_published')::int
  FROM days d
  ORDER BY d.day
$$;

REVOKE ALL ON FUNCTION public.admin_usage_daily(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_daily(integer) TO service_role;

-- Headline numbers, funnel, cost breakdowns and quality for the last p_days.
CREATE OR REPLACE FUNCTION public.admin_usage_summary(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH since AS (SELECT now() - make_interval(days => least(greatest(p_days, 1), 365)) AS t),
  ev AS (SELECT * FROM public.usage_events, since WHERE created_at >= since.t),
  ai AS (SELECT * FROM public.ai_usage, since WHERE created_at >= since.t),
  completed AS (
    SELECT (properties->>'quotes')::int AS quotes,
           (properties->>'verified')::int AS verified,
           (properties->>'needs_review')::int AS needs_review,
           (properties->>'rejected')::int AS rejected,
           (properties->>'source_derived')::int AS source_derived,
           (properties->>'insights')::int AS insights
    FROM ev WHERE event = 'analysis_completed'
  )
  SELECT jsonb_build_object(
    'days', least(greatest(p_days, 1), 365),
    'users_total', (SELECT count(*) FROM public.profiles WHERE username NOT LIKE 'guest\_%'),
    'new_users', (SELECT count(*) FROM public.profiles, since WHERE created_at >= since.t AND username NOT LIKE 'guest\_%'),
    'active_users', (SELECT count(DISTINCT user_id) FROM ev WHERE user_id IS NOT NULL),
    'active_users_7d', (SELECT count(DISTINCT user_id) FROM public.usage_events WHERE user_id IS NOT NULL AND created_at >= now() - interval '7 days'),
    'funnel', jsonb_build_object(
      'signed_up', (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'signed_up'),
      'added_video', (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'source_added'),
      'got_quotes', (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'analysis_completed'),
      'used_image', (SELECT count(DISTINCT user_id) FROM ev WHERE event IN ('image_downloaded', 'image_shared', 'design_saved')),
      'published', (SELECT count(DISTINCT user_id) FROM ev WHERE event = 'post_published')
    ),
    'value', jsonb_build_object(
      'sources_added', (SELECT count(*) FROM ev WHERE event = 'source_added'),
      'analyses_completed', (SELECT count(*) FROM completed),
      'quotes_generated', (SELECT coalesce(sum(quotes), 0) FROM completed),
      'quotes_verified', (SELECT coalesce(sum(verified), 0) FROM completed),
      'quotes_needs_review', (SELECT coalesce(sum(needs_review), 0) FROM completed),
      'quotes_rejected', (SELECT coalesce(sum(rejected), 0) FROM completed),
      'quotes_unchecked', (SELECT coalesce(sum(source_derived), 0) FROM completed),
      'insights_generated', (SELECT coalesce(sum(insights), 0) FROM completed),
      'designs_saved', (SELECT count(*) FROM ev WHERE event = 'design_saved'),
      'images_downloaded', (SELECT count(*) FROM ev WHERE event = 'image_downloaded'),
      'images_shared', (SELECT count(*) FROM ev WHERE event = 'image_shared'),
      'posts_published', (SELECT count(*) FROM ev WHERE event = 'post_published'),
      'likes', (SELECT count(*) FROM ev WHERE event = 'post_liked'),
      'comments', (SELECT count(*) FROM ev WHERE event = 'comment_added'),
      'transcripts_fetched', (SELECT count(*) FROM ev WHERE event = 'transcript_fetched'),
      'transcripts_from_cache', (SELECT count(*) FROM ev WHERE event = 'transcript_fetched' AND (properties->>'from_cache')::boolean),
      'transcripts_unavailable', (SELECT count(*) FROM ev WHERE event = 'transcript_unavailable')
    ),
    'cost', jsonb_build_object(
      'total_usd', (SELECT coalesce(sum(estimated_cost_usd), 0) FROM ai),
      'today_usd', (SELECT coalesce(sum(estimated_cost_usd), 0) FROM public.ai_usage WHERE created_at >= (now() AT TIME ZONE 'utc')::date),
      'calls', (SELECT count(*) FROM ai WHERE status <> 'cache_hit'),
      'cache_hits', (SELECT count(*) FROM ai WHERE status = 'cache_hit'),
      'failures', (SELECT count(*) FROM ai WHERE status = 'error'),
      'prompt_tokens', (SELECT coalesce(sum(prompt_tokens), 0) FROM ai),
      'output_tokens', (SELECT coalesce(sum(output_tokens + thoughts_tokens), 0) FROM ai),
      'transcript_calls', (SELECT coalesce(sum(transcript_calls), 0) FROM ai),
      'by_mode', coalesce((
        SELECT jsonb_object_agg(mode, jsonb_build_object('runs', runs, 'cost_usd', cost, 'avg_cost_usd', avg_cost, 'avg_ms', avg_ms))
        FROM (
          SELECT mode, count(*) AS runs, sum(estimated_cost_usd) AS cost,
                 round(avg(estimated_cost_usd), 6) AS avg_cost, round(avg(duration_ms)) AS avg_ms
          FROM ai WHERE status = 'success' GROUP BY mode
        ) m
      ), '{}'::jsonb),
      'by_model', coalesce((
        SELECT jsonb_object_agg(model, jsonb_build_object('runs', runs, 'cost_usd', cost))
        FROM (SELECT model, count(*) AS runs, sum(estimated_cost_usd) AS cost FROM ai GROUP BY model) m
      ), '{}'::jsonb),
      'errors', coalesce((
        SELECT jsonb_object_agg(error_code, n)
        FROM (SELECT coalesce(error_code, 'UNKNOWN') AS error_code, count(*) AS n FROM ai WHERE status = 'error' GROUP BY 1) e
      ), '{}'::jsonb)
    ),
    'safety', jsonb_build_object(
      'flagged_runs', (SELECT count(*) FROM ai WHERE cardinality(injection_flags) > 0),
      'flags', coalesce((
        SELECT jsonb_object_agg(flag, n)
        FROM (SELECT unnest(injection_flags) AS flag, count(*) AS n FROM ai GROUP BY 1) f
      ), '{}'::jsonb)
    )
  )
$$;

REVOKE ALL ON FUNCTION public.admin_usage_summary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usage_summary(integer) TO service_role;

-- Heaviest users by AI spend (abuse and power-user view).
CREATE OR REPLACE FUNCTION public.admin_top_users(p_days integer DEFAULT 30, p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id uuid,
  username text,
  analyses integer,
  failures integer,
  cost_usd numeric,
  images integer,
  posts integer,
  last_active timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH since AS (SELECT now() - make_interval(days => least(greatest(p_days, 1), 365)) AS t),
  spend AS (
    SELECT a.user_id,
           count(*) FILTER (WHERE a.status IN ('success', 'cache_hit'))::int AS analyses,
           count(*) FILTER (WHERE a.status = 'error')::int AS failures,
           sum(a.estimated_cost_usd) AS cost_usd
    FROM public.ai_usage a, since
    WHERE a.created_at >= since.t AND a.user_id IS NOT NULL
    GROUP BY a.user_id
  ),
  ev AS (
    SELECT e.user_id,
           count(*) FILTER (WHERE e.event IN ('image_downloaded', 'image_shared'))::int AS images,
           count(*) FILTER (WHERE e.event = 'post_published')::int AS posts,
           max(e.created_at) AS last_active
    FROM public.usage_events e, since
    WHERE e.created_at >= since.t AND e.user_id IS NOT NULL
    GROUP BY e.user_id
  )
  SELECT s.user_id, p.username, s.analyses, s.failures, s.cost_usd,
         coalesce(ev.images, 0), coalesce(ev.posts, 0), ev.last_active
  FROM spend s
  LEFT JOIN ev ON ev.user_id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.cost_usd DESC NULLS LAST
  LIMIT least(greatest(p_limit, 1), 100)
$$;

REVOKE ALL ON FUNCTION public.admin_top_users(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_top_users(integer, integer) TO service_role;
