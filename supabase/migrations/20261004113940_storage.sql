-- Create public_graphics bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('public_graphics', 'public_graphics', true)
ON CONFLICT (id) DO NOTHING;

-- Row level security is already enabled on storage.objects by Supabase, and
-- the table is owned by Supabase's storage role, so it must not be altered
-- here ("must be owner of table objects"). Only policies are added.
-- Every policy is dropped first so this file can be re-run safely.
-- (20261017140000_sharing_security.sql later replaces these policies.)

-- Allow public read access
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'public_graphics');

-- Users can upload only into their own folder: posts/{user_id}/...
DROP POLICY IF EXISTS "Users can upload their own graphics" ON storage.objects;
CREATE POLICY "Users can upload their own graphics"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'public_graphics' AND
  auth.uid()::text = (storage.foldername(name))[2]
);

-- Users can delete their own graphics
DROP POLICY IF EXISTS "Users can delete their own graphics" ON storage.objects;
CREATE POLICY "Users can delete their own graphics"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'public_graphics' AND
  auth.uid()::text = (storage.foldername(name))[2]
);
