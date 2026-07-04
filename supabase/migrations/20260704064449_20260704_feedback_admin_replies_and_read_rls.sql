/*
# Feedback & Support: admin replies + read-own RLS

1. Purpose
   Extends the existing `feedback` table so the site owner can reply to feedback
   inside the app, and the submitting user can see that reply in their Profile.
   Also tightens RLS so users can read ONLY their own feedback (and its admin
   reply), while an admin (profiles.is_admin = true) can read all feedback and
   post replies. Adds a dedicated reply route to the new send-feedback edge
   function.

2. Changes to `feedback` table
   - ADD `admin_reply` text NULLABLE — the owner's reply text (max 2000 chars)
   - ADD `admin_reply_created_at` timestamptz NULLABLE — when the reply was posted
   - ADD CHECK constraint: admin_reply length <= 2000 when not null
   - Keep existing constraints (message 1..2000, type/status enums)

3. Security (RLS) — replaces the insert-only policy with a full CRUD set
   - SELECT: authenticated users can read rows where user_id = auth.uid()
     (their own feedback). Anonymous (user_id IS NULL) feedback is NOT readable
     by anyone via the client — only via the service role. Admins
     (profiles.is_admin) can read ALL rows.
   - INSERT: anon + authenticated may insert (the edge function is the real
     gatekeeper; direct client inserts are still allowed but the function
     enforces rate limits + sanitization).
   - UPDATE: ONLY admins may update (to post replies). Users cannot update
     their own feedback or replies. (The edge function uses the service role
     and bypasses RLS, so this policy guards the rare direct-client path.)
   - DELETE: ONLY admins may delete.
   Admin detection uses a SECURITY DEFINER helper `is_admin()` in the `internal`
   schema (private) to avoid RLS recursion on profiles.

4. New helper
   - `internal.is_admin()` returns boolean — true if the current auth user's
     profiles.is_admin is true. SECURITY DEFINER, in private `internal` schema
     so it cannot be called directly by anon and does not recurse.

5. Notes
   - No file uploads, no Storage usage — feedback stays text-only.
   - No private planner/chat/room data is stored in feedback.
   - The edge function (service role) reads/writes feedback + rate limits
     regardless of RLS; these policies govern direct client access only.
*/

-- ── Add admin reply columns ──
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS admin_reply text;
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS admin_reply_created_at timestamptz;

-- Length cap on admin reply (matches the 2000-char limit enforced in the edge function).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feedback_admin_reply_length'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT feedback_admin_reply_length
      CHECK (admin_reply IS NULL OR char_length(admin_reply) BETWEEN 1 AND 2000);
  END IF;
END $$;

-- ── Admin detection helper (private schema, SECURITY DEFINER) ──
CREATE SCHEMA IF NOT EXISTS internal;

-- Re-define the helper if it already exists from a prior migration.
DROP FUNCTION IF EXISTS internal.is_admin() CASCADE;
CREATE FUNCTION internal.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
  );
$$;

REVOKE EXECUTE ON FUNCTION internal.is_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION internal.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION internal.is_admin() TO authenticated;

-- ── Replace RLS policies on feedback ──
-- Drop the old insert-only policy and any stale policies, then recreate the
-- full CRUD set with ownership + admin scoping.

DROP POLICY IF EXISTS "insert_feedback" ON feedback;
DROP POLICY IF EXISTS "select_own_feedback" ON feedback;
DROP POLICY IF EXISTS "select_feedback_admin" ON feedback;
DROP POLICY IF EXISTS "update_feedback_admin" ON feedback;
DROP POLICY IF EXISTS "delete_feedback_admin" ON feedback;

-- Users can read their own feedback (and its admin reply). Admins read all.
CREATE POLICY "select_own_feedback"
  ON feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR internal.is_admin());

-- Anyone (anon + authenticated) may insert. The edge function is the real
-- gatekeeper for rate limits + sanitization; direct inserts are harmless
-- because the table has no sensitive columns and no public read.
CREATE POLICY "insert_feedback"
  ON feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins may update (to post replies). Users cannot edit feedback.
CREATE POLICY "update_feedback_admin"
  ON feedback FOR UPDATE
  TO authenticated
  USING (internal.is_admin())
  WITH CHECK (internal.is_admin());

-- Only admins may delete.
CREATE POLICY "delete_feedback_admin"
  ON feedback FOR DELETE
  TO authenticated
  USING (internal.is_admin());
