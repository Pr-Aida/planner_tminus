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
  // 22 chars of base62 — unguessable, used in invite links
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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
  const { error } = await supabase.from('study_rooms').delete().eq('id', roomId);
  if (error) throw error;
}

/** Transfer room ownership to another approved member, then demote self to admin. */
export async function transferOwnership(roomId: string, newOwnerId: string): Promise<void> {
  // 1. Set the new owner on the room (only current owner can do this — RLS).
  const { error: rErr } = await supabase
    .from('study_rooms')
    .update({ owner_id: newOwnerId })
    .eq('id', roomId);
  if (rErr) throw rErr;

  // 2. Set the new owner's member role to 'owner' and status to 'approved'.
  const { error: mErr } = await supabase
    .from('study_room_members')
    .update({ role: 'owner', status: 'approved' })
    .eq('room_id', roomId).eq('user_id', newOwnerId);
  if (mErr) throw mErr;

  // 3. Demote the current user (the old owner) to 'admin' member.
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { error: oldErr } = await supabase
      .from('study_room_members')
      .update({ role: 'admin' })
      .eq('room_id', roomId).eq('user_id', user.id);
    if (oldErr) throw oldErr;
  }
}

/** Rooms the current user actively belongs to (approved status only in list; pending shown separately). */
export async function fetchMyRooms(): Promise<(StudyRoom & { my_status: RoomMemberStatus })[]> {
  const [{ data: rooms, error: e1 }, { data: memberRows, error: e2 }] = await Promise.all([
    supabase.from('study_rooms').select('*').order('updated_at', { ascending: false }),
    supabase.from('study_room_members').select('room_id, status'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const statusByRoom = new Map<string, RoomMemberStatus>();
  for (const m of (memberRows || []) as RoomMember[]) {
    statusByRoom.set(m.room_id, m.status);
  }

  // Only show rooms where status is approved (or owner — owner_id check as fallback)
  // Filter out left / rejected / removed / declined
  const ACTIVE_STATUSES = new Set<RoomMemberStatus>(['approved', 'pending', 'invited']);
  return ((rooms || []) as StudyRoom[])
    .map(r => ({
      ...r,
      my_status: (statusByRoom.get(r.id) || 'approved') as RoomMemberStatus,
    }))
    .filter(r => ACTIVE_STATUSES.has(r.my_status));
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
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('invite_code', normalized).maybeSingle();
  if (error) throw error;
  return (data as StudyRoom) || null;
}

/** Look up a room by short room code (for "join by code"). Case-insensitive, trims spaces. */
export async function fetchRoomByCode(code: string): Promise<StudyRoom | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
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

  // Notify the room owner.
  const { data: room } = await supabase
    .from('study_rooms').select('owner_id, name').eq('id', roomId).single();
  if (room) {
    const r = room as unknown as RoomRow;
    await supabase.from('room_notifications').insert({
      user_id: r.owner_id,
      room_id: roomId,
      type: 'join_request',
      actor_user_id: userId,
      payload: { room_name: r.name },
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
  userId: string,
  patch: Partial<Pick<RoomMember, 'share_today' | 'share_weekly' | 'show_active_now' | 'hide_activity'>>,
): Promise<void> {
  const { error } = await supabase
    .from('study_room_members')
    .update(patch)
    .eq('room_id', roomId).eq('user_id', userId);
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

/** Fetch all members of a room (visible to approved members + owner). */
export async function fetchMembers(roomId: string): Promise<RoomMember[]> {
  // Query members, then use the SECURITY DEFINER RPC to get safe profile fields.
  // This avoids the profiles RLS issue (profiles SELECT only allows auth.uid() = id).
  const [{ data: members, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
    supabase.from('study_room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: false, nullsFirst: false }),
    supabase.rpc('get_room_member_profiles', { p_room_id: roomId }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

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

/** Fetch invitations sent to the current user (pending). */
export async function fetchMyInvites(userId: string): Promise<(RoomInvite & { room_name?: string; inviter_name?: string })[]> {
  const { data, error } = await supabase
    .from('study_room_invites')
    .select('*')
    .eq('invitee_user_id', userId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const invites = (data || []) as RoomInvite[];
  if (invites.length === 0) return [];

  const roomIds = [...new Set(invites.map(i => i.room_id))];
  const inviterIds = [...new Set(invites.map(i => i.inviter_user_id))];
  const [{ data: rooms }, { data: profs }] = await Promise.all([
    supabase.from('study_rooms').select('id, name').in('id', roomIds),
    supabase.from('profiles').select('id, display_name').in('id', inviterIds),
  ]);
  const roomById = new Map<string, string>((rooms || []).map((r) => [(r as unknown as RoomRow).id, (r as unknown as RoomRow).name]));
  const profById = new Map<string, string>((profs || []).map((p) => [(p as unknown as ProfileRow).id, (p as unknown as ProfileRow).display_name]));

  return invites.map(i => ({
    ...i,
    room_name: roomById.get(i.room_id) || '',
    inviter_name: profById.get(i.inviter_user_id) || '',
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

export interface StudySession {
  id: string;
  room_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export interface MemberTimerSummary {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_studying: boolean;
  today_seconds: number;
  week_seconds: number;
  active_started_at: string | null;
}

/** Start a study timer for the current user in a room. Creates a new session with ended_at = null. */
export async function startStudySession(roomId: string, userId: string): Promise<StudySession> {
  const { data, error } = await supabase
    .from('room_study_sessions')
    .insert({ room_id: roomId, user_id: userId })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('You already have an active timer in this room.');
    throw error;
  }
  return data as StudySession;
}

/** Stop the active study timer for the current user in a room. Sets ended_at and duration_seconds. */
export async function stopStudySession(roomId: string, userId: string): Promise<void> {
  const { data: active, error: findErr } = await supabase
    .from('room_study_sessions')
    .select('id, started_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();
  if (findErr) throw findErr;
  if (!active) throw new Error('No active timer found.');

  const { error: updateErr } = await supabase
    .from('room_study_sessions')
    .update({
      ended_at: new Date().toISOString(),
      duration_seconds: Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000),
    })
    .eq('id', active.id);
  if (updateErr) throw updateErr;
}

/** Get the current user's active session in a room (if any). */
export async function getMyActiveSession(roomId: string, userId: string): Promise<StudySession | null> {
  const { data, error } = await supabase
    .from('room_study_sessions')
    .select('*')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as StudySession) || null;
}

/** Get timer summaries for all approved members in a room. */
export async function getRoomTimerSummaries(roomId: string): Promise<MemberTimerSummary[]> {
  // 1. Fetch approved members
  const members = await fetchMembers(roomId);
  const approved = members.filter(m => m.status === 'approved');
  if (approved.length === 0) return [];

  // 2. Fetch all sessions for this room (RLS allows approved members to see all)
  const { data: sessions, error } = await supabase
    .from('room_study_sessions')
    .select('user_id, started_at, ended_at, duration_seconds')
    .eq('room_id', roomId);
  if (error) throw error;

  // 3. Compute today and week totals per user
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const summaries: MemberTimerSummary[] = approved.map(m => {
    const userSessions = (sessions || []).filter(s => s.user_id === m.user_id);
    const activeSession = userSessions.find(s => !s.ended_at);

    let todaySeconds = 0;
    let weekSeconds = 0;

    for (const s of userSessions) {
      const start = new Date(s.started_at);
      const end = s.ended_at ? new Date(s.ended_at) : now;
      const duration = s.duration_seconds ?? Math.floor((end.getTime() - start.getTime()) / 1000);

      if (end >= startOfToday) todaySeconds += duration;
      if (end >= startOfWeek) weekSeconds += duration;
    }

    return {
      user_id: m.user_id,
      username: m.username,
      display_name: m.display_name,
      avatar_url: m.avatar_url,
      is_studying: !!activeSession,
      today_seconds: todaySeconds,
      week_seconds: weekSeconds,
      active_started_at: activeSession?.started_at || null,
    };
  });

  return summaries;
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
