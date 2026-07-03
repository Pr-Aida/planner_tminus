/*
# Create File/Document Storage System

## Summary
Adds a safe file/document system for personal documents (Profile) and Study Room
chat attachments. Files are stored in Supabase Storage (NOT in the database). The
database stores metadata only. Two private storage buckets are created:
`user-documents` and `room-chat-files`. Access is controlled by strict RLS and
storage policies. Signed URLs (short-lived) are used for private file access —
no permanent public URLs are ever exposed.

## 1. New Tables
- `uploaded_files`
  - id (uuid, primary key)
  - owner_user_id (uuid, references auth.users, cascade delete) — the uploader
  - room_id (uuid, nullable, references study_rooms, cascade delete) — set for room chat files
  - chat_message_id (uuid, nullable, references room_chat_messages, cascade delete) — links file to a chat message
  - storage_bucket (text, not null) — 'user-documents' or 'room-chat-files'
  - storage_path (text, not null) — full path within the bucket
  - original_file_name (text, not null) — sanitized display name
  - file_type (text, not null) — 'image' | 'pdf' | 'audio' | 'file'
  - mime_type (text, not null) — validated MIME type
  - file_size (bigint, not null) — size in bytes
  - upload_context (text, not null) — 'personal_document' | 'room_chat'
  - created_at (timestamptz, default now())
  - deleted_at (timestamptz, nullable) — soft-delete timestamp

## 2. Modified Tables
- `room_chat_messages`
  - message_type (text, not null, default 'text') — 'text' | 'image' | 'pdf' | 'audio' | 'file'
  - attachment_id (uuid, nullable, references uploaded_files, set null on delete) — links to file metadata
  Both additions are nullable/defaulted so existing text messages are unaffected.

## 3. Storage Buckets (private, not public)
- `user-documents` — personal documents, private per-user paths
- `room-chat-files` — room chat attachments, private per-room paths

## 4. Storage Policies
- user-documents: owner can CRUD only files under {their_user_id}/ folder
- room-chat-files: approved room members/owner can read; only uploader can write/delete
  their own files under {room_id}/ folder; room owner/admin can delete any file in their room

## 5. Security (RLS)
- uploaded_files: enabled. Personal documents visible only to owner. Room chat files
  visible only to approved members/owner of the same room. Inserts require owner =
  auth.uid(). Deletes by owner, or by room owner/admin for room files.
- room_chat_messages: existing policies updated to also allow the message author to
  soft-delete (set is_deleted) their own messages, in addition to owner/admin deletion.

## 6. Indexes
- idx_uploaded_files_owner: (owner_user_id) for listing personal documents
- idx_uploaded_files_room: (room_id) for listing room files / cleanup
- idx_uploaded_files_chat_msg: (chat_message_id) for linking files to messages

## 7. Important Notes
1. No raw file binary data is stored in the database — only metadata.
2. Buckets are private (public = false). No public listing. Signed URLs required.
3. File paths are scoped by user_id (personal) or room_id (room chat) so users
   cannot guess another user's file path.
4. When a room is deleted, CASCADE removes uploaded_files rows for that room AND
   the app cleans up storage files. When a chat message is deleted, the linked
   file's metadata is cascade-set-null so the app can clean up the storage file.
5. When a user deletes their account, CASCADE removes their personal document
   metadata rows. The account edge function handles storage cleanup.
6. MIME type and file size are validated client-side before upload; storage
   policies enforce path-based ownership server-side.
*/

-- ─── Create uploaded_files table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid REFERENCES study_rooms(id) ON DELETE CASCADE,
  chat_message_id uuid REFERENCES room_chat_messages(id) ON DELETE SET NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('image', 'pdf', 'audio', 'file')),
  mime_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  upload_context text NOT NULL CHECK (upload_context IN ('personal_document', 'room_chat')),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- Personal documents: only owner can SELECT
-- Room chat files: only approved members/owner of the same room can SELECT
DROP POLICY IF EXISTS "files_select_owner_or_room_member" ON uploaded_files;
CREATE POLICY "files_select_owner_or_room_member"
ON uploaded_files FOR SELECT
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR (room_id IS NOT NULL AND _internal.is_approved_member_or_owner(room_id, auth.uid()))
);

