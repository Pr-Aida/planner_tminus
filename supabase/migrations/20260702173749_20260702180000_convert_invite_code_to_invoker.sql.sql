/*
# Security hardening: convert get_room_by_invite_code to SECURITY INVOKER

## Rationale
get_room_by_invite_code reads from study_rooms, which already has strict RLS:
  rooms_select_visible = owner OR approved/pending/invited member OR invite_enabled=true

Since the RLS policy already gates access to invite-enabled rooms (and rooms the
caller owns/belongs to), the function does not need to bypass RLS. Converting to
SECURITY INVOKER makes it run under the caller's own privileges, which is safer
and eliminates the Security Audit "SECURITY DEFINER function" warning for it.

The function already has:
  - SET search_path = public, pg_temp
  - EXECUTE revoked from public/anon, granted to authenticated only
  - Returns only safe room preview fields (no members, timer, or private data)
  - Internal invite_enabled check

## Remaining SECURITY DEFINER functions (by design)
These must stay DEFINER because they are called inside RLS policies (helpers)
or contain authorization checks that need to read member tables without
recursing through the very policies that call them:

  - is_room_owner          — called in RLS policies on study_rooms, members, invites,
                             join_requests, room_notifications, room_study_sessions.
                             Converting to INVOKER would cause infinite recursion.
  - is_room_member          — same reason.
  - is_approved_member_or_owner — same reason.
  - get_room_member_profiles — SECURITY DEFINER to read profiles table (owner-scoped
                             RLS would otherwise block reading other members' profiles).
                             Has internal auth check: caller must be approved member/owner.
  - study_room_activity_for_user — SECURITY DEFINER to read planner_daily (owner-scoped
                             RLS). Has internal auth check: caller must be the user or
                             an approved co-member/owner.
  - study_room_members_activity — SECURITY DEFINER, calls study_room_activity_for_user.
                             Has internal auth check: caller must be approved member/owner.
  - search_profile_by_username — SECURITY DEFINER to read profiles table. Returns only
                             safe fields (id, username, display_name, avatar_url).

All remain with search_path = public, pg_temp, EXECUTE granted to authenticated only
(public/anon revoked), and internal authorization checks where they return data.

## No data changes
No tables, columns, RLS policies, or data are modified. Only the security attribute
of one function changes.
*/

DROP FUNCTION IF EXISTS get_room_by_invite_code(text);

CREATE OR REPLACE FUNCTION get_room_by_invite_code(p_code text)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  avatar_url text,
  profile_image_url text,
  theme_color text,
  invite_code text,
  room_code text,
  invite_enabled boolean,
  leaderboard_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.owner_id, r.name, r.description, r.avatar_url, r.profile_image_url,
         r.theme_color, r.invite_code, r.room_code, r.invite_enabled, r.leaderboard_enabled,
         r.created_at, r.updated_at
  FROM study_rooms r
  WHERE UPPER(r.invite_code) = UPPER(trim(p_code))
    AND (
      r.invite_enabled = true
      OR r.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM study_room_members m
        WHERE m.room_id = r.id AND m.user_id = auth.uid()
          AND m.status IN ('pending','invited','approved')
      )
    );
$$;

-- Preserve grants: authenticated only (public/anon already revoked, but be explicit)
REVOKE EXECUTE ON FUNCTION get_room_by_invite_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_room_by_invite_code(text) TO authenticated;
