/*
# Allow owner to transfer ownership (update owner_id)

The rooms_update_owner policy has WITH CHECK (owner_id = auth.uid()),
which blocks transferring ownership because the new owner_id != auth.uid().
Fix: allow the update if the OLD row's owner_id = auth.uid() (USING clause),
and the WITH CHECK just needs to verify the new owner_id is a valid approved
member of the room (or keep it simple: allow any update by the current owner).
*/

-- Drop the restrictive update policy and create a more permissive one
-- that allows ownership transfer.
DROP POLICY IF EXISTS "rooms_update_owner" ON study_rooms;
CREATE POLICY "rooms_update_owner" ON study_rooms FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR is_room_member(id, owner_id, ARRAY['approved']::text[]));