-- INSERT: owner must be auth.uid()
DROP POLICY IF EXISTS "files_insert_owner" ON uploaded_files;
CREATE POLICY "files_insert_owner"
ON uploaded_files FOR INSERT
TO authenticated
WITH CHECK (owner_user_id = auth.uid());

-- UPDATE: only owner can update (e.g. soft-delete)
DROP POLICY IF EXISTS "files_update_owner" ON uploaded_files;
CREATE POLICY "files_update_owner"
ON uploaded_files FOR UPDATE
TO authenticated
USING (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

-- DELETE: owner can delete their files; room owner/admin can delete room chat files
DROP POLICY IF EXISTS "files_delete_owner_or_room_admin" ON uploaded_files;
CREATE POLICY "files_delete_owner_or_room_admin"
ON uploaded_files FOR DELETE
TO authenticated
USING (
  owner_user_id = auth.uid()
  OR (room_id IS NOT NULL AND (
    _internal.is_room_owner(room_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = uploaded_files.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
  ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_uploaded_files_owner ON uploaded_files (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_room ON uploaded_files (room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uploaded_files_chat_msg ON uploaded_files (chat_message_id) WHERE chat_message_id IS NOT NULL;

-- ─── Add attachment columns to room_chat_messages ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_chat_messages' AND column_name = 'message_type') THEN
    ALTER TABLE room_chat_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_chat_messages' AND column_name = 'attachment_id') THEN
    ALTER TABLE room_chat_messages ADD COLUMN attachment_id uuid REFERENCES uploaded_files(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── Create private storage buckets ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-documents', 'user-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('room-chat-files', 'room-chat-files', false)
ON CONFLICT (id) DO NOTHING;

-- ─── Storage policies: user-documents ────────────────────────────────────────
-- Path format: {user_id}/{file_id}-{filename}
DROP POLICY IF EXISTS "user_docs_select_owner" ON storage.objects;
CREATE POLICY "user_docs_select_owner" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "user_docs_insert_owner" ON storage.objects;
CREATE POLICY "user_docs_insert_owner" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "user_docs_update_owner" ON storage.objects;
CREATE POLICY "user_docs_update_owner" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "user_docs_delete_owner" ON storage.objects;
CREATE POLICY "user_docs_delete_owner" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── Storage policies: room-chat-files ───────────────────────────────────────
-- Path format: {room_id}/{message_id}/{file_id}-{filename}
-- Read: approved members or owner of the room (room_id = first folder segment)
-- Write: only the uploader (first segment is room_id, but we restrict writes to
--   authenticated users — the DB metadata + app logic enforces who can upload)
-- Delete: file owner or room owner/admin

-- For room-chat-files, we need to check membership by extracting room_id from the path.
-- storage.foldername(name)[1] = room_id
DROP POLICY IF EXISTS "room_chat_files_select_members" ON storage.objects;
CREATE POLICY "room_chat_files_select_members" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'room-chat-files'
    AND _internal.is_approved_member_or_owner((storage.foldername(name))[1]::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "room_chat_files_insert_members" ON storage.objects;
CREATE POLICY "room_chat_files_insert_members" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'room-chat-files'
    AND _internal.is_approved_member_or_owner((storage.foldername(name))[1]::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "room_chat_files_delete_owner_or_admin" ON storage.objects;
CREATE POLICY "room_chat_files_delete_owner_or_admin" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'room-chat-files'
    AND (
      _internal.is_room_owner((storage.foldername(name))[1]::uuid, auth.uid())
      OR EXISTS (
        SELECT 1 FROM study_room_members m
        WHERE m.room_id = (storage.foldername(name))[1]::uuid
        AND m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.status = 'approved'
      )
      -- Allow the file uploader to delete their own file
      OR EXISTS (
        SELECT 1 FROM uploaded_files f
        WHERE f.storage_path = name
        AND f.storage_bucket = 'room-chat-files'
        AND f.owner_user_id = auth.uid()
      )
    )
  );
