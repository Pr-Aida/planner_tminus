import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Copy, Check, RefreshCw, Users, Clock, Trophy, Settings,
  UserPlus, Trash2, X, Loader2, Link as LinkIcon, Search, LogOut, AlertTriangle,
} from 'lucide-react';
import type { StudyRoom, RoomMember, RoomMemberActivity } from '../types';
import {
  fetchRoomById, fetchMembers, fetchMyMembership, fetchRoomActivity,
  updateRoom, regenerateInviteCode, deleteRoom,
  approveMember, rejectMember, removeMember, leaveRoom, transferOwnership,
  updateMySharing, requestToJoin, searchUserByUsername, inviteByUsername,
  acceptInvite, declineInvite,
} from '../lib/studyRooms';

interface Props {
  roomId: string;
  userId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'members' | 'settings';

export default function RoomProfileView({ roomId, userId, onBack }: Props) {
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [myMembership, setMyMembership] = useState<RoomMember | null>(null);
  const [activityToday, setActivityToday] = useState<RoomMemberActivity[]>([]);
  const [activityWeek, setActivityWeek] = useState<RoomMemberActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, ms, mm] = await Promise.all([
        fetchRoomById(roomId),
        fetchMembers(roomId),
        fetchMyMembership(roomId, userId),
      ]);
      setRoom(r);
      setMembers(ms);
      setMyMembership(mm);

      // Only fetch activity if I'm an approved member or owner.
      const isApproved = mm?.status === 'approved' || r?.owner_id === userId;
      if (isApproved) {
        const [today, week] = await Promise.all([
          fetchRoomActivity(roomId, 'today'),
          fetchRoomActivity(roomId, 'week'),
        ]);
        setActivityToday(today);
        setActivityWeek(week);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  useEffect(() => { load(); }, [load]);

  const isOwner = room?.owner_id === userId;
  const isApproved = myMembership?.status === 'approved' || isOwner;
  const myStatus = myMembership?.status;

  function copy(text: string, which: 'link' | 'code') {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 flex justify-center">
        <Loader2 className="animate-spin" size={24} color="#9CA3AF" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 text-center">
        <p style={{ color: '#6B6B6B' }}>This room no longer exists or you don't have access.</p>
        <button onClick={onBack} className="mt-4 text-sm font-semibold" style={{ color: '#1B2A4A' }}>← Back</button>
      </div>
    );
  }

  const inviteLink = `${window.location.origin}/room/${room.invite_code}`;
  const approvedMembers = members.filter(m => m.status === 'approved');
  const pendingRequests = members.filter(m => m.status === 'pending');

