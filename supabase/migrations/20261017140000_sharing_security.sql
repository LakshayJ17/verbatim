-- Sharing and publishing hardening.
--
-- The server actions in app/actions/publish.ts already check ownership, the
-- verified-quote rule and storage paths. The browser also holds a Supabase
-- session, though, and can call PostgREST and Storage directly, skipping those
-- actions. This migration moves the important rules into the database so they
-- hold no matter which client makes the request.
--
-- Every statement is idempotent: safe to run more than once.

------------------------------------------------------------------------------
-- 0. Helper: the role of the current API request.
--    'authenticated' / 'anon' for browser and server-action requests made with
--    a user session, 'service_role' for the admin client, NULL for direct SQL
--    (migrations, dashboard). Rules below only restrict end-user requests.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_role()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
$$;

------------------------------------------------------------------------------
-- 1. Storage bucket public_graphics: PNG only, 10 MB max.
--    Matches MAX_GRAPHIC_BYTES in app/actions/publish.ts.
------------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/png']
WHERE id = 'public_graphics';

------------------------------------------------------------------------------
-- 2. Storage policies for public_graphics.
--
--    "Public Read Access" allowed SELECT on every object in the bucket, which
--    lets anyone list the whole bucket through the Storage API, including the
--    images of unlisted posts. A public bucket serves files at their public
--    URL without any SELECT policy, so the broad policy is not needed for
--    images to load. It is replaced by an owner-only policy: owners need
--    SELECT to list their folder (finalizePublication checks the upload
--    exists) and to delete objects.
--
--    Uploads and deletes are limited to posts/{auth.uid()}/*.png for signed-in,
--    non-guest users. There is no UPDATE policy, so objects can't be
--    overwritten in place.
------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own graphics" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own graphics" ON storage.objects;
DROP POLICY IF EXISTS "public_graphics: owners read own folder" ON storage.objects;
DROP POLICY IF EXISTS "public_graphics: owners upload png to own folder" ON storage.objects;
DROP POLICY IF EXISTS "public_graphics: owners delete own files" ON storage.objects;

CREATE POLICY "public_graphics: owners read own folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'public_graphics'
  AND (storage.foldername(name))[1] = 'posts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "public_graphics: owners upload png to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'public_graphics'
  AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false'
  AND (storage.foldername(name))[1] = 'posts'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND array_length(storage.foldername(name), 1) = 2
  AND lower(storage.extension(name)) = 'png'
);

CREATE POLICY "public_graphics: owners delete own files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'public_graphics'
  AND (storage.foldername(name))[1] = 'posts'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

------------------------------------------------------------------------------
-- 3. Quotes: users can't change their own verification result.
--    Publishing depends on verification_status = 'verified'. The "Owner
--    access" policy is FOR ALL, so without this a user could PATCH their quote
--    to 'verified' (or edit its text after it was verified) through the API.
--    Service-role and direct SQL updates are still allowed.
--
--    NOT covered here: quotes are inserted by app/actions/analysis.ts with the
--    user's own session, so a crafted INSERT can still claim 'verified'.
--    Closing that needs analysis.ts to insert with the service role, after
--    which an INSERT policy can deny end-user inserts. See the report.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_quote_verification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.request_role() IN ('authenticated', 'anon')
     AND (
       NEW.verification_status IS DISTINCT FROM OLD.verification_status
       OR NEW.text IS DISTINCT FROM OLD.text
       OR NEW.speaker_name IS DISTINCT FROM OLD.speaker_name
       OR NEW.speaker IS DISTINCT FROM OLD.speaker
       OR NEW.analysis_id IS DISTINCT FROM OLD.analysis_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
     ) THEN
    RAISE EXCEPTION 'Quote text and verification status are read-only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_quote_verification ON quotes;
CREATE TRIGGER lock_quote_verification
BEFORE UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION public.lock_quote_verification();

------------------------------------------------------------------------------
-- 4. Posts: 'public' and 'unlisted' posts need a verified quote (insights are
--    allowed) and must belong to the design's owner. 'private' is always
--    allowed so users can always take a post down.
--    SECURITY DEFINER so the lookup works regardless of the caller's RLS view;
--    it only reads the rows referenced by NEW.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_post_publish_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  d_user uuid;
  d_quote uuid;
  q_status text;
BEGIN
  IF NEW.visibility NOT IN ('public', 'unlisted') THEN
    RETURN NEW;
  END IF;

  SELECT user_id, quote_id INTO d_user, d_quote FROM designs WHERE id = NEW.design_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Design not found' USING ERRCODE = '23503';
  END IF;
  IF d_user IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'You can only publish your own designs' USING ERRCODE = '42501';
  END IF;

  IF d_quote IS NOT NULL THEN
    SELECT verification_status INTO q_status FROM quotes WHERE id = d_quote;
    IF q_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'Only verified quotes can be published' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_post_publish_rules() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_post_publish_rules ON posts;
CREATE TRIGGER enforce_post_publish_rules
BEFORE INSERT OR UPDATE OF visibility, design_id, user_id ON posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_post_publish_rules();

------------------------------------------------------------------------------
-- 5. Designs: rendered_image_url may only point at the owner's own folder in
--    public_graphics. Otherwise a user could PATCH it to any URL and have it
--    shown in Discover and in link previews.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_design_image_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.rendered_image_url IS NOT NULL
     AND public.request_role() IN ('authenticated', 'anon')
     AND NEW.rendered_image_url !~ (
       '^https?://[^/]+/storage/v1/object/public/public_graphics/posts/'
       || NEW.user_id::text
       || '/[A-Za-z0-9_-]+\.png$'
     ) THEN
    RAISE EXCEPTION 'Invalid design image URL' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_design_image_url ON designs;
CREATE TRIGGER enforce_design_image_url
BEFORE INSERT OR UPDATE OF rendered_image_url, user_id ON designs
FOR EACH ROW EXECUTE FUNCTION public.enforce_design_image_url();

------------------------------------------------------------------------------
-- 6. Profiles: avatar_url is copied from OAuth user_metadata, which a user can
--    set to anything through auth.updateUser(). Keep only https Google avatar
--    URLs (the only avatar host allowed in next.config.ts images and CSP);
--    anything else is cleared rather than rejected, so sign-up never fails.
--    If avatar uploads are added later, extend the allowlist here.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanitize_profile_avatar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.avatar_url IS NOT NULL
     AND (
       char_length(NEW.avatar_url) > 2048
       OR NEW.avatar_url !~ '^https://lh3\.googleusercontent\.com/[A-Za-z0-9/_=.%~+-]*(\?[A-Za-z0-9/_=.%~+&-]*)?$'
     ) THEN
    NEW.avatar_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_profile_avatar ON profiles;
CREATE TRIGGER sanitize_profile_avatar
BEFORE INSERT OR UPDATE OF avatar_url ON profiles
FOR EACH ROW EXECUTE FUNCTION public.sanitize_profile_avatar();

------------------------------------------------------------------------------
-- 7. Length limits that match the server actions. NOT VALID so existing rows
--    are not re-checked; new and updated rows are.
------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_content_length') THEN
    ALTER TABLE comments
      ADD CONSTRAINT comments_content_length
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 500) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_caption_length') THEN
    ALTER TABLE posts
      ADD CONSTRAINT posts_caption_length
      CHECK (caption IS NULL OR char_length(caption) <= 2200) NOT VALID;
  END IF;
END;
$$;

------------------------------------------------------------------------------
-- 8. Unlisted posts.
--    Intentionally unchanged: the posts "Public read" policy still only covers
--    visibility = 'public'. Widening it to 'unlisted' would let anyone list
--    every unlisted post through the API. The post page
--    (app/(app)/discover/[id]/page.tsx) loads an unlisted post by exact id
--    with the service role instead.
--
--    One post per design, so finalizePublication's upsert-by-design is safe
--    under concurrent requests.
------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS posts_design_id_unique ON posts(design_id);
