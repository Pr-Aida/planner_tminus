/*
# Allow admins to update room settings

Updates the rooms_update_owner RLS policy to also allow approved admins
to update study_rooms rows (for editing room name, description, image, etc.).

The USING clause checks:
- owner_id = auth.uid() (owner can always update)
- OR the user is an approved admin of this room

The WITH CHECK clause ensures the owner_id cannot be changed to a non-owner:
- owner_id stays the same (owner_id = auth.uid() for owner, or unchanged for admin)

Admins still CANNOT:
- delete the room (rooms_delete_owner is owner-only)
- transfer ownership (separate function, owner-only)
- change owner_id (WITH CHECK prevents this)
*/
DROP POLICY IF EXISTS "rooms_update_owner" ON study_rooms;
CREATE POLICY "rooms_update_owner"
ON study_rooms FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = study_rooms.id
    AND m.user_id = auth.uid()
    AND m.role = 'admin'
    AND m.status = 'approved'
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR (
    owner_id = (SELECT study_rooms.owner_id FROM study_rooms s WHERE s.id = study_rooms.id)
    AND EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = study_rooms.id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
  )
);
