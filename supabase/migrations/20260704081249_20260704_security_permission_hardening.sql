-- Security Permission Hardening for T Minus
-- This migration enforces strict separation between:
-- - Global site admin (profiles.is_admin) - limited to Feedback & Support only
-- - Study Room permissions - based on approved room membership only
-- - Private user data - owner-only access

-- ============================================================================
-- PART 1: Protect is_admin flag on profiles
-- ============================================================================

-- Create a function that prevents non-superusers from changing is_admin
-- This ensures only manual database actions by superusers can grant admin
CREATE OR REPLACE FUNCTION internal.protect_is_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'internal', 'public', 'pg_temp'
AS $$
BEGIN
  -- Only allow is_admin changes if:
  -- 1. The user is a superuser (postgres), OR
  -- 2. The change is being made by the edge function (service role bypasses RLS)
  -- Normal authenticated users cannot change their own is_admin flag
  
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Check if the session user is superuser (postgres role)
    IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
      -- Non-superuser trying to change is_admin - block it
      RAISE EXCEPTION 'Only database administrators can modify is_admin flag'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create new
DROP TRIGGER IF EXISTS protect_profiles_is_admin ON profiles;
CREATE TRIGGER protect_profiles_is_admin
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION internal.protect_is_admin();

-- Revoke execute permissions from public
REVOKE ALL ON FUNCTION internal.protect_is_admin() FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- PART 2: Fix feedback_notifications RLS - remove admin bypass
-- Admin doesn't need to see feedback notifications directly - they manage
-- feedback through the feedback table RLS which correctly allows admin access
-- ============================================================================

-- Drop the policy that allows admin to see all feedback notifications
DROP POLICY IF EXISTS select_own_feedback_notifications ON feedback_notifications;

-- Create new policy that only allows the notification owner to see their notifications
CREATE POLICY "select_own_notifications_only" ON feedback_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- PART 3: Ensure SECURITY DEFINER functions are properly protected
-- ============================================================================

-- Revoke execute from public for cleanup functions - these should only run
-- via edge functions with service role, or by superuser
REVOKE ALL ON FUNCTION public.cleanup_old_feedback() FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.cleanup_orphaned_storage_files() FROM PUBLIC, authenticated, anon;

-- Ensure internal.is_admin is only executable by authenticated users
-- (it already checks auth.uid() internally)
REVOKE ALL ON FUNCTION internal.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.is_admin() TO authenticated;

-- Ensure _internal helper functions are only for authenticated
REVOKE ALL ON FUNCTION _internal.is_approved_member_or_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION _internal.is_room_member(uuid, uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION _internal.is_room_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION _internal.is_approved_member_or_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_room_member(uuid, uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION _internal.is_room_owner(uuid, uuid) TO authenticated;

-- Revoke from internal functions that don't need direct client execution
-- These are called by other functions or via RPC with proper validation
REVOKE ALL ON FUNCTION _internal.activity_for_user(uuid, text, text, uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION _internal.members_activity(uuid, text, uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION _internal.get_member_profiles(uuid, uuid) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION _internal.search_profile(text, uuid) FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- PART 4: Add explicit RLS policy comments for documentation
-- ============================================================================

COMMENT ON TABLE planner_daily IS 'Private user data: only owner (auth.uid() = user_id) can access';
COMMENT ON TABLE planner_habits IS 'Private user data: only owner (auth.uid() = user_id) can access';
COMMENT ON TABLE planner_reminders IS 'Private user data: only owner (auth.uid() = user_id) can access';
COMMENT ON TABLE planner_monthly_notes IS 'Private user data: only owner (auth.uid() = user_id) can access';
COMMENT ON TABLE profiles IS 'User profiles: users can only access their own row. is_admin flag protected by trigger';

COMMENT ON TABLE feedback IS 'Feedback tickets: users own their tickets, admin (is_admin=true) can see all for support';
COMMENT ON TABLE feedback_notifications IS 'Notifications for feedback replies: only the notification owner (user_id) can see';

COMMENT ON TABLE study_rooms IS 'Study Rooms: visible to owner and members with approved/pending/invited status, or if invite_enabled';
COMMENT ON TABLE study_room_members IS 'Room membership: owner and approved members can see member list';
COMMENT ON TABLE room_chat_messages IS 'Room chat: only approved room members can access';
COMMENT ON TABLE uploaded_files IS 'Files: owner or approved room members for room files';
COMMENT ON TABLE room_study_sessions IS 'Study sessions: owner of session, or approved room members can see room activity';

-- ============================================================================
-- PART 5: Verify is_admin default remains false
-- ============================================================================

-- Ensure the column default is still false (defense in depth)
ALTER TABLE profiles ALTER COLUMN is_admin SET DEFAULT false;

-- ============================================================================
-- PART 6: Document admin function purpose
-- ============================================================================

COMMENT ON FUNCTION internal.is_admin() IS 'Returns true if current authenticated user has is_admin=true in profiles. Used only for feedback/support admin access. Does NOT grant access to private user planner data, habits, activities, or study room data.';

-- ============================================================================
-- PART 7: Ensure rate limit table stays inaccessible
-- ============================================================================

COMMENT ON TABLE feedback_rate_limits IS 'Rate limiting table: no direct access from client, managed by edge functions only';
