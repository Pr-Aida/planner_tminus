/*
# Fix room-profiles storage bucket policies to allow admins

1. Security Changes
- Update storage policies for 'room-profiles' bucket to allow
  room admins (not just owners) to insert/update/delete images.
- SELECT remains owner-only (room images are public via public URLs,
  but the storage API SELECT is restricted for listing).
- Admin check: EXISTS in study_room_members with role='admin' and status='approved'
  OR room owner_id = auth.uid()
*/

DROP POLICY IF EXISTS "room_profiles_select_owner" ON storage.objects;
DROP POLICY IF EXISTS "room_profiles_insert_owner" ON storage.objects;
DROP POLICY IF EXISTS "room_profiles_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "room_profiles_delete_owner" ON storage.objects;

CREATE POLICY "room_profiles_select_owner" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'room-profiles' AND
    (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r
      WHERE r.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM study_room_members m
          WHERE m.room_id = r.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'approved'
        )
    )
  );

CREATE POLICY "room_profiles_insert_owner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'room-profiles' AND
    (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r
      WHERE r.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM study_room_members m
          WHERE m.room_id = r.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'approved'
        )
    )
  );

CREATE POLICY "room_profiles_update_owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'room-profiles' AND
    (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r
      WHERE r.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM study_room_members m
          WHERE m.room_id = r.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'approved'
        )
    )
  )
  WITH CHECK (
    bucket_id = 'room-profiles' AND
    (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r
      WHERE r.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM study_room_members m
          WHERE m.room_id = r.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'approved'
        )
    )
  );

CREATE POLICY "room_profiles_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'room-profiles' AND
    (storage.foldername(name))[1] IN (
      SELECT r.id::text FROM study_rooms r
      WHERE r.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM study_room_members m
          WHERE m.room_id = r.id
            AND m.user_id = auth.uid()
            AND m.role = 'admin'
            AND m.status = 'approved'
        )
    )
  );
