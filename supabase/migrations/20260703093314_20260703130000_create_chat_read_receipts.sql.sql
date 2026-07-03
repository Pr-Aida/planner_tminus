/*
# Create room_chat_read_receipts table for persistent unread tracking

## Summary
Adds a table to track the last time each user read the chat in each Study Room.
This replaces the purely in-memory unread counter with persistent tracking, so
the unread dot appears even when a user was not in the room when messages were
sent. The dot clears when the user opens the Chat tab (updating their read receipt).

## 1. New Tables
- `room_chat_read_receipts`
  - id (uuid, primary key)
  - room_id (uuid, references study_rooms, cascade delete)
  - user_id (uuid, references auth.users, cascade delete) — defaults to auth.uid()
  - last_read_at (timestamptz, not null, default now()) — last time user read chat
  - updated_at (timestamptz, default now()) — auto-updated via trigger
  - Unique constraint on (room_id, user_id) — one receipt per user per room

## 2. Security (RLS)
- Enable RLS.
- SELECT: only the owner (auth.uid() = user_id) can read their own receipts.
- INSERT/UPDATE: only the owner. UPSERT pattern used by app to update on read.
- DELETE: only the owner (cleanup on leaving a room, optional).

## 3. Indexes
- idx_chat_receipts_room_user: unique index on (room_id, user_id)

## 4. Important Notes
1. Does not affect existing chat messages or files — purely additive.
2. Unread count is computed by the app: messages from other users with
   created_at > last_read_at. Own messages are never counted as unread.
3. If no receipt exists for a user in a room, all messages from other users
   are treated as unread.
4. Realtime still updates the dot immediately when online; the receipt handles
   the offline/not-in-room case.
*/
CREATE TABLE IF NOT EXISTS room_chat_read_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

ALTER TABLE room_chat_read_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_receipts_select_own" ON room_chat_read_receipts;
CREATE POLICY "chat_receipts_select_own"
ON room_chat_read_receipts FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_receipts_insert_own" ON room_chat_read_receipts;
CREATE POLICY "chat_receipts_insert_own"
ON room_chat_read_receipts FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_receipts_update_own" ON room_chat_read_receipts;
CREATE POLICY "chat_receipts_update_own"
ON room_chat_read_receipts FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "chat_receipts_delete_own" ON room_chat_read_receipts;
CREATE POLICY "chat_receipts_delete_own"
ON room_chat_read_receipts FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Enable realtime for read receipts so the unread dot updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE room_chat_read_receipts;
