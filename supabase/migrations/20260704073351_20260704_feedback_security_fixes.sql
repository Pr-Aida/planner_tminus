/*
# Feedback & Support security fixes

1. Fix unsafe INSERT policy (WITH CHECK true -> auth.uid() = user_id)
2. Revoke EXECUTE on cleanup_old_feedback() from authenticated/anon/PUBLIC
   (only service_role can run it, via edge function or pg_cron)
3. Confirm SELECT/DELETE/UPDATE policies are strict (no changes needed —
   they already enforce user_id = auth.uid() or internal.is_admin())
*/

-- ── 1. Fix INSERT policy ──
DROP POLICY IF EXISTS "insert_feedback" ON public.feedback;
CREATE POLICY "insert_feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 2. Revoke EXECUTE on cleanup_old_feedback from all non-service roles ──
REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM authenticated;
-- service_role keeps EXECUTE (granted by default as owner-equivalent)
