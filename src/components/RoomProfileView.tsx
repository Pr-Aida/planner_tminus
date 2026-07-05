import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Copy, Check, RefreshCw, Users, Clock, Trophy, Settings,
  UserPlus, Trash2, X, Loader2, Link as LinkIcon, Search, LogOut, AlertTriangle,
  UserCog, Play, Square, Timer, ImageIcon, MoreVertical, MessageCircle,
} from 'lucide-react';
import type { StudyRoom, RoomMember, RoomMemberActivity, MemberTimerSummary } from '../types';
import RoomChat from './RoomChat';
import {
  fetchRoomById, fetchMembers, fetchMyMembership, fetchRoomActivity,
  updateRoom, regenerateInviteCode, deleteRoom,
  approveMember, rejectMember, removeMember, leaveRoom, transferOwnership,
  updateMySharing, requestToJoin, searchUserByUsername, inviteByUsername,
  acceptInvite, declineInvite,
  startStudySession, pauseStudySession, resumeStudySession, endStudySession,
  getMyActiveSession, getRoomTimerSummaries,
  uploadRoomProfileImage, removeRoomProfileImage,
  makeAdmin, removeAdmin,
  type ProfileSearchResult,
} from '../lib/studyRooms';
import { supabase } from '../lib/supabase';
import { useTheme, type ThemeColors } from '../lib/theme';
import { getUnreadCount, subscribeToChatUnread, markRoomChatRead } from '../lib/roomChat';

// Resolve a room's theme color for the current mode. In dark mode, dark navy
// theme colors (like the default #1B2A4A) are nearly invisible on dark cards,
// so swap them for a readable burgundy accent. Light mode is unchanged.
function resolveThemeColor(themeColor: string, isDark: boolean): string {
  if (!isDark) return themeColor;
  if (themeColor && themeColor.toLowerCase() !== '#1b2a4a') return themeColor;
  return '#D65A7E';
}

// ─── Shared styles ──────────────────────────────────────────────────────────────
function getInputStyle(colors: ThemeColors) {
  return {
    border: `1.5px solid ${colors.borderLight}`,
    background: colors.bgSubtle,
    color: colors.textPrimary,
    fontSize: 13,
  };
}

// ─── Field / Label helpers ─────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <div className="mb-4">
      <label className="block text-xs font-bold mb-1.5 uppercase tracking-wider" style={{ color: colors.textPrimary }}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── MemberAvatar helper ──────────────────────────────────────────────────────
