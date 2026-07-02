/*
# Allow admins to manage room members

Updates the members_update_self_or_owner RLS policy to also allow
approved admins to update study_room_members rows (for approve/reject
join requests, remove members, etc.).

Admins can update any member row in their room EXCEPT:
- They cannot change the owner's role or status
- They cannot make themselves owner (handled by app logic + transfer function)

The USING and WITH CHECK clauses check:
- user_id = auth.uid() (self can update own row, e.g. sharing settings)
- OR _internal.is_room_owner (owner can update any member)
- OR the caller is an approved admin of the same room AND the target
  is not the owner (admins cannot modify the owner's row)
*/
DROP POLICY IF EXISTS "members_update_self_or_owner" ON study_room_members;
CREATE POLICY "members_update_self_or_owner"
ON study_room_members FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR _internal.is_room_owner(room_id, auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = study_room_members.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
    AND NOT _internal.is_room_owner(room_id, study_room_members.user_id)
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR _internal.is_room_owner(room_id, auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = study_room_members.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
    AND NOT _internal.is_room_owner(room_id, study_room_members.user_id)
  )
);

-- Also allow admins to delete members (remove normal members)
DROP POLICY IF EXISTS "members_delete_self_or_owner" ON study_room_members;
CREATE POLICY "members_delete_self_or_owner"
ON study_room_members FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR _internal.is_room_owner(room_id, auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = study_room_members.room_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
      AND m.status = 'approved'
    )
    AND NOT _internal.is_room_owner(room_id, study_room_members.user_id)
  )
);
