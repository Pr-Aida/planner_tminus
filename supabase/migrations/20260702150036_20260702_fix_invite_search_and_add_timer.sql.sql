/*
# Fix invite code lookup, username search, and add study timer

## 1. Room lookup by invite code / room code
- Problem: study_rooms SELECT policy only allows owner or pending/invited/approved members.
  A user looking up a room by invite_code or room_code (who is NOT yet a member) gets zero rows.
- Fix: Add a new SELECT policy `rooms_select_by_invite` that allows any authenticated user
  to SELECT rooms where invite_enabled = true (so they can preview the room before requesting).
  The existing `rooms_select_visible` policy remains for owner/member access.

## 2. Username search on profiles
- Problem: profiles SELECT policy only allows `auth.uid() = id`, so searching for
  another user's profile returns nothing.
- Fix: Add a new SELECT policy `profiles_search_by_username` that allows authenticated
  users to read limited profile fields (id, username, display_name, avatar_url) for
  the purpose of room invitations. We create a SECURITY DEFINER function `search_profile_by_username`
  that returns only safe fields, avoiding exposing email or private data.
- The existing `select_own_profile` policy remains for full profile access.

## 3. Room study sessions (timer)
- New table `room_study_sessions`:
  - id (uuid PK)
  - room_id (uuid FK -> study_rooms, ON DELETE CASCADE)
  - user_id (uuid FK -> auth.users, ON DELETE CASCADE)
  - started_at (timestamptz, default now())
  - ended_at (timestamptz, nullable — null means active session)
  - duration_seconds (integer, nullable — set when timer stops)
  - created_at (timestamptz, default now())
- RLS enabled:
  - SELECT: approved room members can see all sessions in their room; users can always see their own sessions
  - INSERT: approved members can insert only their own sessions (one active per room)
  - UPDATE: users can update only their own sessions (to set ended_at)
  - DELETE: owner only (for cleanup)
- Unique partial index on (room_id, user_id) WHERE ended_at IS NULL — enforces one active timer per user per room.

## 4. Security notes
- No recursion in RLS: timer SELECT uses the existing `is_room_member` SECURITY DEFINER function.
- Profile search uses a SECURITY DEFINER function, not a direct table policy, to avoid exposing private fields.
- Private planner data (habits, notes, reminders, countdowns) is never touched.
*/

-- ─── 1. Allow room lookup by invite code / room code ───────────────────────────
-- Drop old policy and recreate with broader access for invite-enabled rooms.
DROP POLICY IF EXISTS "rooms_select_visible" ON study_rooms;
DROP POLICY IF EXISTS "rooms_select_by_invite" ON study_rooms;

-- Owner, or pending/invited/approved member, or any room with invite_enabled=true
-- (so users can look up a room by invite_code/room_code before joining).
CREATE POLICY "rooms_select_visible"
ON study_rooms FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR is_room_member(id, auth.uid(), ARRAY['pending', 'invited', 'approved'])
  OR invite_enabled = true
);

-- ─── 2. Username search via SECURITY DEFINER function ──────────────────────────
-- Allows authenticated users to find another user by exact normalized username.
-- Returns only safe fields: id, username, display_name, avatar_url.
-- Never exposes email, recovery_email, or any private planner data.
CREATE OR REPLACE FUNCTION search_profile_by_username(p_username text)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.username, p.display_name, p.avatar_url
  FROM profiles p
  WHERE p.username_lower = lower(trim(p_username))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION search_profile_by_username(text) TO authenticated;

-- ─── 3. Room study sessions table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE room_study_sessions ENABLE ROW LEVEL SECURITY;

-- Index for querying active sessions per room
CREATE INDEX IF NOT EXISTS idx_study_sessions_room_active
ON room_study_sessions (room_id)
WHERE ended_at IS NULL;

-- Index for querying a user's sessions
CREATE INDEX IF NOT EXISTS idx_study_sessions_user
ON room_study_sessions (user_id, started_at DESC);

-- Unique partial index: one active session per user per room
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_sessions_one_active
ON room_study_sessions (room_id, user_id)
WHERE ended_at IS NULL;

-- RLS policies for room_study_sessions
DROP POLICY IF EXISTS "sessions_select_approved_members" ON room_study_sessions;
CREATE POLICY "sessions_select_approved_members"
ON room_study_sessions FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR is_room_member(room_id, auth.uid(), ARRAY['approved'])
);

DROP POLICY IF EXISTS "sessions_insert_own" ON room_study_sessions;
CREATE POLICY "sessions_insert_own"
ON room_study_sessions FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND is_room_member(room_id, auth.uid(), ARRAY['approved'])
);

DROP POLICY IF EXISTS "sessions_update_own" ON room_study_sessions;
CREATE POLICY "sessions_update_own"
ON room_study_sessions FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "sessions_delete_owner" ON room_study_sessions;
CREATE POLICY "sessions_delete_owner"
ON room_study_sessions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM study_rooms
    WHERE study_rooms.id = room_study_sessions.room_id
    AND study_rooms.owner_id = auth.uid()
  )
);
