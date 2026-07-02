-- ============================================================
-- Fix Security Audit Warnings
-- 1. Move protect_member_role trigger function to _internal schema
-- 2. Convert transfer_room_ownership to SECURITY INVOKER
-- ============================================================

-- 1. Move protect_member_role to _internal schema
-- Trigger functions don't need to be in public or callable as RPC

-- Drop the existing trigger
DROP TRIGGER IF EXISTS protect_member_role_change ON public.study_room_members;

-- Drop the public function
DROP FUNCTION IF EXISTS public.protect_member_role();

-- Recreate in _internal schema (SECURITY DEFINER is appropriate for trigger functions)
CREATE OR REPLACE FUNCTION _internal.protect_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- Recreate the trigger pointing to _internal function
CREATE TRIGGER protect_member_role_change
  BEFORE UPDATE OF role ON public.study_room_members
  FOR EACH ROW EXECUTE FUNCTION _internal.protect_member_role();

-- Revoke direct EXECUTE from authenticated (trigger functions don't need it)
REVOKE EXECUTE ON FUNCTION _internal.protect_member_role() FROM authenticated;

-- 2. Convert transfer_room_ownership to SECURITY INVOKER
-- This requires fixing the rooms_update_owner WITH CHECK policy
-- to allow the current owner to change owner_id (needed for transfer)

-- Drop and recreate the UPDATE policy on study_rooms
DROP POLICY IF EXISTS rooms_update_owner ON public.study_rooms;

CREATE POLICY rooms_update_owner ON public.study_rooms
  FOR UPDATE TO authenticated
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
    -- Current owner can change anything (including owner_id for transfers)
    (SELECT s.owner_id FROM study_rooms s WHERE s.id = study_rooms.id) = auth.uid()
    OR (
      -- Admin can update other fields but must NOT change owner_id
      study_rooms.owner_id = (SELECT s.owner_id FROM study_rooms s WHERE s.id = study_rooms.id)
      AND EXISTS (
        SELECT 1 FROM study_room_members m
        WHERE m.room_id = study_rooms.id
          AND m.user_id = auth.uid()
          AND m.role = 'admin'
          AND m.status = 'approved'
      )
    )
  );

-- Recreate transfer_room_ownership as SECURITY INVOKER
-- RLS policies now safely allow only the current owner to perform the transfer
DROP FUNCTION IF EXISTS public.transfer_room_ownership(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.transfer_room_ownership(
  p_room_id uuid,
  p_new_owner_id uuid,
  p_old_owner_role text DEFAULT 'member'
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 5. Atomic transfer (RLS allows this because caller is current owner)
  UPDATE study_rooms SET owner_id = p_new_owner_id, updated_at = now()
  WHERE id = p_room_id;

  UPDATE study_room_members
  SET role = 'owner', status = 'approved', updated_at = now()
  WHERE room_id = p_room_id AND user_id = p_new_owner_id;

  UPDATE study_room_members
  SET role = v_old_role, updated_at = now()
  WHERE room_id = p_room_id AND user_id = v_current_owner;
END;
$function$;

-- Revoke EXECUTE from anon (keep for authenticated since frontend calls via RPC)
REVOKE EXECUTE ON FUNCTION public.transfer_room_ownership(uuid, uuid, text) FROM anon;
