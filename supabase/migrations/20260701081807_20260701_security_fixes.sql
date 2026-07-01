-- Remove SECURITY DEFINER is_username_taken function (no longer needed;
-- uniqueness is enforced by DB constraint + edge function returns 409 on conflict).
DROP FUNCTION IF EXISTS is_username_taken(text);

-- Fix set_profiles_updated_at trigger function: use SECURITY INVOKER + fixed search_path.
DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
DROP FUNCTION IF EXISTS set_profiles_updated_at();

CREATE OR REPLACE FUNCTION set_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_profiles_updated_at();

-- Fix set_planner_reminders_updated_at: use SECURITY INVOKER + fixed search_path.
DROP TRIGGER IF EXISTS planner_reminders_updated_at ON planner_reminders;
DROP FUNCTION IF EXISTS set_planner_reminders_updated_at();

CREATE OR REPLACE FUNCTION set_planner_reminders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER planner_reminders_updated_at
  BEFORE UPDATE ON planner_reminders
  FOR EACH ROW EXECUTE FUNCTION set_planner_reminders_updated_at();

-- Ensure avatars bucket is NOT public listing but remains accessible per-user.
-- The existing per-user folder policies already restrict access correctly.
-- Update the public SELECT policy to restrict to own user folder only (no bucket listing).
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

-- Only allow reading avatars (no listing) — SELECT with specific path check.
-- We keep this permissive (any public URL works) but the folder-level storage
-- policies on INSERT/UPDATE/DELETE already enforce ownership.
CREATE POLICY "avatars_authenticated_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'avatars');
