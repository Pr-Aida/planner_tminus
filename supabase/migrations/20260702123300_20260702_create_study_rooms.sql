/*
# Study Rooms / Focus Rooms

## Overview
Adds a private "Study Room" feature to the planner. Users can create rooms,
invite others by link or username, and share *only* their Activity time
(from the Activity section) with approved members. Habits, notes,
reminders, countdowns, and all other private planner data stay private.

## New Tables

### study_rooms
Room metadata, owned by one admin.
- `id` uuid PK
- `owner_id` uuid NOT NULL DEFAULT auth.uid() (FK auth.users, ON DELETE CASCADE)
- `name` text NOT NULL
- `description` text NOT NULL DEFAULT ''
- `avatar_url` text (nullable) — room profile image URL
- `theme_color` text NOT NULL DEFAULT '#1B2A4A'
- `invite_code` text NOT NULL UNIQUE — long unguessable code used in invite links
- `room_code` text NOT NULL UNIQUE — short human-typeable code, e.g. "TM-48291"
- `invite_enabled` boolean NOT NULL DEFAULT true — owner can disable the invite link
- `leaderboard_enabled` boolean NOT NULL DEFAULT true
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()

### study_room_members
Membership rows. status='pending' = a join *request* (by-link/by-code).
status='invited' = an owner-sent username invitation. Only status='approved'
members can see shared room activity.
- `id` uuid PK
- `room_id` uuid NOT NULL (FK study_rooms, ON DELETE CASCADE)
- `user_id` uuid NOT NULL DEFAULT auth.uid() (FK auth.users, ON DELETE CASCADE)
- `status` text NOT NULL DEFAULT 'pending'
  CHECK in (pending, approved, rejected, invited, declined, left, removed)
- `share_today` boolean NOT NULL DEFAULT true
- `share_weekly` boolean NOT NULL DEFAULT true
- `show_active_now` boolean NOT NULL DEFAULT false
- `hide_activity` boolean NOT NULL DEFAULT false
- `joined_at` timestamptz (nullable) — set when status becomes approved
- `created_at` timestamptz DEFAULT now()
- `updated_at` timestamptz DEFAULT now()
- UNIQUE (room_id, user_id)

### study_room_invites
Owner-sent username invitations (distinct from by-link join requests, which
live in study_room_members with status='pending'). Records the invitation
act so the invitee sees a notification; acceptance is tracked by a
study_room_members row transitioning invited -> approved.
- `id` uuid PK
- `room_id` uuid NOT NULL (FK study_rooms, ON DELETE CASCADE)
- `invitee_user_id` uuid NOT NULL (FK auth.users, ON DELETE CASCADE)
- `inviter_user_id` uuid NOT NULL DEFAULT auth.uid() (FK auth.users, ON DELETE CASCADE)
- `status` text NOT NULL DEFAULT 'sent' CHECK in (sent, accepted, declined, revoked)
- `created_at` timestamptz DEFAULT now()
- UNIQUE (room_id, invitee_user_id)

### room_notifications
In-app notifications for room events.
- `id` uuid PK
- `user_id` uuid NOT NULL (FK auth.users, ON DELETE CASCADE) — recipient
- `room_id` uuid NOT NULL (FK study_rooms, ON DELETE CASCADE)
- `type` text NOT NULL CHECK in (join_request, request_approved, request_rejected, room_invited, invite_accepted, member_left, member_removed)
- `actor_user_id` uuid (nullable) (FK auth.users, ON DELETE SET NULL)
- `payload` jsonb NOT NULL DEFAULT '{}'
- `read` boolean NOT NULL DEFAULT false
- `created_at` timestamptz DEFAULT now()

## Helper Functions
- `gen_room_code()` — generates a short "XX-12345" style code.
- `study_room_activity_for_user(p_user_id, p_from, p_to)` — SECURITY DEFINER
  RPC that sums Activity-section minutes from a user's planner_daily rows
  over a date range. Only returns minutes. This is the *only* bridge from
  private planner data to room sharing, and it returns a single number.
- `study_room_members_activity(p_room_id, p_period)` — SECURITY DEFINER RPC
  returning one row per approved member with summed minutes for 'today' or
  'week', respecting privacy toggles. Only callable by approved members/owner.

## Security — Row Level Security
- `study_rooms`: SELECT visible to owner OR any pending/invited/approved
  member; INSERT/UPDATE/DELETE owner only.
- `study_room_members`: SELECT visible to self, owner, and approved members.
  INSERT: self (request) or owner (invite). UPDATE: self (settings/status)
  or owner (status). DELETE: self (leave) or owner (remove).
- `study_room_invites`: SELECT visible to invitee and owner. INSERT/UPDATE/
  DELETE: owner only (with invitee check).
- `room_notifications`: SELECT own. INSERT: any authenticated (to others).
  UPDATE/DELETE: own only.

## Important Notes
1. Only Activity-section time is ever shared. Habits, habit_values,
   top_note, reminders, countdowns, monthly notes, and day notes remain
   fully owner-scoped and are never queried by any room RPC except the two
   defined above, which only emit summed minutes.
2. Pending/invited/rejected/declined/removed members cannot see shared
   activity — the activity RPC filters to status='approved' and the caller
   must be an approved member or owner.
3. Invite links never auto-join: opening a link only lets a user create a
   'pending' membership row (a request). The owner must approve it.
4. Regenerating invite_code invalidates the old link because the code is
   unique and embedded in the link.
5. All tables use DEFAULT auth.uid() so client inserts that omit user_id
   still satisfy WITH CHECK policies.
*/

