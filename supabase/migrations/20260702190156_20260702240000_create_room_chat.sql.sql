/*
# Create room_chat_messages table for Study Room Chat

1. New Tables
- `room_chat_messages`
  - id (uuid, primary key)
  - room_id (uuid, references study_rooms, cascade delete)
  - user_id (uuid, references auth.users, cascade delete)
  - message (text, not null, max 1000 chars enforced by app)
  - created_at (timestamptz, default now())
  - updated_at (timestamptz, nullable)
  - is_deleted (boolean, default false — soft delete)

2. Security (RLS)
- Enable RLS on room_chat_messages.
- SELECT: only approved members or owner/admin of the same room can read.
- INSERT: only approved members or owner/admin can insert, user_id must be auth.uid().
- UPDATE: only the message author can update their own message (soft delete / edit).
- DELETE: only room owner or admin can delete (moderation).
- All policies scope by room_id using _internal.is_approved_member_or_owner.

3. Indexes
- idx_chat_room_created: (room_id, created_at) for efficient message loading per room.

4. Realtime
- Enable realtime for room_chat_messages table.

5. Important Notes
- Uses existing _internal.is_approved_member_or_owner(uuid, uuid) function for membership checks.
- No SECURITY DEFINER functions created — all access via RLS + INVOKER.
- No private user data exposed — only message text, user_id, created_at.
- Profile data (username, display_name, avatar_url) is fetched separately via RLS-scoped profiles table.
- When a room is deleted, CASCADE removes all chat messages for that room only.
- No planner data, habits, notes, or other private data is stored in chat.
*/
CREATE TABLE IF NOT EXISTS room_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  is_deleted boolean NOT NULL DEFAULT false
);

ALTER TABLE room_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: only approved members or owner/admin of the same room
DROP POLICY IF EXISTS "chat_select_room_members" ON room_chat_messages;
CREATE POLICY "chat_select_room_members"
ON room_chat_messages FOR SELECT
TO authenticated
USING (_internal.is_approved_member_or_owner(room_id, auth.uid()));

-- INSERT: only approved members, user_id must be auth.uid()
DROP POLICY IF EXISTS "chat_insert_room_members" ON room_chat_messages;
CREATE POLICY "chat_insert_room_members"
ON room_chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  _internal.is_approved_member_or_owner(room_id, auth.uid())
  AND user_id = auth.uid()
);

-- UPDATE: only the message author can edit their own message
DROP POLICY IF EXISTS "chat_update_own_message" ON room_chat_messages;
CREATE POLICY "chat_update_own_message"
ON room_chat_messages FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: only room owner or admin can delete messages (moderation)
-- Uses _internal.is_room_owner for owner check
-- Admin check: role = 'admin' AND status = 'approved' in study_room_members
DROP POLICY IF EXISTS "chat_delete_owner_or_admin" ON room_chat_messages;
CREATE POLICY "chat_delete_owner_or_admin"
ON room_chat_messages FOR DELETE
TO authenticated
USING (
  _internal.is_room_owner(room_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = room_chat_messages.room_id
    AND m.user_id = auth.uid()
    AND m.role = 'admin'
    AND m.status = 'approved'
  )
);

-- Index for efficient message loading per room
CREATE INDEX IF NOT EXISTS idx_chat_room_created ON room_chat_messages (room_id, created_at);

-- Enable realtime for room_chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE room_chat_messages;
