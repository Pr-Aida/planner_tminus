/*
# Feedback & Support: real delete + in-app notifications + 30-day cleanup

1. feedback_notifications table
   - Stores in-app notifications for feedback replies.
   - One row per reply, linked to feedback_id and user_id (the feedback author).
   - RLS: users read only their own; admin reads all; only service role inserts.

2. feedback table RLS changes
   - Replace the user "hide" UPDATE policy with a user DELETE policy (real delete).
   - Drop user_hidden_at (no longer used).
   - SELECT: users see their own feedback; admin sees all.

3. cleanup_old_feedback()
   - Now also deletes feedback_notifications for removed feedback rows.
*/

-- ── 1. feedback_notifications table ──
CREATE TABLE IF NOT EXISTS public.feedback_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'feedback_reply',
  message text NOT NULL DEFAULT 'You have a new reply to your feedback.',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_notifications_user_idx ON public.feedback_notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_notifications_feedback_idx ON public.feedback_notifications (feedback_id);

ALTER TABLE public.feedback_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_feedback_notifications" ON public.feedback_notifications;
CREATE POLICY "select_own_feedback_notifications"
  ON public.feedback_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR internal.is_admin());

DROP POLICY IF EXISTS "update_own_feedback_notifications" ON public.feedback_notifications;
CREATE POLICY "update_own_feedback_notifications"
  ON public.feedback_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_feedback_notifications" ON public.feedback_notifications;
CREATE POLICY "delete_own_feedback_notifications"
  ON public.feedback_notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT policy for authenticated — only service role inserts (edge function).

-- ── 2. feedback table RLS changes ──
DROP POLICY IF EXISTS "update_feedback_user_hide" ON public.feedback;

DROP POLICY IF EXISTS "delete_own_feedback" ON public.feedback;
CREATE POLICY "delete_own_feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "delete_feedback_admin" ON public.feedback;
CREATE POLICY "delete_feedback_admin"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (internal.is_admin());

DROP POLICY IF EXISTS "select_own_feedback" ON public.feedback;
CREATE POLICY "select_own_feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR internal.is_admin());

ALTER TABLE public.feedback DROP COLUMN IF EXISTS user_hidden_at;

-- ── 3. Update cleanup_old_feedback() ──
CREATE OR REPLACE FUNCTION public.cleanup_old_feedback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO old_ids
  FROM feedback
  WHERE created_at < (now() - interval '30 days');

  IF old_ids IS NOT NULL THEN
    DELETE FROM feedback_notifications WHERE feedback_id = ANY(old_ids);
    DELETE FROM feedback WHERE id = ANY(old_ids);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_feedback() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_feedback() TO authenticated;