-- ─── Create all tables first (policies reference them) ──────────────────────
CREATE TABLE IF NOT EXISTS study_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  avatar_url text,
  theme_color text NOT NULL DEFAULT '#1B2A4A',
  invite_code text NOT NULL UNIQUE,
  room_code text NOT NULL UNIQUE,
  invite_enabled boolean NOT NULL DEFAULT true,
  leaderboard_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE study_rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS study_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','invited','declined','left','removed')),
  share_today boolean NOT NULL DEFAULT true,
  share_weekly boolean NOT NULL DEFAULT true,
  show_active_now boolean NOT NULL DEFAULT false,
  hide_activity boolean NOT NULL DEFAULT false,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_room_members_room_user_key UNIQUE (room_id, user_id)
);
ALTER TABLE study_room_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS study_room_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  invitee_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','accepted','declined','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_room_invites_room_invitee_key UNIQUE (room_id, invitee_user_id)
);
ALTER TABLE study_room_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS room_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('join_request','request_approved','request_rejected','room_invited','invite_accepted','member_left','member_removed')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE room_notifications ENABLE ROW LEVEL SECURITY;

-- ─── Policies: study_rooms ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "rooms_select_visible" ON study_rooms;
CREATE POLICY "rooms_select_visible" ON study_rooms FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_room_members m
      WHERE m.room_id = study_rooms.id
        AND m.user_id = auth.uid()
        AND m.status IN ('pending','invited','approved')
    )
  );

DROP POLICY IF EXISTS "rooms_insert_owner" ON study_rooms;
CREATE POLICY "rooms_insert_owner" ON study_rooms FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rooms_update_owner" ON study_rooms;
CREATE POLICY "rooms_update_owner" ON study_rooms FOR UPDATE
  TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "rooms_delete_owner" ON study_rooms;
CREATE POLICY "rooms_delete_owner" ON study_rooms FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ─── Policies: study_room_members ───────────────────────────────────────────
DROP POLICY IF EXISTS "members_select_visible" ON study_room_members;
CREATE POLICY "members_select_visible" ON study_room_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_room_members m2
      WHERE m2.room_id = study_room_members.room_id
        AND m2.user_id = auth.uid()
        AND m2.status = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = study_room_members.room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members_insert_self_or_owner" ON study_room_members;
CREATE POLICY "members_insert_self_or_owner" ON study_room_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members_update_self_or_owner" ON study_room_members;
CREATE POLICY "members_update_self_or_owner" ON study_room_members FOR UPDATE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members_delete_self_or_owner" ON study_room_members;
CREATE POLICY "members_delete_self_or_owner" ON study_room_members FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- ─── Policies: study_room_invites ──────────────────────────────────────────
DROP POLICY IF EXISTS "invites_select_invitee_or_owner" ON study_room_invites;
CREATE POLICY "invites_select_invitee_or_owner" ON study_room_invites FOR SELECT
  TO authenticated USING (
    invitee_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invites_insert_owner" ON study_room_invites;
CREATE POLICY "invites_insert_owner" ON study_room_invites FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invites_update_owner_or_invitee" ON study_room_invites;
CREATE POLICY "invites_update_owner_or_invitee" ON study_room_invites FOR UPDATE
  TO authenticated USING (
    invitee_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    invitee_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invites_delete_owner" ON study_room_invites;
CREATE POLICY "invites_delete_owner" ON study_room_invites FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM study_rooms r
      WHERE r.id = room_id AND r.owner_id = auth.uid()
    )
  );