function MemberAvatar({ m, themeColor }: { m: RoomMember; themeColor?: string }) {
  const { colors } = useTheme();
  const bg = themeColor || colors.textPrimary;
  if (m.avatar_url) {
    return <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />;
  }
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ background: bg }}>
      {(m.display_name || m.username || 'U').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Tab types ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'members' | 'activity' | 'chat' | 'settings';

// ─── Main component ────────────────────────────────────────────────────────────
interface Props {
  roomId: string;
  userId: string;
  onBack: () => void;
}

export default function RoomProfileView({ roomId, userId, onBack }: Props) {
  const { colors, theme } = useTheme();
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [myMembership, setMyMembership] = useState<RoomMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [showLeave, setShowLeave] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [unreadChat, setUnreadChat] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, m, me] = await Promise.all([
        fetchRoomById(roomId),
        fetchMembers(roomId),
        fetchMyMembership(roomId, userId),
      ]);
      setRoom(r);
      setMembers(m || []);
      setMyMembership(me);
    } catch (e) {
      console.error('RoomProfileView load error:', e);
      setError(e instanceof Error ? e.message : 'Failed to load room');
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscriptions — debounced reload to avoid refetching on every
  // single change event (a member approval can fire 3 events at once).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        pending = false;
        // Only reload room + members (not the heavy timer data).
        (async () => {
          try {
            const [r, m, me] = await Promise.all([
              fetchRoomById(roomId),
              fetchMembers(roomId),
              fetchMyMembership(roomId, userId),
            ]);
            setRoom(r);
            setMembers(m || []);
            setMyMembership(me);
          } catch (e) {
            console.error('RoomProfileView realtime reload error:', e);
          }
        })();
      }, 300);
    };

    // Members channel - updates for join requests, approvals, role changes
    const membersChannel = supabase.channel(`room_members:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'study_room_members',
        filter: `room_id=eq.${roomId}`,
      }, scheduleReload)
      .subscribe();

    // Study sessions channel - updates for timer status
    const sessionsChannel = supabase.channel(`room_sessions:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'room_study_sessions',
        filter: `room_id=eq.${roomId}`,
      }, scheduleReload)
      .subscribe();

    // Join requests channel
    const requestsChannel = supabase.channel(`room_requests:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'study_room_join_requests',
        filter: `room_id=eq.${roomId}`,
      }, scheduleReload)
      .subscribe();

    // Persistent unread count — fetch on mount and subscribe to changes
    const refreshUnread = () => {
      if (tab !== 'chat') {
        getUnreadCount(roomId, userId).then(n => setUnreadChat(n));
      }
    };
    refreshUnread();
    const unreadSub = subscribeToChatUnread(roomId, userId, refreshUnread);

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(sessionsChannel);
      supabase.removeChannel(requestsChannel);
      unreadSub.unsubscribe();
    };
  }, [roomId, userId, tab]);

  // Clear unread when opening Chat tab — update read receipt persistently
  useEffect(() => {
    if (tab === 'chat') {
      setUnreadChat(0);
      markRoomChatRead(roomId);
    }
  }, [tab, roomId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={28} color={colors.textPrimary} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold mb-6" style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="rounded-xl p-6 text-center" style={{ background: colors.errorBg }}>
          <AlertTriangle size={28} color={colors.error} className="mx-auto mb-3" />
          <p className="text-sm font-bold" style={{ color: colors.error }}>Failed to load room</p>
          <p className="text-xs mt-2 mb-4" style={{ color: colors.textSecondary }}>{error}</p>
          <button onClick={load} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Room not found
  if (!room) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold mb-6" style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div className="rounded-xl p-6 text-center" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
          <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Room not found</p>
          <p className="text-xs mt-2 mb-4" style={{ color: colors.textSecondary }}>This room may have been deleted or you do not have access.</p>
          <button onClick={onBack} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
            Back to Rooms
          </button>
        </div>
      </div>
    );
  }

  const isOwner = room.owner_id === userId;
  const myStatus = myMembership?.status;

  // Non-approved users: show limited view with request/join option
  if (!isOwner && myStatus !== 'approved') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold mb-6" style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={15} /> Back
        </button>
        <RoomHeader room={room} />

        {myStatus === 'pending' && (
          <div className="mt-6 rounded-xl p-5 text-center" style={{ background: colors.warningBg }}>
            <Clock size={24} color={colors.warning} className="mx-auto mb-2" />
            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Your request is pending approval.</p>
            <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>The room owner will review your request.</p>
          </div>
        )}

        {myStatus === 'invited' && (
          <div className="mt-6 space-y-3">
            <div className="rounded-xl p-5 text-center" style={{ background: colors.successBg }}>
              <UserPlus size={24} color={colors.success} className="mx-auto mb-2" />
              <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>You've been invited to join this room.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => { setRequesting(true); await acceptInvite(room.id, userId); load(); setRequesting(false); }}
                disabled={requesting}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: colors.success, border: 'none', cursor: requesting ? 'not-allowed' : 'pointer' }}
              >
                {requesting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept Invitation
              </button>
              <button
                onClick={async () => { setRequesting(true); await declineInvite(room.id, userId); load(); setRequesting(false); }}
                disabled={requesting}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: requesting ? 'not-allowed' : 'pointer' }}
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {(!myStatus || myStatus === 'left' || myStatus === 'removed' || myStatus === 'declined' || myStatus === 'rejected') && (
          <div className="mt-6 space-y-3">
            {!room.invite_enabled ? (
              <div className="rounded-xl p-5 text-center" style={{ background: colors.errorBg }}>
                <p className="text-sm font-bold" style={{ color: colors.error }}>This room is not accepting new members.</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl p-5 text-center" style={{ background: colors.warningBg }}>
                  <Users size={24} color={colors.warning} className="mx-auto mb-2" />
                  <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Join this room to study with others.</p>
                  <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>Your request will be sent to the room owner for approval.</p>
                </div>
                <button
                  onClick={async () => { setRequesting(true); await requestToJoin(room.id, userId); load(); setRequesting(false); }}
                  disabled={requesting}
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5"
                  style={{ background: colors.textPrimary, border: 'none', cursor: requesting ? 'not-allowed' : 'pointer' }}
                >
                  {requesting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Request to Join
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function copyToClipboard(text: string, type: 'link' | 'code') {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  const inviteLink = `${window.location.origin}/room/${room.invite_code}`;
  const myMember = members.find(m => m.user_id === userId);
  const isAdmin = myMember?.role === 'admin' || isOwner;
  const themeColor = resolveThemeColor(room.theme_color || '#1B2A4A', theme === 'dark');

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Users size={14} /> },
    { key: 'members', label: 'Members', icon: <UserPlus size={14} /> },
    { key: 'activity', label: 'Activity', icon: <Clock size={14} /> },
    { key: 'chat', label: 'Chat', icon: <MessageCircle size={14} /> },
    ...(isAdmin ? [{ key: 'settings' as Tab, label: 'Settings', icon: <Settings size={14} /> }] : []),
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold mb-5" style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}>
        <ArrowLeft size={15} /> Back to Rooms
      </button>

      {/* Header */}
      <RoomHeader room={room} />

      {/* Invite / code bar */}
      <div className="flex flex-wrap items-center gap-2 my-4">
        {/* Invite / code bar */}
        <button
          onClick={() => copyToClipboard(inviteLink, 'link')}
          disabled={!room.invite_enabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: room.invite_enabled ? themeColor : colors.bgInput, color: room.invite_enabled ? '#fff' : colors.textTertiary, border: 'none', cursor: room.invite_enabled ? 'pointer' : 'not-allowed', opacity: room.invite_enabled ? 1 : 0.5 }}
        >
          {copied === 'link' ? <Check size={13} color={colors.success} /> : <LinkIcon size={13} />}
          {copied === 'link' ? 'Copied!' : 'Copy invite link'}
        </button>
        <button
          onClick={() => copyToClipboard(room.room_code, 'code')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono"
          style={{ background: colors.bgInput, color: themeColor, border: `1px solid ${themeColor}20`, cursor: 'pointer' }}
        >
          {copied === 'code' ? <Check size={13} color={colors.success} /> : <Copy size={13} />}
          {copied === 'code' ? 'Copied!' : room.room_code}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1 overflow-x-auto" style={{ background: colors.bgInput, scrollbarWidth: 'none' }}>
        <style>{`div::-webkit-scrollbar{display:none}`}</style>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold justify-center transition-colors relative flex-shrink-0 whitespace-nowrap"
            style={{
              background: tab === t.key ? themeColor : 'transparent',
              color: tab === t.key ? '#fff' : colors.textSecondary,
              border: 'none', cursor: 'pointer',
            }}
          >
            {t.icon} {t.label}
            {t.key === 'chat' && unreadChat > 0 && (
              <span
                className="absolute top-0.5 right-1 flex items-center justify-center text-[9px] font-bold text-white rounded-full"
                style={{
                  background: colors.accent,
                  minWidth: 15,
                  height: 15,
                  padding: '0 4px',
                  border: `1.5px solid ${tab === 'chat' ? themeColor : colors.bgInput}`,
                }}
              >
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab room={room} members={members} isOwner={isOwner} userId={userId} onUpdated={load} />
      )}

      {tab === 'members' && (
        <MembersTab
          room={room}
          members={members}
          currentUserId={userId}
          isOwner={isOwner}
          onRemove={async (uid) => { await removeMember(room.id, uid); load(); }}
          onApprove={async (uid) => { await approveMember(room.id, uid); load(); }}
          onReject={async (uid) => { await rejectMember(room.id, uid); load(); }}
          onTransfer={async (uid, oldRole) => { await transferOwnership(room.id, uid, oldRole); load(); }}
          onReload={load}
        />
      )}

      {tab === 'activity' && (
        <ActivityTab roomId={room.id} userId={userId} themeColor={themeColor} />
      )}

      {tab === 'chat' && (
        <RoomChat roomId={room.id} userId={userId} isOwnerOrAdmin={isOwner || myMember?.role === 'admin'} themeColor={themeColor} />
      )}

      {tab === 'settings' && isAdmin && (
        <SettingsTab
          room={room}
          members={members}
          currentUserId={userId}
          isOwner={isOwner}
          onUpdated={() => load()}
          onRegenerate={() => regenerateInviteCode(room.id).then(load)}
          onDelete={async () => { await deleteRoom(room.id); onBack(); }}
          onTransfer={async (newOwnerId, oldRole) => {
            await transferOwnership(room.id, newOwnerId, oldRole);
            load();
          }}
        />
      )}

      {/* Leave room (non-owner) */}
      {!isOwner && myMembership && (
        <div className="mt-4">
          {!showLeave ? (
            <button
              onClick={() => setShowLeave(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
              style={{ background: colors.bgCard, color: colors.error, border: `1.5px solid ${colors.error}`, cursor: 'pointer' }}
            >
              <LogOut size={13} /> Leave room
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: colors.errorBg }}>
                <AlertTriangle size={16} color={colors.error} style={{ flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs font-semibold" style={{ color: colors.error }}>
                  Are you sure you want to leave this room? You will lose access to this room, but the room will remain available for other members.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => { await leaveRoom(room.id, userId); onBack(); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                  style={{ background: colors.error, border: 'none', cursor: 'pointer' }}
                >
                  Yes, leave room
                </button>
                <button
                  onClick={() => setShowLeave(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Room header ───────────────────────────────────────────────────────────────
function RoomHeader({ room }: { room: StudyRoom }) {
  const { colors } = useTheme();
  const img = room.profile_image_url || room.avatar_url;
  return (
    <div className="flex items-center gap-3 mb-2">
      {img ? (
        <img src={img} alt="" className="rounded-xl object-cover flex-shrink-0" style={{ width: 64, height: 64 }} />
      ) : (
        <div className="rounded-xl flex items-center justify-center text-white font-extrabold text-2xl flex-shrink-0"
          style={{ width: 64, height: 64, background: room.theme_color }}>
          {room.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-extrabold truncate" style={{ color: colors.textPrimary }}>{room.name}</h1>
        {room.description && <p className="text-sm mt-0.5 truncate" style={{ color: colors.textSecondary }}>{room.description}</p>}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ room, members, isOwner, userId, onUpdated }: {
  room: StudyRoom; members: RoomMember[]; isOwner: boolean; userId: string; onUpdated: () => void;
}) {
  const { colors, theme } = useTheme();
  const approved = members.filter(m => m.status === 'approved');
  const myM = members.find(m => m.user_id === userId);
  const themeColor = resolveThemeColor(room.theme_color || colors.textPrimary, theme === 'dark');

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: <Users size={16} color={themeColor} />, label: 'Members', value: approved.length },
          { icon: <Trophy size={16} color={themeColor} />, label: 'Leaderboard', value: room.leaderboard_enabled ? 'On' : 'Off' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
            <div className="flex justify-center mb-1">{s.icon}</div>
            <p className="text-lg font-extrabold" style={{ color: colors.textPrimary }}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: colors.textTertiary }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Sharing prefs (for own membership) */}
      {myM && (
        <SharingPrefsCard member={myM} roomId={room.id} onUpdated={onUpdated} themeColor={themeColor} />
      )}
    </div>
  );
}

function SharingPrefsCard({ member, roomId, onUpdated, themeColor }: {
  member: RoomMember; roomId: string; onUpdated: () => void; themeColor: string;
}) {
  const { colors } = useTheme();
  const [saving, setSaving] = useState(false);
  const toggle = async (field: 'share_today' | 'share_weekly' | 'show_active_now') => {
    setSaving(true);
    try {
      await updateMySharing(roomId, { [field]: !member[field] } as Partial<Pick<RoomMember, 'share_today' | 'share_weekly' | 'show_active_now' | 'hide_activity'>>);
      onUpdated();
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: themeColor }}>My sharing preferences</p>
      {([
        { key: 'share_today', label: "Share today's activity" },
        { key: 'share_weekly', label: "Share weekly activity" },
        { key: 'show_active_now', label: 'Show when I\'m active' },
      ] as { key: 'share_today' | 'share_weekly' | 'show_active_now'; label: string }[]).map(p => (
        <div key={p.key} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${colors.bgInput}` }}>
          <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>{p.label}</span>
          <button
            onClick={() => toggle(p.key)}
            disabled={saving}
            className="rounded-full transition-colors"
            style={{
              width: 36, height: 20, background: member[p.key] ? themeColor : colors.border,
              position: 'relative', border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            <span style={{
              position: 'absolute', top: 2, left: member[p.key] ? 18 : 2, width: 16, height: 16,
              borderRadius: '50%', background: colors.bgCard, transition: 'left 0.15s',
            }} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────────
function ActivityTab({ roomId, userId, themeColor }: { roomId: string; userId: string; themeColor: string }) {
  const { colors } = useTheme();
  const [activity, setActivity] = useState<RoomMemberActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoomActivity(roomId).then(setActivity).catch(() => {}).finally(() => setLoading(false));
  }, [roomId]);

  return (
    <div className="space-y-4">
      {/* My Study Timer — personal timer controls for the current user */}
      <StudyTimerSection roomId={roomId} userId={userId} themeColor={themeColor} />

      {/* Room Activity Summary — shared study times for all approved members */}
      <div className="rounded-xl p-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} color={themeColor} />
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: themeColor }}>Room Activity Summary</p>
        </div>
        {loading ? (
          <div className="py-4 text-center"><Loader2 className="animate-spin mx-auto" size={18} color={colors.textPrimary} /></div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: colors.textTertiary }}>No shared activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activity.map(a => (
              <div key={a.user_id} className="flex items-center gap-3 rounded-lg p-2.5" style={{ background: colors.bgSubtle }}>
                {a.avatar_url ? (
                  <img src={a.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: colors.textPrimary }}>
                    {(a.display_name || a.username || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>
                    {a.display_name || a.username || 'Unknown user'}
                    {a.user_id === userId && <span className="ml-1.5 text-[10px] font-bold uppercase" style={{ color: colors.textTertiary }}>(you)</span>}
                  </p>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>@{a.username || '—'}</p>
                </div>
                {a.active_now && !a.hidden && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: colors.successBg, color: colors.success }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.success }} />
                    Studying
                  </span>
                )}
                {!a.hidden ? (
                  <div className="flex items-center gap-3 flex-shrink-0 text-xs" style={{ color: colors.textSecondary }}>
                    <span>Today: <strong style={{ color: colors.textPrimary }}>{formatDuration(a.minutes * 60)}</strong></span>
                  </div>
                ) : (
                  <span className="text-[10px] italic flex-shrink-0" style={{ color: colors.textTertiary }}>Hidden</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Study Timer section ───────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(seconds % 60)}s`;
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/** Format seconds as HH:MM:SS clock display. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** Live ticking timer for a member who is currently studying. Updates every second. */
function MemberLiveTimer({ accumulatedSeconds, startedAt }: { accumulatedSeconds: number; startedAt: string }) {
  const { colors } = useTheme();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  // accumulatedSeconds is the session's accumulated time before the current run;
  // add elapsed since startedAt for the live display.
  const elapsed = tick >= 0 ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0;
  const live = accumulatedSeconds + elapsed;
  return (
    <span
      key={tick}
      className="text-lg font-bold tabular-nums flex-shrink-0 tracking-wider"
      style={{ color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}
    >
      {formatClock(live)}
    </span>
  );
}

/** Timer display for a member row: live-ticking when running, static when paused/stopped. */
function MemberTimerDisplay({ value, color, isRunning, startedAt, accumulated }: {
  value: number; color: string; isRunning: boolean; startedAt?: string | null; accumulated: number;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (isRunning && startedAt) {
      const id = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(id);
    }
  }, [isRunning, startedAt]);

  const displayValue = isRunning && startedAt
    ? accumulated + Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : value;

  return (
    <span
      key={tick}
      className="text-lg font-bold tabular-nums flex-shrink-0 tracking-wider"
      style={{ color, fontVariantNumeric: 'tabular-nums' }}
    >
      {formatClock(displayValue)}
    </span>
  );
}

function StudyTimerSection({ roomId, userId, themeColor }: { roomId: string; userId: string; themeColor: string }) {
  const { colors } = useTheme();
  const [activeSession, setActiveSession] = useState<{ id: string; started_at: string; status: string; accumulated_seconds: number } | null>(null);
  const [summaries, setSummaries] = useState<MemberTimerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const [active, sums] = await Promise.all([
        getMyActiveSession(roomId, userId),
        getRoomTimerSummaries(roomId),
      ]);
      setActiveSession(active ? { id: active.id, started_at: active.started_at, status: active.status, accumulated_seconds: active.accumulated_seconds || 0 } : null);
      setSummaries(sums);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [roomId, userId]);

  useEffect(() => { load(); }, [load]);

  // Refresh summaries every 10 seconds for live updates
  useEffect(() => {
    const id = setInterval(() => {
      getRoomTimerSummaries(roomId).then(setSummaries).catch(() => {});
    }, 10000);
    return () => clearInterval(id);
  }, [roomId]);

  useEffect(() => {
    if (activeSession && activeSession.status === 'running') {
      const update = () => setElapsed(activeSession.accumulated_seconds + Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000));
      update();
      tickRef.current = setInterval(update, 1000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    } else if (activeSession && activeSession.status === 'paused') {
      setElapsed(activeSession.accumulated_seconds);
    } else {
      setElapsed(0);
    }
  }, [activeSession]);

  const handleStart = async () => {
    setActing(true); setError(null);
    try { await startStudySession(roomId, userId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start timer'); }
    finally { setActing(false); }
  };

  const handlePause = async () => {
    setActing(true); setError(null);
    try { await pauseStudySession(roomId, userId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not pause timer'); }
    finally { setActing(false); }
  };

  const handleResume = async () => {
    setActing(true); setError(null);
    try { await resumeStudySession(roomId, userId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not resume timer'); }
    finally { setActing(false); }
  };

  const handleEnd = async () => {
    setActing(true); setError(null);
    try { await endStudySession(roomId, userId); setActiveSession(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not end session'); }
    finally { setActing(false); }
  };

  if (loading) return <div className="rounded-xl p-4 mb-4 flex items-center gap-2" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
    <Loader2 size={16} className="animate-spin" color={themeColor} /><span className="text-xs" style={{ color: colors.textSecondary }}>Loading timer…</span>
  </div>;

  const mySummary = summaries.find(s => s.user_id === userId);
  const todaySeconds = mySummary?.today_seconds || 0;
  const hasAccumulatedToday = todaySeconds > 0 || elapsed > 0;

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Timer size={16} color={themeColor} />
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: themeColor }}>Study Timer</p>
      </div>

      {/* Timer controls for current user */}
      <div className="flex items-center justify-between gap-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${colors.bgInput}` }}>
        <div>
          {activeSession ? (
            <div>
              <p className="text-sm font-bold font-mono" style={{ color: activeSession.status === 'running' ? colors.success : colors.warning }}>
                {activeSession.status === 'running' ? 'Studying: ' : 'Paused: '}
                {formatTimer(elapsed)}
              </p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                {activeSession.status === 'running' ? 'Timer is running' : 'Timer is paused'}
              </p>
            </div>
          ) : mySummary?.finished_for_day ? (
            <div>
              <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Finished for today</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Today: {formatDuration(todaySeconds)}</p>
            </div>
          ) : hasAccumulatedToday ? (
            <div>
              <p className="text-sm font-bold font-mono" style={{ color: colors.textPrimary }}>{formatTimer(elapsed || todaySeconds)}</p>
              <p className="text-xs" style={{ color: colors.textSecondary }}>Ready to continue</p>
            </div>
          ) : (
            <p className="text-sm font-semibold" style={{ color: colors.textPrimary }}>Ready to study</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeSession?.status === 'running' && (
            <>
              <button onClick={handlePause} disabled={acting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: colors.warningBg, color: colors.warning, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
                {acting ? <Loader2 size={14} className="animate-spin" /> : null} Pause
              </button>
              <button onClick={handleEnd} disabled={acting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: acting ? colors.border : colors.error, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
                End Study
              </button>
            </>
          )}

          {activeSession?.status === 'paused' && (
            <>
              <button onClick={handleResume} disabled={acting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: acting ? colors.border : themeColor, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
                {acting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Resume
              </button>
              <button onClick={handleEnd} disabled={acting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: acting ? colors.border : colors.error, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
                End Study
              </button>
            </>
          )}

          {!activeSession && !mySummary?.finished_for_day && (
            <button onClick={handleStart} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ background: acting ? colors.border : themeColor, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
              {acting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start Timer
            </button>
          )}

          {!activeSession && mySummary?.finished_for_day && (
            <button onClick={handleStart} disabled={acting} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
              style={{ background: acting ? colors.border : themeColor, border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}>
              {acting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Start New Session
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg px-3 py-2 text-xs mb-3" style={{ background: colors.errorBg, color: colors.error }}>{error}</div>}

      {/* Member timer status list */}
      <div className="space-y-2">
        {summaries.map(s => (
          <MemberTimerRow key={s.user_id} s={s} userId={userId} themeColor={themeColor} />
        ))}
      </div>
    </div>
  );
}

function MemberTimerRow({ s, userId, themeColor }: { s: MemberTimerSummary; userId: string; themeColor: string }) {
  const { colors } = useTheme();
  // Live timer for running sessions; static for paused/ended
  const [liveElapsed, setLiveElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (s.status === 'running' && s.active_started_at) {
      const update = () => {
        const elapsed = s.active_accumulated_seconds + Math.floor((Date.now() - new Date(s.active_started_at).getTime()) / 1000);
        setLiveElapsed(elapsed);
      };
      update();
      tickRef.current = setInterval(update, 1000);
      return () => { if (tickRef.current) clearInterval(tickRef.current); };
    } else if (s.status === 'paused') {
      // Show the paused session duration (accumulated so far)
      setLiveElapsed(s.active_accumulated_seconds || 0);
    } else {
      setLiveElapsed(0);
    }
  }, [s.status, s.active_started_at, s.active_accumulated_seconds]);

  // Determine the timer to show between name and badge:
  // - running: live elapsed (green)
  // - paused: accumulated seconds (amber)
  // - ended with today_seconds > 0: show today's total as the "latest session" (theme color)
  // - no session: no timer
  const showTimer = s.status === 'running' || s.status === 'paused' || (s.status === 'ended' && s.today_seconds > 0);
  const timerValue = s.status === 'running'
    ? liveElapsed
    : s.status === 'paused'
      ? (s.active_accumulated_seconds || 0)
      : s.today_seconds;
  const timerColor = s.status === 'running' ? colors.success : s.status === 'paused' ? colors.warning : themeColor;

  const getStatusBadge = () => {
    if (s.status === 'running') {
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: colors.successBg, color: colors.success }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.success }} />
          Studying now
        </span>
      );
    }
    if (s.status === 'paused') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: colors.warningBg, color: colors.warning }}>
          Paused
        </span>
      );
    }
    if (s.finished_for_day) {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: colors.successBg, color: colors.success }}>
          Stopped
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex items-center gap-3">
      {s.avatar_url ? (
        <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: themeColor }}>
          {(s.display_name || s.username || 'U').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold truncate" style={{ color: colors.textPrimary }}>
            {s.display_name || s.username || 'Unknown user'}
            {s.user_id === userId && <span className="ml-1.5 text-[9px] font-bold uppercase" style={{ color: colors.textTertiary }}>(you)</span>}
          </p>
          {/* Timer between name and status badge — large, bold */}
          {showTimer && (
            <span className="text-lg font-bold tabular-nums flex-shrink-0" style={{ color: timerColor }}>
              {formatTimer(timerValue)}
            </span>
          )}
        </div>
        {/* Under name: only weekly total */}
        <p className="text-[10px]" style={{ color: colors.textTertiary }}>
          This week: {formatDuration(s.week_seconds)}
        </p>
      </div>
      {getStatusBadge()}
    </div>
  );
}

