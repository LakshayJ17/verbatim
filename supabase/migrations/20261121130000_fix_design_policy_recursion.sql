-- Fix: saving a design and publishing a post always failed with
--   42P17 infinite recursion detected in policy for relation "designs" / "posts"
--
-- Two policy cycles:
--   designs WITH CHECK reads quotes/insights, whose "Public read" reads designs.
--   posts   WITH CHECK reads designs, whose "Public read" reads posts.
-- The ownership checks now run in SECURITY DEFINER functions, which read the
-- tables without re-entering their policies. The rules are unchanged: a design
-- needs a quote or insight from the user's own source, a post needs the
-- user's own design, and guests can do neither.
--
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.owns_quote(p_quote_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quotes q
    JOIN public.analyses a ON a.id = q.analysis_id
    JOIN public.sources s ON s.id = a.source_id
    WHERE q.id = p_quote_id AND s.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_insight(p_insight_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.insights i
    JOIN public.analyses a ON a.id = i.analysis_id
    JOIN public.sources s ON s.id = a.source_id
    WHERE i.id = p_insight_id AND s.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_design(p_design_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.designs d WHERE d.id = p_design_id AND d.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.owns_quote(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_insight(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_quote(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_insight(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.owns_design(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_design(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owner access" ON public.designs;
CREATE POLICY "Owner access" ON public.designs FOR ALL
USING (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  (
    (quote_id IS NOT NULL AND public.owns_quote(quote_id))
    OR
    (insight_id IS NOT NULL AND public.owns_insight(insight_id))
  )
);

DROP POLICY IF EXISTS "Owner access" ON public.posts;
CREATE POLICY "Owner access" ON public.posts FOR ALL
USING (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
)
WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  public.owns_design(design_id)
);
