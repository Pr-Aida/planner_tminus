/*
# Feedback & Support: user-side hide + 30-day auto-cleanup

1. Purpose
   - Let a user hide their own feedback from their Profile list (admin still sees it).
   - Auto-delete feedback older than 30 days to keep the table lightweight.
   No Storage, no file uploads — feedback stays text-only.

2. Schema change to `feedback`
   - ADD `user_hidden_at` timestamptz NULLABLE — when the user hid the item
     from their own profile. NULL = visible to the user. Admin ignores this.

3. RLS change
   - Users may UPDATE their own rows (to set user_hidden_at). Admins keep full
     UPDATE (replies + status) via the existing admin policy.
   - SELECT for users now excludes rows they've hidden (user_hidden_at IS NULL),
     so hidden items disappear from their list server-side, not just in the UI.

4. Cleanup
   - `cleanup_old_feedback()` SECURITY DEFINER function hard-deletes feedback
     rows older than 30 days. Scheduled daily via pg_cron when available.
*/

-- ── Add user_hidden_at column ──
ALTER TABLE feedback
  ADD COLUMN IF NOT EXISTS user_hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at);
CREATE INDEX IF NOT EXISTS feedback_user_hidden_idx ON feedback (user_id, user_hidden_at);

-- ── RLS: let users hide their own feedback; admins keep full update ──
DROP POLICY IF EXISTS "update_feedback_admin" ON feedback;
DROP POLICY IF EXISTS "update_feedback_user_hide" ON feedback;

-- Users can update their own rows (to set user_hidden_at).
CREATE POLICY "update_feedback_user_hide"
  ON feedback FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can update everything (replies + status).
CREATE POLICY "update_feedback_admin"
  ON feedback FOR UPDATE
  TO authenticated
  USING (internal.is_admin())
  WITH CHECK (internal.is_admin());

-- ── SELECT: users see their own non-hidden feedback; admins see all ──
DROP POLICY IF EXISTS "select_own_feedback" ON feedback;
CREATE POLICY "select_own_feedback"
  ON feedback FOR SELECT
  TO authenticated
  USING (
    (user_id = auth.uid() AND user_hidden_at IS NULL)
    OR internal.is_admin()
  );

-- ── Cleanup function: hard-delete feedback older than 30 days ──
CREATE OR REPLACE FUNCTION public.cleanup_old_feedback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM feedback
  WHERE created_at < (now() - interval '30 days');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_feedback() TO authenticated;

-- ── Schedule daily cleanup via pg_cron (if available) ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup_old_feedback_job');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup_old_feedback_job',
      '0 3 * * *',
      'SELECT public.cleanup_old_feedback();'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
