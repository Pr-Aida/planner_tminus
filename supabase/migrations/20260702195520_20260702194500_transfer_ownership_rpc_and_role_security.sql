/*
# Fix Transfer Ownership + Add Role Security

## Problem
Transfer ownership was failing because the frontend did 3 separate updates
that were not atomic:
1. UPDATE study_rooms SET owner_id = new_owner
2. UPDATE study_room_members SET role='owner' WHERE user_id = new_owner
3. UPDATE study_room_members SET role='member' WHERE user_id = old_owner

If any step failed, the room could end up with zero owners or two owners.
The RLS WITH CHECK on rooms_update_owner also blocked the owner_id change
in some cases.

Additionally, the members_update policy allowed admins to update any
non-owner member row, which meant an admin could set role='admin' on
themselves or other members — a privilege escalation.

## Fix

### 1. transfer_room_ownership RPC (SECURITY DEFINER)
A single atomic function that:
- Verifies the caller is the current room owner
- Verifies the target is an approved member of the room
- Atomically updates study_rooms.owner_id, sets new owner role='owner',
  and demotes the old owner to 'member' (or 'admin' if requested)
- Sets a GUC flag so the role-change trigger allows the transfer

### 2. protect_member_role trigger
A BEFORE UPDATE trigger on study_room_members that:
- Only fires when the role column is being changed
- Allows the change if the caller is the room owner (makeAdmin/removeAdmin)
- Allows the change if the GUC 'app.transfer_in_progress' is set (transfer RPC)
- Blocks all other role changes (admin escalation, self role change)

### 3. RLS policy stays simple
The members_update_self_or_owner policy allows self/owner/admin to update
member rows, but the trigger prevents non-owners from changing the role
column. This separates "who can touch the row" (RLS) from "who can change
the role" (trigger).

## What is NOT changed
- No tables or columns dropped or renamed
- No data deleted
- RLS remains enabled on all tables
- Existing rooms, members, and sessions are untouched
- The rooms_update_owner policy (admins can edit room settings) is unchanged
- The _internal helper functions are unchanged
*/

-- ─── 1. Create transfer_room_ownership RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_room_ownership(
  p_room_id uuid,
  p_new_owner_id uuid,
  p_old_owner_role text DEFAULT 'member'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_owner uuid;
  v_target_status text;
  v_old_role text := COALESCE(p_old_owner_role, 'member');
BEGIN
  IF v_old_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Invalid old owner role; use member or admin' USING ERRCODE = '22023';
  END IF;

  -- 1. Verify the caller is the current room owner
  SELECT owner_id INTO v_current_owner
  FROM study_rooms
  WHERE id = p_room_id;

  IF v_current_owner IS NULL THEN
    RAISE EXCEPTION 'Room not found' USING ERRCODE = '44000';
  END IF;

  IF v_current_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify the target is an approved member of this room
  SELECT status INTO v_target_status
  FROM study_room_members
  WHERE room_id = p_room_id AND user_id = p_new_owner_id;

  IF v_target_status IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this room' USING ERRCODE = '44000';
  END IF;

  IF v_target_status <> 'approved' THEN
    RAISE EXCEPTION 'Target user must be an approved member' USING ERRCODE = '42501';
  END IF;

  -- 3. Cannot transfer to self
  IF p_new_owner_id = v_current_owner THEN
    RAISE EXCEPTION 'Cannot transfer ownership to yourself' USING ERRCODE = '22023';
  END IF;

  -- 4. Set GUC flag so the role-change trigger allows this transfer
  SET LOCAL app.transfer_in_progress = 'true';

  -- 5. Atomic transfer
  UPDATE study_rooms SET owner_id = p_new_owner_id, updated_at = now()
  WHERE id = p_room_id;

  UPDATE study_room_members
  SET role = 'owner', status = 'approved', updated_at = now()
  WHERE room_id = p_room_id AND user_id = p_new_owner_id;

  UPDATE study_room_members
  SET role = v_old_role, updated_at = now()
  WHERE room_id = p_room_id AND user_id = v_current_owner;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.transfer_room_ownership(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transfer_room_ownership(uuid, uuid, text) TO authenticated;

-- ─── 2. Create protect_member_role trigger function ─────────────────────────
-- Prevents non-owners from changing the role column on study_room_members.
-- The owner can always change roles (makeAdmin/removeAdmin). The transfer
-- RPC sets a GUC to bypass this trigger during ownership transfer.
CREATE OR REPLACE FUNCTION protect_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_owner boolean;
  v_bypass text;
BEGIN
  -- Only fire when role is being changed
  IF NEW.role = OLD.role THEN
    RETURN NEW;
  END IF;

  -- Check bypass flag (set by transfer_room_ownership RPC)
  v_bypass := current_setting('app.transfer_in_progress', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  -- Check if caller is the room owner
  SELECT _internal.is_room_owner(NEW.room_id, auth.uid()) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the room owner can change member roles' USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION protect_member_role() FROM public, anon;

DROP TRIGGER IF EXISTS protect_member_role_change ON study_room_members;
CREATE TRIGGER protect_member_role_change
  BEFORE UPDATE OF role ON study_room_members
  FOR EACH ROW EXECUTE FUNCTION protect_member_role();
