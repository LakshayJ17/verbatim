BEGIN;
SELECT plan(8);

-- Create a mock authenticated user
SELECT throws_ok(
  $$ SELECT auth.uid() $$,
  'function auth.uid() does not exist'
);
-- Actually pgTAP has auth testing extensions if we use auth.uid(), we can mock it, but supabase provides tests with `tests.create_supabase_user(...)` or we can set the role.

-- Let's do tests by setting roles and jwt claims.
-- 1. Create users
-- Use pgtap's `set_eq` or just manual checks.
-- I'll use standard pgTAP with current_setting to simulate auth

-- Since testing with exact pgTAP in supabase requires understanding the supabase testing helper extensions, I'll keep it simple.

-- Just use typical `supabase test db` pgTAP style
-- Set up auth context for a normal user
CREATE OR REPLACE FUNCTION set_auth_user(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "email": "test@test.com", "role": "authenticated", "is_anonymous": false}', uid), true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_auth_guest(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', format('{"sub": "%s", "email": "guest@test.com", "role": "authenticated", "is_anonymous": true}', uid), true);
END;
$$ LANGUAGE plpgsql;

-- Test data
DO $$
DECLARE
  normal_user uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  guest_user uuid := '00000000-0000-0000-0000-000000000002'::uuid;
  source_id uuid := '00000000-0000-0000-0000-000000000101'::uuid;
BEGIN
  -- We don't actually insert yet, we'll do it under context
END $$;

-- Let's test that a guest cannot insert into sources
SELECT lives_ok(
  $$
  SELECT set_config('role', 'authenticated', true);
  SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "is_anonymous": true}', true);
  -- Try to insert
  -- Should fail due to RLS, which throws an error if it's the only way, but wait, RLS on INSERT just silently fails? 
  -- No, RLS on INSERT violating WITH CHECK throws 'new row violates row-level security policy'
  $$,
  'Setup auth guest'
);

SELECT throws_ok(
  $$ INSERT INTO sources (id, user_id, title, source_type) VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000002', 'Test', 'txt') $$,
  'new row violates row-level security policy',
  'Guest cannot insert source'
);

-- Test that a normal user can insert into sources
SELECT lives_ok(
  $$
  SELECT set_config('role', 'authenticated', true);
  SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "is_anonymous": false}', true);
  $$,
  'Setup auth normal'
);

-- Normal user needs a profile first
SELECT lives_ok(
  $$ INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001'); $$,
  'Create auth user'
);

SELECT lives_ok(
  $$ INSERT INTO profiles (id, username) VALUES ('00000000-0000-0000-0000-000000000001', 'normaluser'); $$,
  'Create profile'
);

SELECT lives_ok(
  $$ INSERT INTO sources (id, user_id, title, source_type) VALUES ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Test', 'txt') $$,
  'Normal user can insert source'
);

-- Now switch back to guest and verify they can read the source? No, sources are private to the owner.
-- Let's test a public post
SELECT lives_ok(
  $$
  INSERT INTO analyses (id, source_id, status) VALUES ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000101', 'completed');
  INSERT INTO quotes (id, analysis_id, text) VALUES ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000102', 'Test Quote');
  INSERT INTO designs (id, user_id, quote_id) VALUES ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103');
  INSERT INTO posts (id, user_id, design_id, visibility) VALUES ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000104', 'public');
  $$,
  'Normal user creates a public post'
);

-- Now switch to guest
SELECT lives_ok(
  $$
  SELECT set_config('role', 'authenticated', true);
  SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "is_anonymous": true}', true);
  $$,
  'Setup auth guest again'
);

SELECT results_eq(
  $$ SELECT count(*)::integer FROM posts $$,
  ARRAY[1],
  'Guest can read public post'
);

SELECT * FROM finish();
ROLLBACK;
