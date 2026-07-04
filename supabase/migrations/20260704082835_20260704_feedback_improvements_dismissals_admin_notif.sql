-- Feedback improvements: per-user dismissal and admin notifications
-- Part 1: Create feedback_dismissals table for per-person view removal
-- Part 2: Add admin notifications when feedback is submitted

-- ============================================================================
-- PART 1: Feedback Dismissals Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_dismissals_unique UNIQUE (feedback_id, user_id)
);

-- Enable RLS
ALTER TABLE feedback_dismissals ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see/manage their own dismissals
CREATE POLICY "select_own_dismissals" ON feedback_dismissals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "insert_own_dismissals" ON feedback_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete_own_dismissals" ON feedback_dismissals
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_feedback_dismissals_user ON feedback_dismissals(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_dismissals_feedback ON feedback_dismissals(feedback_id);

-- ============================================================================
-- PART 2: Admin Notifications Table (new type for admin feedback notifications)
-- ============================================================================

-- We'll use the existing feedback_notifications table but add a new type
-- for admin notifications. First check if we need to modify the type constraint.

-- Drop the existing type constraint if exists
ALTER TABLE feedback_notifications DROP CONSTRAINT IF EXISTS feedback_notifications_type_check;

-- Add new constraint with admin_notification type
ALTER TABLE feedback_notifications ADD CONSTRAINT feedback_notifications_type_check
  CHECK (type IN ('feedback_reply', 'admin_notification'));

-- ============================================================================
-- PART 3: Function to create admin notification when feedback is submitted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_admin_on_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'internal', 'pg_temp'
AS $$
DECLARE
  admin_record RECORD;
BEGIN
  -- For each admin user, create a notification
  FOR admin_record IN 
    SELECT id FROM profiles WHERE is_admin = true
  LOOP
    INSERT INTO feedback_notifications (
      user_id,
      feedback_id,
      type,
      message,
      read
    ) VALUES (
      admin_record.id,
      NEW.id,
      'admin_notification',
      'New feedback received.',
      false
    );
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on feedback table
DROP TRIGGER IF EXISTS trigger_notify_admin_on_feedback ON feedback;
CREATE TRIGGER trigger_notify_admin_on_feedback
  AFTER INSERT ON feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_feedback();

-- Revoke direct execution from public
REVOKE ALL ON FUNCTION public.notify_admin_on_feedback() FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- PART 4: Comments for documentation
-- ============================================================================

COMMENT ON TABLE feedback_dismissals IS 'Per-user dismissal of feedback. Each user can dismiss feedback from their own view without affecting others.';
COMMENT ON TABLE feedback_notifications IS 'Notifications for feedback events: replies to users, and new feedback notifications to admin.';

-- ============================================================================
-- PART 5: Store admin reply sender as internal field (not exposed to users)
-- ============================================================================

-- Add internal field for tracking who replied (admin identity hidden from users)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS admin_reply_sender_id uuid REFERENCES auth.users(id);

-- The admin_reply_sender_id is for internal audit only and should NOT be exposed
-- to normal users via RLS or frontend queries.
