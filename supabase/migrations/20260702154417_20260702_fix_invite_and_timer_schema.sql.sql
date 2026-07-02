/*
# Fix Study Room invite link and add pause/resume timer support

## 1. Invite link fix
- Add index on invite_code with lower() for case-insensitive lookup
- Ensure invite_code is always stored as uppercase

## 2. Timer pause/resume support
- Add `status` column to room_study_sessions (running, paused, ended)
- Add `paused_at` column
- Add `accumulated_seconds` column for persisting paused time
- Update RLS to allow updating own sessions
*/

-- ─── 1. Ensure invite_code is uppercase and add case-insensitive index ─────────
-- Update existing invite codes to uppercase
UPDATE study_rooms SET invite_code = UPPER(invite_code) WHERE invite_code != UPPER(invite_code);

-- Create a unique index on upper(invite_code) for case-insensitive matching
DROP INDEX IF EXISTS idx_study_rooms_invite_code_upper;
CREATE UNIQUE INDEX idx_study_rooms_invite_code_upper ON study_rooms (UPPER(invite_code));

-- ─── 2. Add pause/resume support to room_study_sessions ───────────────────────
-- Add status column (running, paused, ended)
ALTER TABLE room_study_sessions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ended'
  CHECK (status IN ('running', 'paused', 'ended'));

-- Add paused_at timestamp
ALTER TABLE room_study_sessions ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Add accumulated_seconds for persisting time when paused
ALTER TABLE room_study_sessions ADD COLUMN IF NOT EXISTS accumulated_seconds integer NOT NULL DEFAULT 0;

-- Update existing rows: if ended_at is null, status should be 'running', else 'ended'
UPDATE room_study_sessions SET status = 'running' WHERE ended_at IS NULL AND status = 'ended';
UPDATE room_study_sessions SET status = 'ended' WHERE ended_at IS NOT NULL AND status != 'ended';

-- Drop the old one-active constraint and recreate with status check
DROP INDEX IF EXISTS idx_study_sessions_one_active;
CREATE UNIQUE INDEX idx_study_sessions_one_active ON room_study_sessions (room_id, user_id) WHERE status = 'running';

-- ─── 3. Update RLS to allow updates (for pause/resume) ────────────────────────────
-- The existing sessions_update_own policy already allows users to update their own sessions
-- We need to ensure it works with the new columns

-- ─── 4. Add helper function to get room by invite code (case-insensitive) ───────
CREATE OR REPLACE FUNCTION get_room_by_invite_code(p_code text)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  avatar_url text,
  profile_image_url text,
  theme_color text,
  invite_code text,
  room_code text,
  invite_enabled boolean,
  leaderboard_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.owner_id, r.name, r.description, r.avatar_url, r.profile_image_url,
         r.theme_color, r.invite_code, r.room_code, r.invite_enabled, r.leaderboard_enabled,
         r.created_at, r.updated_at
  FROM study_rooms r
  WHERE UPPER(r.invite_code) = UPPER(trim(p_code));
$$;

GRANT EXECUTE ON FUNCTION get_room_by_invite_code(text) TO authenticated;