import { supabase } from './supabase';
import type {
  StudyRoom, RoomMember, RoomMemberStatus, RoomInvite,
  RoomNotification, RoomMemberActivity,
} from '../types';

// Minimal shapes for supabase query results (the project doesn't generate
// DB types, so we cast raw rows through these interfaces instead of `any`).
interface RoomRow { id: string; owner_id: string; name: string; }
interface ProfileRow { id: string; display_name: string; username: string; avatar_url: string | null; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomInviteCode(): string {
  // 22 chars of uppercase alphanumeric — unguessable, used in invite links
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 22; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function randomRoomCode(): string {
  // Short human-typeable code, e.g. "TM-48291"
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * 26)];
  const l2 = letters[Math.floor(Math.random() * 26)];
  const num = Math.floor(10000 + Math.random() * 90000);
  return `${l1}${l2}-${num}`;
}

/** Log a Supabase error with full details for debugging. Always logs — not gated on DEV. */
function logSupabaseError(context: string, error: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[StudyRooms] ${context} failed:`, error);
  if (error && typeof error === 'object') {
    const e = error as { code?: string; message?: string; hint?: string; details?: string; table?: string };
    // eslint-disable-next-line no-console
    console.error(`[StudyRooms]   code:    ${e.code ?? '(none)'}`);
    // eslint-disable-next-line no-console
    console.error(`[StudyRooms]   message: ${e.message ?? '(none)'}`);
    // eslint-disable-next-line no-console
    console.error(`[StudyRooms]   hint:    ${e.hint ?? '(none)'}`);
    // eslint-disable-next-line no-console
    console.error(`[StudyRooms]   details: ${e.details ?? '(none)'}`);
  }
}

/** Build a user-facing error message that includes the real Supabase error, not a generic one. */
function describeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { code?: string; message?: string; hint?: string };
    const code = e.code ?? '';
    const msg = e.message ?? (error instanceof Error ? error.message : String(error));
    // RLS / permission error
    if (code === '42501') {
      return `Permission denied (RLS blocked the operation). ${msg}`;
    }
    // Unique constraint violation
    if (code === '23505') {
      return 'A room with that code already exists. Please try again.';
    }
    // Not-null violation
    if (code === '23502') {
      return `Missing required field: ${msg}`;
    }
    // Check constraint violation
    if (code === '23514') {
      return `Invalid value: ${msg}`;
    }
    // Foreign key violation
    if (code === '23503') {
      return `Referenced record not found: ${msg}`;
    }
    // If we have a message, show it
    if (msg) return msg;
  }
  if (error instanceof Error) return error.message;
  return 'Room creation failed. Please try again.';
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(input: {
  name: string;
  description?: string;
  avatar_url?: string | null;
  theme_color?: string;
  profileImage?: File | null;
}, _ownerId: string): Promise<StudyRoom> {
  // 1. Verify the user is authenticated.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to create a room.');

  // 2. Generate codes client-side (UNIQUE constraint + retry handles collisions).
  // 3. Insert the room. owner_id is set by the database DEFAULT auth.uid().
  let room: StudyRoom | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const invite_code = randomInviteCode();
    const room_code = randomRoomCode();
    const { data, error } = await supabase
      .from('study_rooms')
      .insert({
        name: input.name.trim(),
        description: (input.description || '').trim(),
        avatar_url: input.avatar_url ?? null,
        theme_color: input.theme_color || '#1B2A4A',
        invite_code,
        room_code,
      })
      .select()
      .single();
    if (error) {
      logSupabaseError('createRoom insert', error);
      // 23505 = unique_violation — collision on room_code/invite_code, retry
      if ((error as { code?: string }).code === '23505' && attempt < 2) continue;
      throw new Error(describeError(error));
    }
    room = data as StudyRoom;
    break;
  }
  if (!room) throw new Error('Room creation failed. Please try again.');

  // 3b. Upload profile image if provided
  if (input.profileImage) {
    try {
      const imageUrl = await uploadRoomProfileImage(room.id, input.profileImage);
      room = { ...room, profile_image_url: imageUrl };
    } catch (e) {
      // Image upload failure shouldn't block room creation
      console.error('Profile image upload failed:', e);
    }
  }

  // 4. Insert the creator as an approved owner member.
  //    user_id is set by DEFAULT auth.uid(); status='approved'; role='owner'.
  const { error: mErr } = await supabase
    .from('study_room_members')
    .insert({
      room_id: room.id,
      user_id: user.id,
      status: 'approved',
      role: 'owner',
      joined_at: new Date().toISOString(),
    });
  if (mErr) {
    logSupabaseError('createRoom member insert', mErr);
    // Transaction-like rollback: delete the room so we don't leave an orphan.
    await supabase.from('study_rooms').delete().eq('id', room.id);
    throw new Error(describeError(mErr));
  }

  return room;
}

export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<StudyRoom, 'name' | 'description' | 'avatar_url' | 'theme_color' | 'invite_enabled' | 'leaderboard_enabled' | 'profile_image_url'>>,
): Promise<void> {
  const { error } = await supabase.from('study_rooms').update(patch).eq('id', roomId);
  if (error) throw error;
}

export async function regenerateInviteCode(roomId: string): Promise<string> {
  const invite_code = randomInviteCode();
  const { error } = await supabase
    .from('study_rooms').update({ invite_code }).eq('id', roomId);
  if (error) throw error;
  return invite_code;
}

export async function deleteRoom(roomId: string): Promise<void> {
  // 1. Clean up the room's chat attachment files from storage (room-chat-files bucket).
  try {
    const { deleteRoomFiles } = await import('./files');
    await deleteRoomFiles(roomId);
  } catch (e) {
    logSupabaseError('deleteRoom chat storage cleanup', e);
    // Don't block room deletion if storage cleanup fails — FK CASCADE handles DB rows.
  }

  // 2. Remove the room's profile image from storage (only that room's folder).
  try {
    const { data: files } = await supabase.storage.from('room-profiles').list(roomId);
    if (files && files.length > 0) {
      const paths = files.map(f => `${roomId}/${f.name}`);
      await supabase.storage.from('room-profiles').remove(paths);
    }
  } catch (e) {
    logSupabaseError('deleteRoom storage cleanup', e);
    // Don't block room deletion if storage cleanup fails — FK CASCADE handles DB rows.
  }

  // 2. Delete the room record. FK CASCADE removes members, invites, join requests,
  //    notifications, and study sessions. Planner data is untouched (no FK to rooms).
  const { error } = await supabase.from('study_rooms').delete().eq('id', roomId);
  if (error) throw error;
}

/** Transfer room ownership to another approved member. Previous owner stays as member (or admin). */
export async function transferOwnership(roomId: string, newOwnerId: string, oldOwnerRole: 'member' | 'admin' = 'member'): Promise<void> {
  const { error } = await supabase.rpc('transfer_room_ownership', {
    p_room_id: roomId,
    p_new_owner_id: newOwnerId,
    p_old_owner_role: oldOwnerRole,
  });
  if (error) throw error;
}

/** Make a member an admin (only owner can do this). */
export async function makeAdmin(roomId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ role: 'admin' })
    .eq('room_id', roomId).eq('user_id', targetUserId);
  if (error) throw error;
}

/** Remove admin role from a member (only owner can do this). */
export async function removeAdmin(roomId: string, targetUserId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ role: 'member' })
    .eq('room_id', roomId).eq('user_id', targetUserId);
  if (error) throw error;
}

/** Rooms the current user actively belongs to (approved status only). */
export async function fetchMyRooms(): Promise<(StudyRoom & { my_status: RoomMemberStatus })[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch only rooms where the user is an approved member OR is the owner
  const { data: memberRows, error: e1 } = await supabase
    .from('study_room_members')
    .select('room_id, status')
    .eq('user_id', user.id);
  if (e1) throw e1;

  const statusByRoom = new Map<string, RoomMemberStatus>();
  for (const m of (memberRows || []) as { room_id: string; status: RoomMemberStatus }[]) {
    statusByRoom.set(m.room_id, m.status);
  }

  // Get room IDs where user is approved OR owner_id matches
  const approvedRoomIds = [...statusByRoom.entries()]
    .filter(([, status]) => status === 'approved')
    .map(([roomId]) => roomId);

  // Also fetch rooms where user is the owner
  const { data: ownedRooms, error: e2 } = await supabase
    .from('study_rooms')
    .select('id')
    .eq('owner_id', user.id);
  if (e2) throw e2;

  const ownedRoomIds = (ownedRooms || []).map(r => r.id);

  // Combine approved rooms + owned rooms (unique)
  const allRoomIds = [...new Set([...approvedRoomIds, ...ownedRoomIds])];
  if (allRoomIds.length === 0) return [];

  // Fetch details for these rooms
  const { data: rooms, error: e3 } = await supabase
    .from('study_rooms')
    .select('*')
    .in('id', allRoomIds)
    .order('updated_at', { ascending: false });
  if (e3) throw e3;

  return ((rooms || []) as StudyRoom[]).map(r => ({
    ...r,
    my_status: r.owner_id === user.id ? 'approved' : (statusByRoom.get(r.id) || 'approved'),
  }));
}

/** Fetch a single room by id (visible if owner, or pending/invited/approved member). */
export async function fetchRoomById(roomId: string): Promise<StudyRoom | null> {
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return (data as StudyRoom) || null;
}

/** Look up a room by invite code (for invite-link landing page). */
export async function fetchRoomByInviteCode(code: string): Promise<StudyRoom | null> {
  const normalized = code.trim();
  if (!normalized) return null;
  // Use ilike for case-insensitive matching (handles existing mixed-case codes)
  const { data, error } = await supabase
    .from('study_rooms').select('*').ilike('invite_code', normalized).maybeSingle();
  if (error) throw error;
  return (data as StudyRoom) || null;
}

/** Look up a room by short room code (for "join by code"). Case-insensitive, trims spaces. */
export async function fetchRoomByCode(code: string): Promise<StudyRoom | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.length > 20) return null;
  if (!/^[A-Z0-9-]+$/.test(normalized)) return null;
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('room_code', normalized).maybeSingle();
  if (error) throw error;
  return (data as StudyRoom) || null;
}

// ─── Membership ─────────────────────────────────────────────────────────────────

/** Request to join a room (creates a 'pending' member row). */
export async function requestToJoin(roomId: string, userId: string): Promise<void> {
  // Upsert: if a row already exists (e.g. previously rejected), reset to pending.
  const { error } = await supabase
    .from('study_room_members')
    .upsert(
      { room_id: roomId, user_id: userId, status: 'pending' },
      { onConflict: 'room_id,user_id' },
    );
  if (error) throw error;

  // Notify the room owner with actor info.
  const [roomResult, profileResult] = await Promise.all([
    supabase.from('study_rooms').select('owner_id, name').eq('id', roomId).single(),
    supabase.from('profiles').select('username, display_name, avatar_url').eq('id', userId).single(),
  ]);
  if (roomResult.data) {
    const r = roomResult.data as unknown as RoomRow;
    const p = profileResult.data as unknown as ProfileRow | null;
    await supabase.from('room_notifications').insert({
      user_id: r.owner_id,
      room_id: roomId,
      type: 'join_request',
      actor_user_id: userId,
      payload: {
        room_name: r.name,
        actor_username: p?.username,
        actor_display_name: p?.display_name,
        actor_avatar_url: p?.avatar_url,
      },
    });
  }
}

/** Owner approves a pending request. */
export async function approveMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ status: 'approved', joined_at: new Date().toISOString() })
    .eq('room_id', roomId).eq('user_id', userId);
  if (error) throw error;

  const { data: room } = await supabase
    .from('study_rooms').select('name').eq('id', roomId).single();
  await supabase.from('room_notifications').insert({
    user_id: userId,
    room_id: roomId,
    type: 'request_approved',
    payload: { room_name: (room as unknown as RoomRow | null)?.name || '' },
  });
}

/** Owner rejects a pending request. */
export async function rejectMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ status: 'rejected' })
    .eq('room_id', roomId).eq('user_id', userId);
  if (error) throw error;

  const { data: room } = await supabase
    .from('study_rooms').select('name').eq('id', roomId).single();
  await supabase.from('room_notifications').insert({
    user_id: userId,
    room_id: roomId,
    type: 'request_rejected',
    payload: { room_name: (room as unknown as RoomRow | null)?.name || '' },
  });
}

/** Owner removes a member. */
export async function removeMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ status: 'removed' })
    .eq('room_id', roomId).eq('user_id', userId);
  if (error) throw error;

  await supabase.from('room_notifications').insert({
    user_id: userId,
    room_id: roomId,
    type: 'member_removed',
    payload: {},
  });
}

/** A user leaves a room. */
export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update({ status: 'left' })
    .eq('room_id', roomId).eq('user_id', userId);
  if (error) throw error;
}

/** Update the current user's sharing settings for a room. */
export async function updateMySharing(
  roomId: string,
  patch: Partial<Pick<RoomMember, 'share_today' | 'share_weekly' | 'show_active_now' | 'hide_activity'>>,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to update sharing preferences.');
  const { error } = await supabase
    .from('study_room_members')
    .update(patch)
    .eq('room_id', roomId).eq('user_id', user.id);
  if (error) throw error;
}

/** Fetch my membership row for a room. */
export async function fetchMyMembership(roomId: string, userId: string): Promise<RoomMember | null> {
  const { data, error } = await supabase
    .from('study_room_members')
    .select('*')
    .eq('room_id', roomId).eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as RoomMember) || null;
}

/** Fetch all members of a room (visible to approved members + owner). Always scoped by roomId. */
export async function fetchMembers(roomId: string): Promise<RoomMember[]> {
  if (!roomId) return [];
  // Query members scoped to this specific room_id, then fetch profile data via SECURITY DEFINER RPC.
  const [{ data: members, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
    supabase.from('study_room_members')
      .select('*')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: false, nullsFirst: false }),
    supabase.rpc('get_room_member_profiles', { p_room_id: roomId }),
  ]);
  if (e1) {
    logSupabaseError('fetchMembers members', e1);
    throw e1;
  }
  if (e2) {
    logSupabaseError('fetchMembers profiles RPC', e2);
    // Don't fail entirely on profile error — return members with empty profiles
  }

  const profById = new Map<string, { id: string; display_name: string; username: string; avatar_url: string | null }>(
    (profiles || []).map(p => [(p as { id: string }).id, p as { id: string; display_name: string; username: string; avatar_url: string | null }])
  );
  return ((members || []) as RoomMember[]).map(m => ({
    ...m,
    display_name: profById.get(m.user_id)?.display_name || '',
    username: profById.get(m.user_id)?.username || '',
    avatar_url: profById.get(m.user_id)?.avatar_url ?? null,
  }));
}

// ─── Activity (shared) ─────────────────────────────────────────────────────────

/** Approved members' activity minutes for 'today' or 'week'. */
export async function fetchRoomActivity(
  roomId: string,
  period: 'today' | 'week',
): Promise<RoomMemberActivity[]> {
  const { data, error } = await supabase.rpc('study_room_members_activity', {
    p_room_id: roomId,
    p_period: period,
  });
  if (error) throw error;
  return (data || []) as RoomMemberActivity[];
}

// ─── Username invitations ──────────────────────────────────────────────────────

/** Search user by username (exact, case-insensitive). Returns limited profile info. */
export async function searchUserByUsername(username: string): Promise<{
  id: string; username: string; display_name: string; avatar_url: string | null;
} | null> {
  const normalized = username.trim();
  if (!normalized) return null;
  if (normalized.length > 24) return null;
  if (!/^[A-Za-z0-9_.]+$/.test(normalized)) return null;
  const { data, error } = await supabase
    .rpc('search_profile_by_username', { p_username: normalized });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as { id: string; username: string; display_name: string; avatar_url: string | null };
}

/** Owner invites a user by username. Creates an 'invited' member row + invite record + notification. */
export async function inviteByUsername(
  roomId: string,
  inviteeUserId: string,
  inviterUserId: string,
): Promise<void> {
  // Upsert member row as 'invited'.
  const { error: mErr } = await supabase
    .from('study_room_members')
    .upsert(
      { room_id: roomId, user_id: inviteeUserId, status: 'invited' },
      { onConflict: 'room_id,user_id' },
    );
  if (mErr) throw mErr;

  const { error: iErr } = await supabase
    .from('study_room_invites')
    .upsert(
      { room_id: roomId, invitee_user_id: inviteeUserId, inviter_user_id: inviterUserId, status: 'sent' },
      { onConflict: 'room_id,invitee_user_id' },
    );
  if (iErr) throw iErr;

  const { data: room } = await supabase
    .from('study_rooms').select('name').eq('id', roomId).single();

  await supabase.from('room_notifications').insert({
    user_id: inviteeUserId,
    room_id: roomId,
    type: 'room_invited',
    actor_user_id: inviterUserId,
    payload: { room_name: (room as unknown as RoomRow | null)?.name || '' },
  });
}

/** Invited user accepts an invitation. */
export async function acceptInvite(roomId: string, userId: string): Promise<void> {
  const { error: mErr } = await supabase
    .from('study_room_members')
    .update({ status: 'approved', joined_at: new Date().toISOString() })
    .eq('room_id', roomId).eq('user_id', userId);
  if (mErr) throw mErr;

  await supabase
    .from('study_room_invites')
    .update({ status: 'accepted' })
    .eq('room_id', roomId).eq('invitee_user_id', userId);

  const { data: room } = await supabase
    .from('study_rooms').select('owner_id, name').eq('id', roomId).single();
  if (room) {
    const r = room as unknown as RoomRow;
    await supabase.from('room_notifications').insert({
      user_id: r.owner_id,
      room_id: roomId,
      type: 'invite_accepted',
      actor_user_id: userId,
      payload: { room_name: r.name },
    });
  }
}

/** Invited user declines an invitation. */
export async function declineInvite(roomId: string, userId: string): Promise<void> {
  await supabase
    .from('study_room_members')
    .update({ status: 'declined' })
    .eq('room_id', roomId).eq('user_id', userId);

  await supabase
    .from('study_room_invites')
    .update({ status: 'declined' })
    .eq('room_id', roomId).eq('invitee_user_id', userId);
}

/** Fetch invitations sent to the current user (pending). Always scoped by userId. */
export async function fetchMyInvites(userId: string): Promise<(RoomInvite & { room_name?: string; inviter_name?: string })[]> {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('study_room_invites')
    .select('*')
    .eq('invitee_user_id', userId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  if (error) {
    logSupabaseError('fetchMyInvites', error);
    throw error;
  }

  const invites = (data || []) as RoomInvite[];
  if (invites.length === 0) return [];

  const roomIds = [...new Set(invites.map(i => i.room_id))];
  const { data: rooms } = await supabase.from('study_rooms').select('id, name').in('id', roomIds);
  const roomById = new Map<string, string>((rooms || []).map((r) => [(r as unknown as RoomRow).id, (r as unknown as RoomRow).name]));

  // Inviter names: we'll use a simple approach - just show 'Someone' for now
  // since profiles RLS prevents cross-user lookups

  return invites.map(i => ({
    ...i,
    room_name: roomById.get(i.room_id) || '',
    inviter_name: 'Someone',
  }));
}

// ─── Notifications ─────────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<RoomNotification[]> {
  const { data, error } = await supabase
    .from('room_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as RoomNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('room_notifications').update({ read: true }).eq('id', id);
  if (error) throw error;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('room_notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase.from('room_notifications').delete().eq('id', id);
  if (error) throw error;
}

/** Count of unread notifications. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('room_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  if (error) throw error;
  return count || 0;
}

// ─── Study Timer / Focus Timer ─────────────────────────────────────────────────

export type SessionStatus = 'running' | 'paused' | 'ended';

export interface StudySession {
  id: string;
  room_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: SessionStatus;
  paused_at: string | null;
  accumulated_seconds: number;
  created_at: string;
}

export interface MemberTimerSummary {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: SessionStatus;
  is_studying: boolean;
  today_seconds: number;
  week_seconds: number;
  active_started_at: string | null;
  active_accumulated_seconds: number;
  finished_for_day: boolean;
}

/** Start a study timer for the current user in a room. Creates a new session with status='running'. */
export async function startStudySession(roomId: string, _userId: string): Promise<StudySession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to start a timer.');

  const { data, error } = await supabase
    .from('room_study_sessions')
    .insert({ room_id: roomId, user_id: user.id, status: 'running', accumulated_seconds: 0 })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('You already have an active timer in this room.');
    throw error;
  }
  return data as StudySession;
}

/** Pause the running timer. Keeps accumulated time. */
export async function pauseStudySession(roomId: string, _userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  // Find the running session
  const { data: active, error: findErr } = await supabase
    .from('room_study_sessions')
    .select('id, started_at, accumulated_seconds')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .eq('status', 'running')
    .maybeSingle();
  if (findErr) throw findErr;
  if (!active) throw new Error('No running timer found.');

  // Calculate current accumulated time
  const now = new Date();
  const start = new Date(active.started_at);
  const newAccumulated = (active.accumulated_seconds || 0) + Math.floor((now.getTime() - start.getTime()) / 1000);

  // Update to paused with accumulated time
  const { error: updateErr } = await supabase
    .from('room_study_sessions')
    .update({
      status: 'paused',
      paused_at: now.toISOString(),
      accumulated_seconds: newAccumulated,
    })
    .eq('id', active.id);
  if (updateErr) throw updateErr;
}

/** Resume a paused timer. Starts a new segment from now. */
export async function resumeStudySession(roomId: string, _userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  // Find the paused session
  const { data: paused, error: findErr } = await supabase
    .from('room_study_sessions')
    .select('id, accumulated_seconds')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .eq('status', 'paused')
    .maybeSingle();
  if (findErr) throw findErr;
  if (!paused) throw new Error('No paused timer found.');

  // Update to running with a new started_at (keeping accumulated_seconds)
  const { error: updateErr } = await supabase
    .from('room_study_sessions')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
      paused_at: null,
    })
    .eq('id', paused.id);
  if (updateErr) throw updateErr;
}

/** End study for today. Finalizes the session with total time. */
export async function endStudySession(roomId: string, _userId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in.');

  // Find any active session (running or paused)
  const { data: active, error: findErr } = await supabase
    .from('room_study_sessions')
    .select('id, started_at, status, accumulated_seconds')
    .eq('room_id', roomId)
    .eq('user_id', user.id)
    .in('status', ['running', 'paused'])
    .maybeSingle();
  if (findErr) throw findErr;
  if (!active) return; // No active session, nothing to end

  let totalSeconds = active.accumulated_seconds || 0;

  // If running, add current segment time
  if (active.status === 'running') {
    const now = new Date();
    const start = new Date(active.started_at);
    totalSeconds += Math.floor((now.getTime() - start.getTime()) / 1000);
  }

  // Mark as ended with total duration
  const { error: updateErr } = await supabase
    .from('room_study_sessions')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      duration_seconds: totalSeconds,
    })
    .eq('id', active.id);
  if (updateErr) throw updateErr;
}

/** Get the current user's active session in a room (if any). Handles errors gracefully. */
export async function getMyActiveSession(roomId: string, _userId: string): Promise<StudySession | null> {
  if (!roomId) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('room_study_sessions')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .in('status', ['running', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logSupabaseError('getMyActiveSession', error);
      return null;
    }
    return (data as StudySession) || null;
  } catch (e) {
    logSupabaseError('getMyActiveSession', e);
    return null;
  }
}

/** Get timer summaries for all approved members in a room. Handles errors gracefully. */
export async function getRoomTimerSummaries(roomId: string): Promise<MemberTimerSummary[]> {
  if (!roomId) return [];

  try {
    // 1. Fetch approved members
    const members = await fetchMembers(roomId);
    const approved = members.filter(m => m.status === 'approved');
    if (approved.length === 0) return [];

    // 2. Fetch all sessions for this room (RLS allows approved members to see all)
    const { data: sessions, error } = await supabase
      .from('room_study_sessions')
      .select('user_id, started_at, ended_at, duration_seconds, status, accumulated_seconds, paused_at')
      .eq('room_id', roomId);
    if (error) {
      logSupabaseError('getRoomTimerSummaries sessions', error);
      // Return empty summaries on error instead of crashing
      return approved.map(m => ({
        user_id: m.user_id,
        username: m.username || '',
        display_name: m.display_name || '',
        avatar_url: m.avatar_url,
        status: 'ended' as SessionStatus,
        is_studying: false,
        today_seconds: 0,
        week_seconds: 0,
        active_started_at: null,
        finished_for_day: false,
      }));
    }

    // 3. Compute today and week totals per user
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const summaries: MemberTimerSummary[] = approved.map(m => {
      const userSessions = (sessions || []).filter(s => s.user_id === m.user_id);
      const activeSession = userSessions.find(s => (s.status === 'running' || s.status === 'paused'));

      let todaySeconds = 0;
      let weekSeconds = 0;

      for (const s of userSessions) {
        const sessStatus = s.status as SessionStatus;
        let sessionSeconds = s.duration_seconds || 0;

        // If running/paused, calculate current time
        if (sessStatus === 'running' && s.started_at) {
          const start = new Date(s.started_at);
          sessionSeconds = (s.accumulated_seconds || 0) + Math.floor((now.getTime() - start.getTime()) / 1000);
        } else if (sessStatus === 'paused') {
          sessionSeconds = s.accumulated_seconds || 0;
        }

        // Check if session belongs to today/week
        const sessionEnd = s.ended_at ? new Date(s.ended_at) : now;
        const sessionStart = new Date(s.started_at);

        // For today: if session ended or was active today
        if (sessionEnd >= startOfToday || sessionStart >= startOfToday) {
          todaySeconds += sessionSeconds;
        }
        if (sessionEnd >= startOfWeek || sessionStart >= startOfWeek) {
          weekSeconds += sessionSeconds;
        }
      }

      const status: SessionStatus = activeSession?.status || 'ended';
      const finishedForDay = userSessions.some(s => s.status === 'ended' && new Date(s.ended_at || '') >= startOfToday);

      return {
        user_id: m.user_id,
        username: m.username || '',
        display_name: m.display_name || '',
        avatar_url: m.avatar_url,
        status,
        is_studying: status === 'running',
        today_seconds: todaySeconds,
        week_seconds: weekSeconds,
        active_started_at: activeSession?.started_at || null,
        active_accumulated_seconds: activeSession?.accumulated_seconds || 0,
        finished_for_day: finishedForDay && !activeSession,
      };
    });

    return summaries;
  } catch (e) {
    logSupabaseError('getRoomTimerSummaries', e);
    return [];
  }
}

// ─── Room Profile Image ────────────────────────────────────────────────────────

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

/** Upload a room profile image to Supabase Storage. Returns the public URL. */
export async function uploadRoomProfileImage(roomId: string, file: File): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE) throw new Error('Image file is too large. Maximum 5 MB.');
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error('Unsupported image format. Use PNG, JPG, or WEBP.');

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const path = `${roomId}/profile-image.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('room-profiles')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;

  const { data: urlData } = supabase.storage
    .from('room-profiles')
    .getPublicUrl(path);

  // Save the URL to the room record
  const { error: dbErr } = await supabase
    .from('study_rooms')
    .update({ profile_image_url: urlData.publicUrl })
    .eq('id', roomId);
  if (dbErr) throw dbErr;

  return urlData.publicUrl;
}

/** Remove a room profile image from Storage and clear the DB field. */
export async function removeRoomProfileImage(roomId: string): Promise<void> {
  // List files in the room's folder and remove them
  const { data: files, error: listErr } = await supabase.storage
    .from('room-profiles')
    .list(roomId);
  if (!listErr && files && files.length > 0) {
    const paths = files.map(f => `${roomId}/${f.name}`);
    await supabase.storage.from('room-profiles').remove(paths);
  }

  // Clear the DB field
  const { error: dbErr } = await supabase
    .from('study_rooms')
    .update({ profile_image_url: null })
    .eq('id', roomId);
  if (dbErr) throw dbErr;
}