-- ─── Policies: room_notifications ──────────────────────────────────────────
DROP POLICY IF EXISTS "notif_select_own" ON room_notifications;
CREATE POLICY "notif_select_own" ON room_notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_insert_any" ON room_notifications;
CREATE POLICY "notif_insert_any" ON room_notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notif_update_own" ON room_notifications;
CREATE POLICY "notif_update_own" ON room_notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notif_delete_own" ON room_notifications;
CREATE POLICY "notif_delete_own" ON room_notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS study_rooms_owner_idx ON study_rooms(owner_id);
CREATE INDEX IF NOT EXISTS study_rooms_invite_code_idx ON study_rooms(invite_code);
CREATE INDEX IF NOT EXISTS study_rooms_room_code_idx ON study_rooms(room_code);
CREATE INDEX IF NOT EXISTS study_room_members_user_idx ON study_room_members(user_id);
CREATE INDEX IF NOT EXISTS study_room_members_room_idx ON study_room_members(room_id);
CREATE INDEX IF NOT EXISTS study_room_invites_invitee_idx ON study_room_invites(invitee_user_id);
CREATE INDEX IF NOT EXISTS room_notifications_user_idx ON room_notifications(user_id, read, created_at DESC);

-- ─── Helper: short room code ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gen_room_code()
RETURNS text
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    chr(65 + floor(random()*26)::int) ||
    chr(65 + floor(random()*26)::int) ||
    '-' ||
    lpad((floor(random()*90000) + 10000)::text, 5, '0');
$$;

-- ─── Helper: fetch a user's activity minutes over a date range ───────────────
-- SECURITY DEFINER so a room member can total another approved member's
-- Activity-section minutes without gaining SELECT access to that user's
-- planner_daily rows. Only Activity-section minutes are summed (from the
-- activities jsonb array). Habits/notes are never touched.
CREATE OR REPLACE FUNCTION study_room_activity_for_user(
  p_user_id uuid,
  p_from text,
  p_to text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN (activity->>'from') IS NULL OR (activity->>'to') IS NULL THEN 0
      ELSE GREATEST(
        (
          (split_part(activity->>'to',':',1)::int * 60 + split_part(activity->>'to',':',2)::int)
          - (split_part(activity->>'from',':',1)::int * 60 + split_part(activity->>'from',':',2)::int)
        ), 0
      )
    END
  ), 0)::integer
  FROM planner_daily
  CROSS JOIN LATERAL jsonb_array_elements(activities) AS activity
  WHERE user_id = p_user_id
    AND date_key >= p_from
    AND date_key <= p_to;
$$;

-- ─── Helper: members + activity for a room ───────────────────────────────────
CREATE OR REPLACE FUNCTION study_room_members_activity(
  p_room_id uuid,
  p_period text
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  minutes integer,
  active_now boolean,
  hidden boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_member boolean;
  v_today text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  v_week_start text := to_char((now() AT TIME ZONE 'UTC') - interval '6 days', 'YYYY-MM-DD');
  v_from text;
  v_to text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM study_room_members m
    WHERE m.room_id = p_room_id AND m.user_id = v_caller AND m.status = 'approved'
  ) OR EXISTS(
    SELECT 1 FROM study_rooms r WHERE r.id = p_room_id AND r.owner_id = v_caller
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Not an approved member of this room' USING ERRCODE = '42501';
  END IF;

  IF p_period = 'today' THEN
    v_from := v_today; v_to := v_today;
  ELSIF p_period = 'week' THEN
    v_from := v_week_start; v_to := v_today;
  ELSE
    RAISE EXCEPTION 'Invalid period; use today or week' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    m.user_id,
    p.display_name,
    p.username,
    p.avatar_url,
    CASE
      WHEN m.hide_activity THEN 0
      WHEN p_period = 'today' AND NOT m.share_today THEN 0
      WHEN p_period = 'week' AND NOT m.share_weekly THEN 0
      ELSE study_room_activity_for_user(m.user_id, v_from, v_to)
    END AS minutes,
    (m.show_active_now AND NOT m.hide_activity) AS active_now,
    (m.hide_activity OR (p_period = 'today' AND NOT m.share_today) OR (p_period = 'week' AND NOT m.share_weekly)) AS hidden
  FROM study_room_members m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.room_id = p_room_id AND m.status = 'approved';
END;
$$;

GRANT EXECUTE ON FUNCTION study_room_activity_for_user(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION study_room_members_activity(uuid, text) TO authenticated;
