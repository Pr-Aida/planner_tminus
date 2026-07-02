/*
# Fix anonymous members, username search, room profile images, and leave-room filtering

## 1. Fix Anonymous Members — profiles access for room members
- Problem: profiles SELECT policy only allows `auth.uid() = id`, so when fetchMembers
  queries `profiles.in('id', memberIds)` for OTHER users, it gets zero rows.
  Members appear as "Anonymous".
- Fix: Create a SECURITY DEFINER function `get_room_member_profiles(p_room_id)`
  that returns safe profile fields (id, username, display_name, avatar_url) for all
  approved/pending/invited members of a room. This avoids changing the profiles RLS
  policy (which would expose all profiles to all users) and avoids recursion.
- The frontend fetchMembers() will call this RPC instead of querying profiles directly.

## 2. Fix Username Search — add username_normalized
- Problem: The search_profile_by_username function uses `username_lower` but the
  user asked for `username_normalized`. We add a `username_normalized` column
  (generated from username, always lowercase + trimmed), keep it synced via
  a trigger, and update the search function to use it.
- This ensures `sara`, `Sara`, `SARA` all match the same user.

## 3. Room Profile Image — storage bucket + column
- Create a public storage bucket `room-profiles` for room profile images.
- Add `profile_image_url` column to `study_rooms` (nullable text).
- Storage policies: only room owner can upload/delete to `room-profiles/{room_id}/`,
  anyone can read (public bucket for image display).

## 4. Leave Room filtering
- No schema change needed — the fix is in the frontend fetchMyRooms() which will
  filter out rooms where the user's membership status is left/rejected/removed/declined.
  The RLS already returns these rooms (because of the broad SELECT policy), so
  the frontend must filter them out.

## Security
- get_room_member_profiles is SECURITY DEFINER — bypasses RLS safely, returns only
  safe fields, no email or private data.
- search_profile_by_username updated to use username_normalized.
- Storage policies enforce owner-only writes.
- No recursion in any policy.
*/

-- ─── 1. Fix Anonymous Members: RPC to fetch member profiles safely ────────────
CREATE OR REPLACE FUNCTION get_room_member_profiles(p_room_id uuid)
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
  WHERE p.id IN (
    SELECT user_id FROM study_room_members
    WHERE room_id = p_room_id
    AND status IN ('approved', 'pending', 'invited')
  );
$$;

GRANT EXECUTE ON FUNCTION get_room_member_profiles(uuid) TO authenticated;

-- ─── 2. Fix Username Search: add username_normalized column + trigger ───────────
-- Add username_normalized if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_normalized text;

-- Populate it from existing data
UPDATE profiles SET username_normalized = lower(trim(username)) WHERE username_normalized IS NULL;

-- Add unique index on username_normalized (so usernames are case-insensitively unique)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_normalized
ON profiles (username_normalized)
WHERE username_normalized IS NOT NULL;

-- Trigger to keep username_normalized synced with username
CREATE OR REPLACE FUNCTION sync_username_normalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.username_normalized := lower(trim(NEW.username));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_username_normalized ON profiles;
CREATE TRIGGER trg_sync_username_normalized
BEFORE INSERT OR UPDATE OF username ON profiles
FOR EACH ROW
EXECUTE FUNCTION sync_username_normalized();

-- Update the search function to use username_normalized
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
  WHERE p.username_normalized = lower(trim(p_username))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION search_profile_by_username(text) TO authenticated;

-- ─── 3. Room Profile Image: storage bucket + column ────────────────────────────
-- Add profile_image_url column to study_rooms
ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS profile_image_url text;

-- Create the room-profiles storage bucket (public for image display)
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-profiles', 'room-profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: owner can upload/update/delete, anyone can read
DROP POLICY IF EXISTS "room_profiles_read_all" ON storage.objects;
CREATE POLICY "room_profiles_read_all"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'room-profiles');

DROP POLICY IF EXISTS "room_profiles_insert_owner" ON storage.objects;
CREATE POLICY "room_profiles_insert_owner"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'room-profiles'
  AND EXISTS (
    SELECT 1 FROM study_rooms
    WHERE study_rooms.id::text = (storage.foldername(name))[1]
    AND study_rooms.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "room_profiles_update_owner" ON storage.objects;
CREATE POLICY "room_profiles_update_owner"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'room-profiles'
  AND EXISTS (
    SELECT 1 FROM study_rooms
    WHERE study_rooms.id::text = (storage.foldername(name))[1]
    AND study_rooms.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'room-profiles'
  AND EXISTS (
    SELECT 1 FROM study_rooms
    WHERE study_rooms.id::text = (storage.foldername(name))[1]
    AND study_rooms.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "room_profiles_delete_owner" ON storage.objects;
CREATE POLICY "room_profiles_delete_owner"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'room-profiles'
  AND EXISTS (
    SELECT 1 FROM study_rooms
    WHERE study_rooms.id::text = (storage.foldername(name))[1]
    AND study_rooms.owner_id = auth.uid()
  )
);
