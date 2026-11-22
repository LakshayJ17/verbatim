-- Admin area, moderation reports and least-privilege account deletion.
--
-- Run in the Supabase SQL Editor (runs as `postgres`). Every statement is
-- idempotent: safe to run more than once. Nothing here alters tables owned by
-- Supabase (auth.*, storage.*); it only reads/deletes rows and adds functions,
-- tables and policies in the public schema.
--
-- MAKING YOURSELF ADMIN
--   Admin = an auth user whose app_metadata has role = 'admin'. Users cannot
--   edit app_metadata themselves (only user_metadata), so this is safe. Run
--   once in the SQL Editor, replacing OWNER_EMAIL:
--
--     update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"admin"}' where email = 'OWNER_EMAIL';
--
--   Then sign out and sign in again so a new JWT carrying the role is issued.
--   To remove admin: update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where email = 'OWNER_EMAIL';

------------------------------------------------------------------------------
-- 1. is_admin(): true when the caller's JWT carries app_metadata.role = 'admin'.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

------------------------------------------------------------------------------
-- 2. Self-service account deletion without the service role key.
--
--    Deleting the auth.users row cascades through the schema:
--      auth.users -> profiles (ON DELETE CASCADE)
--      profiles -> sources, designs, posts, likes, bookmarks, comments,
--                  follows, collections (ON DELETE CASCADE)
--      sources -> transcripts, analyses -> quotes, insights (CASCADE)
--      quotes.user_id / insights.user_id -> profiles (CASCADE)
--      designs/posts -> collection_items, likes, bookmarks, comments (CASCADE)
--      feedback.user_id, reports.reporter_id -> profiles (SET NULL, kept)
--    Storage objects are NOT covered by any FK cascade: the app deletes the
--    user's files in public_graphics/posts/{uid}/ first, with the user's own
--    session (see app/actions/settings.ts).
------------------------------------------------------------------------------
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

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

------------------------------------------------------------------------------
-- 3. Unlisted posts by exact id, without the service role key.
--
--    The posts "Public read" policy only covers visibility = 'public' so that
--    nobody can list unlisted posts. This function returns one unlisted post
--    (never private, never public: public posts use the normal RLS path) by
--    its exact id, with only the fields /discover/[id] renders, shaped like
--    the page's PostgREST select. Returns NULL when there is no such post.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unlisted_post(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'visibility', p.visibility,
    'user_id', p.user_id,
    'caption', p.caption,
    'created_at', p.created_at,
    'author', jsonb_build_object(
      'username', pr.username,
      'full_name', pr.full_name,
      'avatar_url', pr.avatar_url
    ),
    'design', jsonb_build_object(
      'rendered_image_url', d.rendered_image_url,
      'configuration', d.configuration,
      'quote', CASE WHEN q.id IS NULL THEN NULL ELSE jsonb_build_object(
        'text', q.text,
        'speaker_name', q.speaker_name,
        'analysis', jsonb_build_object('source', CASE WHEN qs.id IS NULL THEN NULL ELSE jsonb_build_object(
          'title', qs.title,
          'creator_name', qs.creator_name,
          'source_url', qs.source_url,
          'categories', qs.categories
        ) END)
      ) END,
      'insight', CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object(
        'summary', i.summary,
        'analysis', jsonb_build_object('source', CASE WHEN iso.id IS NULL THEN NULL ELSE jsonb_build_object(
          'title', iso.title,
          'creator_name', iso.creator_name,
          'source_url', iso.source_url,
          'categories', iso.categories
        ) END)
      ) END
    )
  )
  FROM public.posts p
  JOIN public.profiles pr ON pr.id = p.user_id
  JOIN public.designs d ON d.id = p.design_id
  LEFT JOIN public.quotes q ON q.id = d.quote_id
  LEFT JOIN public.analyses qa ON qa.id = q.analysis_id
  LEFT JOIN public.sources qs ON qs.id = qa.source_id
  LEFT JOIN public.insights i ON i.id = d.insight_id
  LEFT JOIN public.analyses ia ON ia.id = i.analysis_id
  LEFT JOIN public.sources iso ON iso.id = ia.source_id
  WHERE p.id = p_id
    AND p.visibility = 'unlisted'
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_unlisted_post(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unlisted_post(uuid) TO anon, authenticated;

------------------------------------------------------------------------------
-- 4. Reports: users flag posts and comments for review.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'spam', 'harassment', 'hate', 'sexual', 'violence',
    'misinformation', 'copyright', 'impersonation', 'other'
  )),
  details TEXT CHECK (details IS NULL OR char_length(details) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_unique_per_reporter UNIQUE (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS reports_status_created_idx ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_target_idx ON public.reports(target_type, target_id);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports: members insert own" ON public.reports;
DROP POLICY IF EXISTS "reports: read own" ON public.reports;
DROP POLICY IF EXISTS "reports: admins read all" ON public.reports;
DROP POLICY IF EXISTS "reports: admins update" ON public.reports;

CREATE POLICY "reports: members insert own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
    AND status = 'open'
    AND resolved_by IS NULL
    AND resolved_at IS NULL
  );

CREATE POLICY "reports: read own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

CREATE POLICY "reports: admins read all" ON public.reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "reports: admins update" ON public.reports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
-- No DELETE policy: users cannot delete reports.

------------------------------------------------------------------------------
-- 5. Feedback: admins can mark items handled.
------------------------------------------------------------------------------
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;

------------------------------------------------------------------------------
-- 6. Admin audit log. Written by admin server actions with the service role.
--    No FK on admin_id so history survives if the admin account is deleted.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_log: admins read" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log: admins read" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policies: only the service role writes rows.
