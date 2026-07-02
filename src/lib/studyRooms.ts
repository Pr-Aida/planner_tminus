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

async function genUniqueRoomCode(): Promise<string> {
  // Retry a few times on rare collision with the UNIQUE constraint.
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.rpc('gen_room_code');
    if (error) throw error;
    const code = data as string;
    const { data: existing } = await supabase
      .from('study_rooms').select('id').eq('room_code', code).maybeSingle();
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique room code');
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(input: {
  name: string;
  description?: string;
  avatar_url?: string | null;
  theme_color?: string;
}, ownerId: string): Promise<StudyRoom> {
  const invite_code = randomInviteCode();
  const room_code = await genUniqueRoomCode();

  const { data: room, error } = await supabase
    .from('study_rooms')
    .insert({
      owner_id: ownerId,
      name: input.name.trim(),
      description: (input.description || '').trim(),
      avatar_url: input.avatar_url ?? null,
      theme_color: input.theme_color || '#1B2A4A',
      invite_code,
      room_code,
    })
    .select()
    .single();
  if (error) throw error;

  // Owner is automatically an approved member.
  const { error: mErr } = await supabase
    .from('study_room_members')
    .insert({
      room_id: room.id,
      user_id: ownerId,
      status: 'approved',
      joined_at: new Date().toISOString(),
    });
  if (mErr) throw mErr;

  return room as StudyRoom;
}

export async function updateRoom(
  roomId: string,
  patch: Partial<Pick<StudyRoom, 'name' | 'description' | 'avatar_url' | 'theme_color' | 'invite_enabled' | 'leaderboard_enabled'>>,
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

/** Rooms the current user owns or is an approved/invited/pending member of. */
export async function fetchMyRooms(): Promise<(StudyRoom & { my_status: RoomMemberStatus })[]> {
  // The rooms SELECT policy already returns rooms I own or have a
  // pending/invited/approved membership in. We then look up my membership
  // status per room (owner defaults to 'approved').
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

  return ((rooms || []) as StudyRoom[]).map(r => ({
    ...r,
    my_status: (statusByRoom.get(r.id) || 'approved') as RoomMemberStatus,
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
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('invite_code', code).maybeSingle();
  if (error) throw error;
  return (data as StudyRoom) || null;
}

/** Look up a room by short room code (for "join by code"). */
export async function fetchRoomByCode(code: string): Promise<StudyRoom | null> {
  const { data, error } = await supabase
    .from('study_rooms').select('*').eq('room_code', code.toUpperCase().trim()).maybeSingle();
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
  // We need profile info too. Query members, then profiles separately and join.
  const memberIdsRes = await supabase.from('study_room_members').select('user_id').eq('room_id', roomId);
  const memberIds = (memberIdsRes.data || []).map(r => (r as unknown as { user_id: string }).user_id);

  const [{ data: members, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
    supabase.from('study_room_members').select('*').eq('room_id', roomId).order('joined_at', { ascending: false, nullsFirst: false }),
    supabase.from('profiles').select('id, display_name, username, avatar_url').in('id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const profById = new Map<string, ProfileRow>((profiles || []).map(p => [(p as unknown as ProfileRow).id, p as unknown as ProfileRow]));
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
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .ilike('username', username.trim())
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as ProfileRow | null) || null;
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