  // ─── Pending / non-approved view (limited preview) ─────────────────────────
  if (!isApproved) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6">
        <BackButton onBack={onBack} />
        <RoomHeader room={room} membersCount={approvedMembers.length} />
        <PendingPanel
          status={myStatus}
          room={room}
          userId={userId}
          onChanged={load}
        />
      </div>
    );
  }

  // ─── Approved member / owner view ───────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <BackButton onBack={onBack} />

      <RoomHeader room={room} membersCount={approvedMembers.length} />

      {/* Invite link + code (visible to approved members; owner can manage) */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <LinkIcon size={14} color="#7B1C3E" />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>
            Invite
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center rounded-lg px-3 py-2 gap-2" style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}>
            <span className="text-xs flex-1 truncate font-mono" style={{ color: '#1B2A4A' }}>{inviteLink}</span>
            <button
              onClick={() => copy(inviteLink, 'link')}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded"
              style={{ background: '#1B2A4A', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              {copied === 'link' ? <Check size={12} /> : <Copy size={12} />} Copy
            </button>
          </div>
          <div className="flex items-center rounded-lg px-3 py-2 gap-2" style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}>
            <span className="text-xs font-mono font-bold" style={{ color: '#1B2A4A' }}>{room.room_code}</span>
            <button
              onClick={() => copy(room.room_code, 'code')}
              className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded"
              style={{ background: '#E8EBF4', color: '#1B2A4A', border: 'none', cursor: 'pointer' }}
            >
              {copied === 'code' ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
        {!room.invite_enabled && (
          <p className="text-xs mt-2" style={{ color: '#B45309' }}>Invite link is disabled by the owner.</p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {([
          { k: 'overview', label: 'Overview' },
          { k: 'members', label: `Members (${approvedMembers.length})` },
          ...(isOwner ? [{ k: 'settings', label: 'Settings' }] : []),
        ] as { k: Tab; label: string }[]).map(t => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={{
              background: tab === t.k ? '#1B2A4A' : 'transparent',
              color: tab === t.k ? '#fff' : '#6B6B6B',
              border: 'none', cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          room={room}
          activityToday={activityToday}
          activityWeek={activityWeek}
          isOwner={isOwner}
        />
      )}

      {tab === 'members' && (
        <MembersTab
          room={room}
          members={members}
          isOwner={isOwner}
          currentUserId={userId}
          pendingRequests={pendingRequests}
          onApprove={(uid) => approveMember(room.id, uid).then(load)}
          onReject={(uid) => rejectMember(room.id, uid).then(load)}
          onRemove={(uid) => removeMember(room.id, uid).then(load)}
          onInvite={(uid) => inviteByUsername(room.id, uid, userId).then(load)}
        />
      )}

      {tab === 'settings' && isOwner && (
        <SettingsTab
          room={room}
          onUpdated={() => load()}
          onRegenerate={() => regenerateInviteCode(room.id).then(load)}
          onDelete={async () => { await deleteRoom(room.id); onBack(); }}
        />
      )}

      {/* My privacy controls — always visible to approved members */}
      {myMembership && (
        <PrivacyPanel
          membership={myMembership}
          onChanged={async (patch) => {
            await updateMySharing(room.id, userId, patch);
            load();
          }}
        />
      )}

      {/* Leave room (non-owner) */}
      {!isOwner && myMembership && (
        <div className="mt-4">
          <button
            onClick={async () => { await leaveRoom(room.id, userId); onBack(); }}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ background: '#fff', color: '#B91C1C', border: '1.5px solid #FECACA', cursor: 'pointer' }}
          >
            <LogOut size={13} /> Leave room
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Room header ───────────────────────────────────────────────────────────────
function RoomHeader({ room, membersCount }: { room: StudyRoom; membersCount: number }) {
  return (
    <div
      className="rounded-xl p-6 mb-4 flex items-center gap-4"
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
    >
      {room.avatar_url ? (
        <img src={room.avatar_url} alt="" className="rounded-xl object-cover" style={{ width: 64, height: 64 }} />
      ) : (
        <div
          className="rounded-xl flex items-center justify-center text-white font-extrabold text-xl"
          style={{ width: 64, height: 64, background: room.theme_color }}
        >
          {room.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-xl font-extrabold truncate" style={{ color: '#1B2A4A' }}>{room.name}</h1>
        {room.description && (
          <p className="text-sm mt-1" style={{ color: '#6B6B6B' }}>{room.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs" style={{ color: '#9CA3AF' }}>
            <Users size={12} /> {membersCount} member{membersCount === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1 text-xs font-mono" style={{ color: '#9CA3AF' }}>
            {room.room_code}
          </span>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1 text-xs font-semibold mb-4"
      style={{ color: '#1B2A4A', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      <ArrowLeft size={14} /> Back to rooms
    </button>
  );
}

// ─── Pending panel (non-approved users) ───────────────────────────────────────
function PendingPanel({
  status, room, userId, onChanged,
}: {
  status: RoomMember['status'] | undefined;
  room: StudyRoom;
  userId: string;
  onChanged: () => void;
}) {
  const [requesting, setRequesting] = useState(false);

  async function handleRequest() {
    setRequesting(true);
    try {
      await requestToJoin(room.id, userId);
      onChanged();
    } catch (e) {
      console.error(e);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
    >
      {status === 'pending' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center rounded-full mb-3" style={{ width: 48, height: 48, background: '#FEF3C7' }}>
            <Clock size={22} color="#B45309" />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: '#1B2A4A' }}>Request pending</p>
          <p className="text-xs" style={{ color: '#6B6B6B' }}>
            Your request to join this room is pending approval. You'll see shared activity once the owner approves.
          </p>
        </div>
      )}
      {status === 'invited' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center rounded-full mb-3" style={{ width: 48, height: 48, background: '#E6F6EF' }}>
            <UserPlus size={22} color="#059669" />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: '#1B2A4A' }}>You've been invited</p>
          <p className="text-xs mb-4" style={{ color: '#6B6B6B' }}>Accept the invitation to join this room.</p>
          <AcceptDeclineButtons roomId={room.id} userId={userId} onChanged={onChanged} />
        </div>
      )}
      {status === 'rejected' && (
        <div className="text-center">
          <div className="inline-flex items-center justify-center rounded-full mb-3" style={{ width: 48, height: 48, background: '#FEE2E2' }}>
            <X size={22} color="#B91C1C" />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: '#1B2A4A' }}>Request declined</p>
          <p className="text-xs mb-4" style={{ color: '#6B6B6B' }}>The owner declined your request. You can request again.</p>
          <button
            onClick={handleRequest}
            disabled={requesting}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: '#1B2A4A', border: 'none', cursor: requesting ? 'not-allowed' : 'pointer' }}
          >
            {requesting ? 'Requesting…' : 'Request to join again'}
          </button>
        </div>
      )}
      {(status === undefined || status === 'left' || status === 'removed' || status === 'declined') && (
        <div className="text-center">
          <p className="text-sm mb-4" style={{ color: '#6B6B6B' }}>
            This is a private study room. Request to join — the owner will review your request.
          </p>
          <button
            onClick={handleRequest}
            disabled={requesting}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: '#1B2A4A', border: 'none', cursor: requesting ? 'not-allowed' : 'pointer' }}
          >
            {requesting ? 'Requesting…' : 'Request to join'}
          </button>
        </div>
      )}
    </div>
  );
}

function AcceptDeclineButtons({ roomId, userId, onChanged }: { roomId: string; userId: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex gap-2 justify-center">
      <button
        onClick={async () => { setBusy(true); try { await acceptInvite(roomId, userId); onChanged(); } finally { setBusy(false); } }}
        disabled={busy}
        className="px-4 py-2 rounded-lg text-xs font-bold text-white"
        style={{ background: '#059669', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        Accept
      </button>
      <button
        onClick={async () => { setBusy(true); try { await declineInvite(roomId, userId); onChanged(); } finally { setBusy(false); } }}
        disabled={busy}
        className="px-4 py-2 rounded-lg text-xs font-semibold"
        style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        Decline
      </button>
    </div>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({
  room, activityToday, activityWeek, isOwner,
}: {
  room: StudyRoom;
  activityToday: RoomMemberActivity[];
  activityWeek: RoomMemberActivity[];
  isOwner: boolean;
}) {
  const totalToday = activityToday.reduce((s, a) => s + a.minutes, 0);
  const totalWeek = activityWeek.reduce((s, a) => s + a.minutes, 0);
  const sortedToday = [...activityToday].sort((a, b) => b.minutes - a.minutes);
  const sortedWeek = [...activityWeek].sort((a, b) => b.minutes - a.minutes);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <StatCard icon={<Clock size={16} />} label="Today's focus" value={fmtMin(totalToday)} color="#1B2A4A" />
        <StatCard icon={<Trophy size={16} />} label="This week" value={fmtMin(totalWeek)} color="#7B1C3E" />
      </div>

      {room.leaderboard_enabled && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Leaderboard title="Today" rows={sortedToday} />
          <Leaderboard title="This week" rows={sortedWeek} />
        </div>
      )}

      {!isOwner && (
        <p className="text-xs px-1" style={{ color: '#9CA3AF' }}>
          Only your Activity-section time is shared. Habits, notes, reminders, and other planner data stay private.
        </p>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
      </div>
      <p className="text-2xl font-extrabold" style={{ color: '#1B2A4A' }}>{value}</p>
    </div>
  );
}

function Leaderboard({ title, rows }: { title: string; rows: RoomMemberActivity[] }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7B1C3E' }}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs" style={{ color: '#C8C8C8' }}>No activity yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-2">
              <span className="text-xs font-bold w-5" style={{ color: i < 3 ? '#7B1C3E' : '#C8C8C8' }}>{i + 1}</span>
              {r.avatar_url ? (
                <img src={r.avatar_url} alt="" className="rounded-full object-cover" style={{ width: 22, height: 22 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ width: 22, height: 22, background: '#1B2A4A' }}>
                  {(r.display_name || r.username || '?').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs font-medium flex-1 truncate" style={{ color: '#1B2A4A' }}>
                {r.display_name || r.username}
              </span>
              {r.active_now && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#E6F6EF', color: '#059669' }}>now</span>}
              <span className="text-xs font-bold" style={{ color: r.hidden ? '#C8C8C8' : '#1B2A4A' }}>
                {r.hidden ? '—' : fmtMin(r.minutes)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Members tab ───────────────────────────────────────────────────────────────
function MembersTab({
  room, members, isOwner, currentUserId, pendingRequests,
  onApprove, onReject, onRemove, onInvite,
}: {
  room: StudyRoom;
  members: RoomMember[];
  isOwner: boolean;
  currentUserId: string;
  pendingRequests: RoomMember[];
  onApprove: (uid: string) => Promise<void>;
  onReject: (uid: string) => Promise<void>;
  onRemove: (uid: string) => Promise<void>;
  onInvite: (uid: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [searchResult, setSearchResult] = useState<{ id: string; username: string; display_name: string; avatar_url: string | null } | null>(null);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  async function handleSearch() {
    if (!search.trim()) return;
    setSearching(true);
    setInviteMsg(null);
    try {
      const r = await searchUserByUsername(search);
      setSearchResult(r);
      if (!r) setInviteMsg('No user found with that username.');
    } catch {
      setInviteMsg('Search failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleInvite() {
    if (!searchResult) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await onInvite(searchResult.id);
      setInviteMsg(`Invitation sent to @${searchResult.username}.`);
      setSearchResult(null);
      setSearch('');
    } catch (e: unknown) {
      setInviteMsg(e instanceof Error ? e.message : 'Could not send invitation.');
    } finally {
      setInviting(false);
    }
  }

  const approved = members.filter(m => m.status === 'approved');

  return (
    <div className="space-y-4">
      {/* Pending requests (owner only) */}
      {isOwner && pendingRequests.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#B45309' }}>
            Pending requests ({pendingRequests.length})
          </p>
          <div className="space-y-2">
            {pendingRequests.map(m => (
              <div key={m.id} className="flex items-center gap-2">
                <MemberAvatar m={m} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: '#1B2A4A' }}>{m.display_name || m.username}</p>
                  <p className="text-xs" style={{ color: '#9CA3AF' }}>@{m.username}</p>
                </div>
                <button
                  onClick={() => onApprove(m.user_id)}
                  className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg text-white"
                  style={{ background: '#059669', border: 'none', cursor: 'pointer' }}
                >
                  <Check size={12} /> Approve
                </button>
                <button
                  onClick={() => onReject(m.user_id)}
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                  style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', cursor: 'pointer' }}
                >
                  <X size={12} /> Reject
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite by username (owner only) */}
      {isOwner && (
        <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7B1C3E' }}>
            Invite by username
          </p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center rounded-lg px-3 gap-2" style={{ border: '1.5px solid #E8EBF4', background: '#F8F9FC' }}>
              <Search size={14} color="#9CA3AF" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Enter username"
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: '#111', border: 'none', fontFamily: 'inherit' }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={searching || !search.trim()}
              className="px-4 rounded-lg text-xs font-bold text-white"
              style={{ background: '#1B2A4A', border: 'none', cursor: searching || !search.trim() ? 'not-allowed' : 'pointer', opacity: searching || !search.trim() ? 0.6 : 1 }}
            >
              {searching ? '…' : 'Find'}
            </button>
          </div>
          {searchResult && (
            <div className="mt-3 flex items-center gap-2 rounded-lg p-2" style={{ background: '#F8F9FC' }}>
              <MemberAvatar m={searchResult} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#1B2A4A' }}>{searchResult.display_name || searchResult.username}</p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>@{searchResult.username}</p>
              </div>
              <button
                onClick={handleInvite}
                disabled={inviting}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg text-white"
                style={{ background: '#059669', border: 'none', cursor: inviting ? 'not-allowed' : 'pointer' }}
              >
                {inviting ? '…' : 'Send invite'}
              </button>
            </div>
          )}
          {inviteMsg && <p className="text-xs mt-2" style={{ color: '#6B6B6B' }}>{inviteMsg}</p>}
        </div>
      )}

      {/* Approved members list */}
      <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7B1C3E' }}>
          Members ({approved.length})
        </p>
        <div className="space-y-2">
          {approved.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <MemberAvatar m={m} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: '#1B2A4A' }}>
                  {m.display_name || m.username}
                  {m.role === 'owner' && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: '#F5E6EC', color: '#7B1C3E' }}>Admin</span>
                  )}
                  {m.user_id === currentUserId && (
                    <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ background: '#E8EBF4', color: '#1B2A4A' }}>You</span>
                  )}
                </p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>@{m.username}</p>
              </div>
              {isOwner && m.user_id !== room.owner_id && (
                <button
                  onClick={() => onRemove(m.user_id)}
                  className="p-1 rounded transition-colors"
                  style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: '#C8C8C8' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#B91C1C')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#C8C8C8')}
                  title="Remove member"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemberAvatar({ m }: { m: { avatar_url?: string | null; display_name?: string; username?: string } }) {
  if (m.avatar_url) {
    return <img src={m.avatar_url} alt="" className="rounded-full object-cover" style={{ width: 32, height: 32 }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ width: 32, height: 32, background: '#1B2A4A' }}>
      {(m.display_name || m.username || '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Settings tab (owner only) ─────────────────────────────────────────────────
function SettingsTab({
  room, onUpdated, onRegenerate, onDelete,
}: {
  room: StudyRoom;
  onUpdated: () => void;
  onRegenerate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [avatarUrl, setAvatarUrl] = useState(room.avatar_url || '');
  const [themeColor, setThemeColor] = useState(room.theme_color);
  const [inviteEnabled, setInviteEnabled] = useState(room.invite_enabled);
  const [leaderboardEnabled, setLeaderboardEnabled] = useState(room.leaderboard_enabled);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateRoom(room.id, {
        name: name.trim(),
        description: description.trim(),
        avatar_url: avatarUrl.trim() || null,
        theme_color: themeColor,
        invite_enabled: inviteEnabled,
        leaderboard_enabled: leaderboardEnabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#7B1C3E' }}>Room details</p>

        <Field label="Room name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={60}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={inputStyle} />
        </Field>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={200} rows={2}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none resize-none"
            style={inputStyle} />
        </Field>

        <Field label="Avatar image URL">
          <input type="text" value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://…"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
            style={inputStyle} />
        </Field>

        <Field label="Theme color">
          <div className="flex gap-2">
            {['#1B2A4A', '#7B1C3E', '#059669', '#B45309', '#2563EB', '#7c3aed'].map(c => (
              <button key={c} onClick={() => setThemeColor(c)} className="rounded-full"
                style={{ width: 26, height: 26, background: c, cursor: 'pointer',
                  border: themeColor === c ? '2px solid #1B2A4A' : '2px solid transparent' }} />
            ))}
          </div>
        </Field>

        <Toggle label="Invite link enabled" checked={inviteEnabled} onChange={setInviteEnabled} />
        <Toggle label="Leaderboard enabled" checked={leaderboardEnabled} onChange={setLeaderboardEnabled} />

        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="mt-4 px-4 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1"
          style={{ background: '#1B2A4A', border: 'none', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer', opacity: saving || !name.trim() ? 0.6 : 1 }}
        >
          {saved ? <Check size={14} /> : <Settings size={14} />} {saved ? 'Saved' : 'Save changes'}
        </button>
      </div>

      {/* Invite link management */}
      <div className="rounded-xl p-5" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#7B1C3E' }}>Invite link</p>
        <p className="text-xs mb-3" style={{ color: '#6B6B6B' }}>
          Regenerating the link invalidates the old one. Anyone with the link can only request to join — you still approve.
        </p>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#F5E6EC', color: '#7B1C3E', border: 'none', cursor: regenerating ? 'not-allowed' : 'pointer' }}
        >
          <RefreshCw size={13} className={regenerating ? 'animate-spin' : ''} /> Regenerate invite link
        </button>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl p-5" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)', border: '1.5px solid #FECACA' }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#B91C1C' }}>Delete room</p>
        <p className="text-xs mb-3" style={{ color: '#6B6B6B' }}>
          Deleting a room removes all members and shared activity. This cannot be undone.
        </p>
        {!showDelete ? (
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', cursor: 'pointer' }}
          >
            <Trash2 size={13} /> Delete room
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} color="#B91C1C" />
            <span className="text-xs font-semibold" style={{ color: '#B91C1C' }}>Are you sure?</span>
            <button onClick={onDelete} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#B91C1C', border: 'none', cursor: 'pointer' }}>Yes, delete</button>
            <button onClick={() => setShowDelete(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Privacy panel (each member controls their sharing) ────────────────────────
function PrivacyPanel({
  membership, onChanged,
}: {
  membership: RoomMember;
  onChanged: (patch: Partial<Pick<RoomMember, 'share_today' | 'share_weekly' | 'show_active_now' | 'hide_activity'>>) => Promise<void>;
}) {
  return (
    <div className="rounded-xl p-5 mt-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#7B1C3E' }}>My privacy</p>
      <p className="text-xs mb-3" style={{ color: '#6B6B6B' }}>
        Control what you share with this room. Only Activity-section time is ever shared.
      </p>
      <Toggle label="Share today's activity time" checked={membership.share_today && !membership.hide_activity}
        onChange={v => onChanged({ share_today: v, hide_activity: false })} />
      <Toggle label="Share weekly activity total" checked={membership.share_weekly && !membership.hide_activity}
        onChange={v => onChanged({ share_weekly: v, hide_activity: false })} />
      <Toggle label="Show me as active now" checked={membership.show_active_now}
        onChange={v => onChanged({ show_active_now: v })} />
      <Toggle label="Hide all my activity from this room" checked={membership.hide_activity}
        onChange={v => onChanged({ hide_activity: v })} />
    </div>
  );
}

// ─── Small primitives ──────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = { border: '1.5px solid #E8EBF4', background: '#F8F9FC', fontFamily: 'inherit', color: '#111' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#6B6B6B' }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm" style={{ color: '#1B2A4A' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className="relative rounded-full transition-colors"
        style={{ width: 40, height: 22, background: checked ? '#059669' : '#D1D5DB', border: 'none', cursor: 'pointer' }}
      >
        <span
          className="absolute rounded-full bg-white transition-all"
          style={{ width: 18, height: 18, top: 2, left: checked ? 20 : 2 }}
        />
      </button>
    </div>
  );
}

function fmtMin(min: number): string {
  if (min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