// ─── Members tab ───────────────────────────────────────────────────────────────
function MembersTab({ room, members, currentUserId, isOwner, onRemove, onApprove, onReject, onTransfer, onReload }: {
  room: StudyRoom;
  members: RoomMember[];
  currentUserId: string;
  isOwner: boolean;
  onRemove: (uid: string) => void;
  onApprove: (uid: string) => void;
  onReject: (uid: string) => void;
  onTransfer: (uid: string, oldRole: 'member' | 'admin') => Promise<void>;
  onReload: () => void;
}) {
  const myMember = members.find(m => m.user_id === currentUserId);
  const isAdmin = myMember?.role === 'admin' || isOwner;
  const approved = members.filter(m => m.status === 'approved');
  const pending = members.filter(m => m.status === 'pending');
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<ProfileSearchResult[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // Debounced auto-search: fires 350ms after the user stops typing.
  // Min 2 chars required by the RPC; shorter queries just clear results.
  useEffect(() => {
    const q = inviteQuery.trim();
    if (q.length < 2) {
      setInviteResults([]);
      setInviteError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setInviteError(null);
    const timer = setTimeout(async () => {
      try {
        const results = await searchUserByUsername(q);
        const memberIds = new Set(members.filter(m => ['approved', 'pending', 'invited'].includes(m.status)).map(m => m.user_id));
        const filtered = results.filter(r => !memberIds.has(r.id));
        setInviteResults(filtered);
        if (filtered.length === 0 && results.length > 0) {
          setInviteError('All matching users are already members or have pending invitations.');
        } else if (results.length === 0) {
          setInviteError('No users found matching your search.');
        }
      } catch (e) {
        setInviteError(e instanceof Error ? e.message : 'Search failed');
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [inviteQuery, members]);
  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);
  const [roleAction, setRoleAction] = useState<{ type: 'transfer' | 'transferKeepAdmin' | 'makeAdmin'; member: RoomMember } | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  async function handleSearch() {
    if (!inviteQuery.trim()) return;
    setSearching(true); setInviteError(null); setInviteResults([]); setInviteSuccess(null);
    try {
      const results = await searchUserByUsername(inviteQuery.trim());
      if (results.length === 0) { setInviteError('No users found matching your search.'); return; }
      // Filter out existing members
      const memberIds = new Set(members.filter(m => ['approved', 'pending', 'invited'].includes(m.status)).map(m => m.user_id));
      const filtered = results.filter(r => !memberIds.has(r.id));
      if (filtered.length === 0) {
        setInviteError('All matching users are already members or have pending invitations.');
        return;
      }
      setInviteResults(filtered);
    } catch (e) { setInviteError(e instanceof Error ? e.message : 'Search failed'); }
    finally { setSearching(false); }
  }

  async function handleInvite(userId: string) {
    setInvitingId(userId); setInviteError(null);
    try {
      await inviteByUsername(room.id, userId);
      setInviteSuccess('Invitation sent successfully.');
      setInviteResults(prev => prev.filter(r => r.id !== userId));
      setInviteQuery('');
      onReload();
    } catch (e) { setInviteError(e instanceof Error ? e.message : 'Invite failed'); }
    finally { setInvitingId(null); }
  }

  async function handleMakeAdmin(targetUserId: string) {
    setRoleError(null);
    try {
      await makeAdmin(room.id, targetUserId);
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to make admin.';
      setRoleError(msg);
    }
  }

  async function handleRemoveAdmin(targetUserId: string) {
    setRoleError(null);
    try {
      await removeAdmin(room.id, targetUserId);
      onReload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to remove admin.';
      setRoleError(msg);
    }
  }

  const { colors, theme } = useTheme();
  const themeColor = resolveThemeColor(room.theme_color || colors.textPrimary, theme === 'dark');

  return (
    <div className="space-y-4">
      {/* Invite by username (owner/admin only) */}
      {isAdmin && (
        <div className="rounded-xl p-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: themeColor }}>Invite by username</p>
          <div className="flex gap-2 mb-2">
            <input
              value={inviteQuery}
              onChange={e => setInviteQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by @username or name…"
              className="flex-1 min-w-0 rounded-lg px-3 py-2 text-xs outline-none"
              style={getInputStyle(colors)}
            />
            <button onClick={handleSearch} disabled={searching || !inviteQuery.trim()}
              className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1 flex-shrink-0"
              style={{ background: themeColor, border: 'none', cursor: searching || !inviteQuery.trim() ? 'not-allowed' : 'pointer', opacity: !inviteQuery.trim() ? 0.5 : 1 }}>
              {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Search
            </button>
          </div>
          {inviteError && <p className="text-xs mb-2" style={{ color: colors.error }}>{inviteError}</p>}
          {inviteSuccess && <p className="text-xs mb-2" style={{ color: colors.success }}>{inviteSuccess}</p>}
          {inviteResults.length > 0 && (
            <div className="space-y-2 mb-2 max-h-64 overflow-y-auto">
              {inviteResults.map(r => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: colors.bgSubtle }}>
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ background: themeColor }}>
                      {(r.username || r.display_name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{r.display_name || r.username || 'Unknown user'}</p>
                    <p className="text-xs truncate" style={{ color: colors.textTertiary }}>@{r.username || '—'}</p>
                  </div>
                  <button onClick={() => handleInvite(r.id)} disabled={invitingId === r.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white flex-shrink-0"
                    style={{ background: themeColor, border: 'none', cursor: invitingId === r.id ? 'not-allowed' : 'pointer' }}>
                    {invitingId === r.id ? <Loader2 size={13} className="animate-spin" /> : 'Invite'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pending requests */}
      {isAdmin && pending.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: themeColor }}>Pending requests ({pending.length})</p>
          <div className="space-y-2">
            {pending.map(m => (
              <div key={m.id} className="flex items-center gap-2 flex-wrap">
                <MemberAvatar m={m} themeColor={themeColor} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>{m.display_name || m.username || 'Unknown user'}</p>
                  <p className="text-xs truncate" style={{ color: colors.textTertiary }}>
                    {m.username ? `@${m.username}` : '\u00A0'}
                  </p>
                </div>
                <button onClick={() => onApprove(m.user_id)} className="px-2 py-1 rounded-lg text-xs font-bold text-white flex-shrink-0" style={{ background: colors.success, border: 'none', cursor: 'pointer' }}>Approve</button>
                <button onClick={() => onReject(m.user_id)} className="px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0" style={{ background: colors.errorBg, color: colors.error, border: 'none', cursor: 'pointer' }}>Reject</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved members — avatar, name, role badge, management menu */}
      <div className="rounded-xl p-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: themeColor }}>Members ({approved.length})</p>
        <div className="space-y-2.5">
          {approved.map(m => {
            return (
              <div key={m.id} className="flex items-center gap-2.5">
                <MemberAvatar m={m} themeColor={themeColor} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate" style={{ color: colors.textPrimary }}>
                      {m.display_name || m.username || 'Unknown user'}
                      {m.role === 'owner' && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: `${themeColor}15`, color: themeColor }}>Owner</span>
                      )}
                      {m.role === 'admin' && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: colors.accentLight, color: colors.textPrimary }}>Admin</span>
                      )}
                      {m.user_id === currentUserId && (
                        <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: colors.borderLight, color: colors.textPrimary }}>You</span>
                      )}
                    </p>
                  </div>
                  <p className="text-xs truncate" style={{ color: colors.textTertiary }}>
                    {m.username ? `@${m.username}` : '\u00A0'}
                  </p>
                </div>

                {/* Member actions (owner only) */}
                {isOwner && m.user_id !== room.owner_id && (
                  <div className="relative">
                    <button
                      onClick={() => setMemberMenuOpen(memberMenuOpen === m.user_id ? null : m.user_id)}
                      className="p-1 rounded transition-colors"
                      style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.border }}
                      onMouseEnter={e => (e.currentTarget.style.color = colors.textPrimary)}
                      onMouseLeave={e => (e.currentTarget.style.color = colors.border)}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {memberMenuOpen === m.user_id && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 rounded-lg py-1 min-w-[180px]"
                        style={{ background: colors.bgCard, boxShadow: `0 4px 20px ${colors.shadow}`, border: `1px solid ${colors.borderLight}` }}
                        onClick={e => e.stopPropagation()}
                      >
                        {m.role !== 'admin' && (
                          <button
                            onClick={() => { setRoleAction({ type: 'makeAdmin', member: m }); setMemberMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-left hover:bg-gray-50"
                            style={{ border: 'none', background: 'transparent', color: colors.textPrimary, cursor: 'pointer' }}
                          >
                            <UserCog size={12} /> Make Admin
                          </button>
                        )}
                        {m.role === 'admin' && (
                          <button
                            onClick={() => { handleRemoveAdmin(m.user_id); setMemberMenuOpen(null); }}
                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-left hover:bg-gray-50"
                            style={{ border: 'none', background: 'transparent', color: colors.warning, cursor: 'pointer' }}
                          >
                            <UserCog size={12} /> Remove Admin
                          </button>
                        )}
                        <button
                          onClick={() => { setRoleAction({ type: 'transfer', member: m }); setMemberMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-left hover:bg-gray-50"
                          style={{ border: 'none', background: 'transparent', color: colors.warning, cursor: 'pointer' }}
                        >
                          <UserCog size={12} /> Transfer Ownership
                        </button>
                        <button
                          onClick={() => { setRoleAction({ type: 'transferKeepAdmin', member: m }); setMemberMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-left hover:bg-gray-50"
                          style={{ border: 'none', background: 'transparent', color: colors.warning, cursor: 'pointer' }}
                        >
                          <UserCog size={12} /> Transfer Ownership + Keep Me Admin
                        </button>
                        <button
                          onClick={() => { onRemove(m.user_id); setMemberMenuOpen(null); }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-left hover:bg-red-50"
                          style={{ border: 'none', background: 'transparent', color: colors.error, cursor: 'pointer' }}
                        >
                          <Trash2 size={12} /> Remove Member
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Role action error */}
      {roleError && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: colors.errorBg, color: colors.error }}>
          {roleError}
        </div>
      )}

      {/* Role action confirmation modals */}
      {roleAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: colors.overlay }} onClick={() => !transferring && setRoleAction(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: colors.bgCard }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} color={roleAction.type === 'makeAdmin' ? themeColor : colors.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <h3 className="text-sm font-bold mb-2" style={{ color: colors.textPrimary }}>
                  {roleAction.type === 'makeAdmin' ? 'Make Admin' : 'Transfer Ownership'}
                </h3>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  {roleAction.type === 'transfer' && (
                    <>
                      Are you sure you want to transfer ownership to{' '}
                      <strong style={{ color: colors.textPrimary }}>
                        {roleAction.member.display_name || roleAction.member.username || 'this member'}
                      </strong>
                      ? You will become a normal member.
                    </>
                  )}
                  {roleAction.type === 'transferKeepAdmin' && (
                    <>
                      Are you sure you want to transfer ownership to{' '}
                      <strong style={{ color: colors.textPrimary }}>
                        {roleAction.member.display_name || roleAction.member.username || 'this member'}
                      </strong>
                      {' '}and keep yourself as admin?
                    </>
                  )}
                  {roleAction.type === 'makeAdmin' && (
                    <>
                      Make{' '}
                      <strong style={{ color: colors.textPrimary }}>
                        {roleAction.member.display_name || roleAction.member.username || 'this member'}
                      </strong>
                      {' '}an admin of this room?
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setRoleError(null);
                  if (roleAction.type === 'makeAdmin') {
                    await handleMakeAdmin(roleAction.member.user_id);
                    setRoleAction(null);
                  } else {
                    setTransferring(true);
                    try {
                      await onTransfer(roleAction.member.user_id, roleAction.type === 'transferKeepAdmin' ? 'admin' : 'member');
                      setRoleAction(null);
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : 'Failed to transfer ownership.';
                      setRoleError(msg);
                    }
                    finally { setTransferring(false); }
                  }
                }}
                disabled={transferring}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: transferring ? colors.border : roleAction.type === 'makeAdmin' ? themeColor : colors.warning, border: 'none', cursor: transferring ? 'not-allowed' : 'pointer' }}
              >
                {transferring ? 'Transferring…' : roleAction.type === 'makeAdmin' ? 'Yes, make admin' : 'Yes, transfer'}
              </button>
              <button
                onClick={() => setRoleAction(null)}
                disabled={transferring}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: transferring ? 'not-allowed' : 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function SettingsTab({ room, members, currentUserId, isOwner, onUpdated, onRegenerate, onDelete, onTransfer }: {
  room: StudyRoom;
  members: RoomMember[];
  currentUserId: string;
  isOwner: boolean;
  onUpdated: () => void;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
  onTransfer: (newOwnerId: string, oldOwnerRole: 'member' | 'admin') => Promise<void>;
}) {
  const { colors, theme } = useTheme();
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [themeColor, setThemeColor] = useState(room.theme_color);
  const displayThemeColor = resolveThemeColor(themeColor, theme === 'dark');
  const [inviteEnabled, setInviteEnabled] = useState(room.invite_enabled);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(room.leaderboard_enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [oldOwnerRole, setOldOwnerRole] = useState<'member' | 'admin'>('member');
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showMakeAdmin, setShowMakeAdmin] = useState(false);
  const [makeAdminTarget, setMakeAdminTarget] = useState('');
  const [makingAdmin, setMakingAdmin] = useState(false);
  const [showMakeAdminConfirm, setShowMakeAdminConfirm] = useState(false);
  const [makeAdminError, setMakeAdminError] = useState<string | null>(null);

  async function handleImageUpload(file: File) {
    if (file.size > 5 * 1024 * 1024) { setImageError('Image file is too large. Maximum 5 MB.'); return; }
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setImageError('Unsupported image format. Use PNG, JPG, or WEBP.'); return;
    }
    setImageError(null); setImageUploading(true);
    try { await uploadRoomProfileImage(room.id, file); onUpdated(); }
    catch (e) { setImageError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setImageUploading(false); }
  }

  async function handleImageRemove() {
    setImageUploading(true); setImageError(null);
    try { await removeRoomProfileImage(room.id); onUpdated(); }
    catch (e) { setImageError(e instanceof Error ? e.message : 'Remove failed'); }
    finally { setImageUploading(false); }
  }

  const approvedOthers = members.filter(m => m.status === 'approved' && m.user_id !== room.owner_id && m.user_id !== currentUserId);

  async function handleSave() {
    setSaving(true);
    try {
      await updateRoom(room.id, { name, description, theme_color: themeColor, invite_enabled: inviteEnabled, leaderboard_enabled: leaderboardEnabled });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      onUpdated();
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      {/* Room info */}
      <div className="rounded-xl p-5" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: displayThemeColor }}>Room info</p>

        <Field label="Room name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={60}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={getInputStyle(colors)} />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={200} rows={2}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none resize-none" style={getInputStyle(colors)} />
        </Field>

        {/* Profile image */}
        <Field label="Profile image">
          <div className="flex items-center gap-3">
            {room.profile_image_url ? (
              <img src={room.profile_image_url} alt="" className="rounded-lg object-cover" style={{ width: 52, height: 52 }} />
            ) : (
              <div className="rounded-lg flex items-center justify-center text-sm font-bold text-white" style={{ width: 52, height: 52, background: themeColor }}>
                {room.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="cursor-pointer">
                  <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: colors.bgInput, color: colors.textPrimary, border: `1px solid ${colors.borderLight}`, cursor: imageUploading ? 'not-allowed' : 'pointer' }}>
                    {imageUploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    {imageUploading ? 'Uploading…' : 'Upload image'}
                  </span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={imageUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                    className="hidden" />
                </label>
                {room.profile_image_url && (
                  <button onClick={handleImageRemove} disabled={imageUploading}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: colors.errorBg, color: colors.error, border: 'none', cursor: imageUploading ? 'not-allowed' : 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
              {imageError && <p className="text-[10px] mt-1" style={{ color: colors.error }}>{imageError}</p>}
              <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>PNG, JPG, or WEBP. Max 5 MB.</p>
            </div>
          </div>
        </Field>

        <Field label="Theme color">
          <div className="flex gap-2">
            {['#1B2A4A', '#7B1C3E', '#059669', '#B45309', '#2563EB', '#7c3aed'].map(c => (
              <button key={c} onClick={() => setThemeColor(c)} className="rounded-full"
                style={{ width: 26, height: 26, background: c, cursor: 'pointer',
                  border: themeColor === c ? `2px solid ${colors.textPrimary}` : '2px solid transparent' }} />
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between py-2 mb-1" style={{ borderTop: `1px solid ${colors.bgInput}` }}>
          <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Invite link enabled</span>
          <button onClick={() => setInviteEnabled(v => !v)} className="rounded-full transition-colors"
            style={{ width: 36, height: 20, background: inviteEnabled ? colors.textPrimary : colors.border, position: 'relative', border: 'none', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 2, left: inviteEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: colors.bgCard, transition: 'left 0.15s' }} />
          </button>
        </div>

        <div className="flex items-center justify-between py-2 mb-4" style={{ borderTop: `1px solid ${colors.bgInput}` }}>
          <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Leaderboard</span>
          <button onClick={() => setLeaderboardEnabled(v => !v)} className="rounded-full transition-colors"
            style={{ width: 36, height: 20, background: leaderboardEnabled ? colors.textPrimary : colors.border, position: 'relative', border: 'none', cursor: 'pointer' }}>
            <span style={{ position: 'absolute', top: 2, left: leaderboardEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: colors.bgCard, transition: 'left 0.15s' }} />
          </button>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5"
          style={{ background: themeColor, border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : null}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </div>

      {/* Invite code */}
      <div className="rounded-xl p-5" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: displayThemeColor }}>Invite code</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 font-mono text-sm font-bold px-3 py-2 rounded-lg" style={{ background: colors.bgSubtle, color: colors.textPrimary }}>{room.room_code}</span>
          <button
            onClick={async () => { setRegenerating(true); await onRegenerate(); setRegenerating(false); }}
            disabled={regenerating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: colors.bgInput, color: colors.textPrimary, border: 'none', cursor: regenerating ? 'not-allowed' : 'pointer' }}>
            {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate
          </button>
        </div>
      </div>

      {/* Danger zone - Owner only */}
      {isOwner && (
        <div className="rounded-xl p-5" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}`, border: `1.5px solid ${colors.error}` }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: colors.error }}>Owner only</p>

          {/* Transfer ownership */}
          <div className="mb-4 pb-4" style={{ borderBottom: `1px solid ${colors.bgInput}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: colors.textPrimary }}>Transfer ownership</p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Transfer ownership to another approved member. You will remain as a member or admin.</p>
            {approvedOthers.length === 0 ? (
              <p className="text-xs italic" style={{ color: colors.textTertiary }}>No other approved members to transfer ownership to.</p>
            ) : !showTransfer ? (
              <button onClick={() => setShowTransfer(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: colors.warningBg, color: colors.warning, border: 'none', cursor: 'pointer' }}>
                <UserCog size={13} /> Transfer Ownership
              </button>
            ) : (
              <div className="space-y-3">
                <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                  style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}>
                  <option value="">Select an approved member…</option>
                  {approvedOthers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.username || 'Unknown user'}{m.role === 'admin' ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
                {transferTarget && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs" style={{ color: colors.textPrimary }}>
                      <input
                        type="checkbox"
                        checked={oldOwnerRole === 'admin'}
                        onChange={e => setOldOwnerRole(e.target.checked ? 'admin' : 'member')}
                      />
                      Keep me as admin after transfer
                    </label>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      Transfer ownership to <strong style={{ color: colors.textPrimary }}>
                        {approvedOthers.find(m => m.user_id === transferTarget)?.username || 'this member'}
                      </strong>? They will become the new room owner. You will stay as {oldOwnerRole === 'admin' ? 'an admin' : 'a member'}.
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTransferConfirm(true)}
                    disabled={!transferTarget || transferring}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: !transferTarget || transferring ? colors.border : colors.warning, border: 'none', cursor: !transferTarget || transferring ? 'not-allowed' : 'pointer' }}>
                    {transferring ? 'Transferring…' : 'Transfer Ownership'}
                  </button>
                  <button onClick={() => { setShowTransfer(false); setTransferTarget(''); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Make Admin */}
          <div className="mb-4 pb-4" style={{ borderBottom: `1px solid ${colors.bgInput}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: colors.textPrimary }}>Make admin</p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Promote an approved member to admin. You stay the owner — ownership does not change.</p>
            {makeAdminError && (
              <p className="text-xs mb-2" style={{ color: colors.error }}>{makeAdminError}</p>
            )}
            {approvedOthers.filter(m => m.role !== 'admin').length === 0 ? (
              <p className="text-xs italic" style={{ color: colors.textTertiary }}>No approved members available to promote.</p>
            ) : !showMakeAdmin ? (
              <button onClick={() => { setShowMakeAdmin(true); setMakeAdminError(null); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: colors.accentLight, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
                <UserCog size={13} /> Make Admin
              </button>
            ) : (
              <div className="space-y-3">
                <select value={makeAdminTarget} onChange={e => { setMakeAdminTarget(e.target.value); setMakeAdminError(null); }}
                  className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                  style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}>
                  <option value="">Select an approved member…</option>
                  {approvedOthers.filter(m => m.role !== 'admin').map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.username || 'Unknown user'}
                    </option>
                  ))}
                </select>
                {makeAdminTarget && (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Promote <strong style={{ color: colors.textPrimary }}>
                      {approvedOthers.find(m => m.user_id === makeAdminTarget)?.username || 'this member'}
                    </strong> to admin? You will remain the owner.
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMakeAdminConfirm(true)}
                    disabled={!makeAdminTarget || makingAdmin}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: !makeAdminTarget || makingAdmin ? colors.border : themeColor, border: 'none', cursor: !makeAdminTarget || makingAdmin ? 'not-allowed' : 'pointer' }}>
                    {makingAdmin ? 'Promoting…' : 'Make Admin'}
                  </button>
                  <button onClick={() => { setShowMakeAdmin(false); setMakeAdminTarget(''); setMakeAdminError(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>

          {/* Delete room */}
          <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${colors.bgInput}` }}>
            <p className="text-xs font-bold mb-1" style={{ color: colors.error }}>Delete room</p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Deletes the room for all members. Cannot be undone.</p>
            {!showDelete ? (
              <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: colors.errorBg, color: colors.error, border: 'none', cursor: 'pointer' }}>
                <Trash2 size={13} /> Delete room
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg p-3" style={{ background: colors.errorBg }}>
                  <AlertTriangle size={16} color={colors.error} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs font-semibold" style={{ color: colors.error }}>
                    Are you sure you want to delete this room? This will remove the room for all members. This action cannot be undone.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: colors.error, border: 'none', cursor: 'pointer' }}>Yes, delete room</button>
                  <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transfer ownership confirmation modal */}
      {showTransferConfirm && transferTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: colors.overlay }} onClick={() => !transferring && setShowTransferConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: colors.bgCard }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} color={colors.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <h3 className="text-sm font-bold mb-2" style={{ color: colors.textPrimary }}>Transfer Ownership</h3>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  Are you sure you want to transfer ownership to{' '}
                  <strong style={{ color: colors.textPrimary }}>
                    {approvedOthers.find(m => m.user_id === transferTarget)?.username || 'this member'}
                  </strong>
                  ?{oldOwnerRole === 'admin' ? ' You will become an admin.' : ' You will become a normal member.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setTransferring(true);
                  try { await onTransfer(transferTarget, oldOwnerRole); setShowTransferConfirm(false); setShowTransfer(false); setTransferTarget(''); }
                  catch (e) { console.error(e); }
                  finally { setTransferring(false); }
                }}
                disabled={transferring}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: transferring ? colors.border : colors.warning, border: 'none', cursor: transferring ? 'not-allowed' : 'pointer' }}>
                {transferring ? 'Transferring…' : 'Yes, transfer'}
              </button>
              <button
                onClick={() => setShowTransferConfirm(false)}
                disabled={transferring}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: transferring ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Make Admin confirmation modal */}
      {showMakeAdminConfirm && makeAdminTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: colors.overlay }} onClick={() => !makingAdmin && setShowMakeAdminConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: colors.bgCard }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <UserCog size={20} color={themeColor} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <h3 className="text-sm font-bold mb-2" style={{ color: colors.textPrimary }}>Make Admin</h3>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  Make{' '}
                  <strong style={{ color: colors.textPrimary }}>
                    {approvedOthers.find(m => m.user_id === makeAdminTarget)?.username || 'this member'}
                  </strong>
                  {' '}an admin of this room? You will remain the owner.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setMakingAdmin(true); setMakeAdminError(null);
                  try {
                    await makeAdmin(room.id, makeAdminTarget);
                    setShowMakeAdminConfirm(false); setShowMakeAdmin(false); setMakeAdminTarget('');
                    onUpdated();
                  } catch (e) {
                    setMakeAdminError(e instanceof Error ? e.message : 'Failed to make admin.');
                  }
                  finally { setMakingAdmin(false); }
                }}
                disabled={makingAdmin}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                style={{ background: makingAdmin ? colors.border : themeColor, border: 'none', cursor: makingAdmin ? 'not-allowed' : 'pointer' }}>
                {makingAdmin ? 'Promoting…' : 'Yes, make admin'}
              </button>
              <button
                onClick={() => setShowMakeAdminConfirm(false)}
                disabled={makingAdmin}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: makingAdmin ? 'not-allowed' : 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
