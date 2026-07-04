/*
# Fix feedback_rate_limits RLS warning

The table has RLS enabled but no policies, which triggers Supabase's
"RLS Enabled No Policy" security audit warning. This table is used only
by the Edge Function (service role) for rate limiting — normal users
should never read or write it directly.

Solution: add explicit deny-by-default policies that block all anon and
authenticated access. The service role bypasses RLS, so the Edge Function
still works. This removes the warning without weakening security.
*/

-- Block all anon/authenticated SELECT (service role bypasses RLS)
DROP POLICY IF EXISTS "deny_feedback_rate_limits_select" ON public.feedback_rate_limits;
CREATE POLICY "deny_feedback_rate_limits_select"
  ON public.feedback_rate_limits FOR SELECT
  TO anon, authenticated
  USING (false);

-- Block all anon/authenticated INSERT
DROP POLICY IF EXISTS "deny_feedback_rate_limits_insert" ON public.feedback_rate_limits;
CREATE POLICY "deny_feedback_rate_limits_insert"
  ON public.feedback_rate_limits FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- Block all anon/authenticated UPDATE
DROP POLICY IF EXISTS "deny_feedback_rate_limits_update" ON public.feedback_rate_limits;
CREATE POLICY "deny_feedback_rate_limits_update"
  ON public.feedback_rate_limits FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Block all anon/authenticated DELETE
DROP POLICY IF EXISTS "deny_feedback_rate_limits_delete" ON public.feedback_rate_limits;
CREATE POLICY "deny_feedback_rate_limits_delete"
  ON public.feedback_rate_limits FOR DELETE
  TO anon, authenticated
  USING (false);
