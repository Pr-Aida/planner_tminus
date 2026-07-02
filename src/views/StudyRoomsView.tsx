import { useState, useEffect, useCallback, useRef, Component, type ReactNode } from 'react';
import { Plus, Users, KeyRound, ArrowLeft, Check, Loader2, MoreVertical, Trash2, LogOut, DoorOpen, UserCog, X, AlertTriangle, Mail } from 'lucide-react';
import type { StudyRoom, RoomMemberStatus, RoomMember, RoomInvite } from '../types';
import {
  fetchMyRooms, createRoom, fetchRoomByCode, deleteRoom, leaveRoom, transferOwnership, fetchMembers,
  fetchMyInvites, acceptInvite, declineInvite,
} from '../lib/studyRooms';
import RoomProfileView from '../components/RoomProfileView';
import { supabase } from '../lib/supabase';

// ─── Error Boundary for Room pages ──────────────────────────────────────────
interface ErrorBoundaryProps {
  children: ReactNode;
  onBack: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RoomErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RoomErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={this.props.onBack} className="flex items-center gap-1.5 text-xs font-semibold mb-6" style={{ color: '#1B2A4A', background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="rounded-xl p-6 text-center" style={{ background: '#FEE2E2' }}>
            <AlertTriangle size={28} color="#B91C1C" className="mx-auto mb-3" />
            <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>Something went wrong while loading this room.</p>
            <p className="text-xs mt-2 mb-4" style={{ color: '#6B6B6B' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button onClick={this.props.onBack} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}>
              Back to Rooms
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Study Rooms View ──────────────────────────────────────────────────
interface Props {
  userId: string;
  onOpenRoom: (roomId: string) => void;
  initialOpenRoomId?: string | null;
}

const THEME_COLORS = ['#1B2A4A', '#7B1C3E', '#059669', '#B45309', '#2563EB', '#7c3aed'];

export default function StudyRoomsView({ userId, initialOpenRoomId }: Props) {
  const [rooms, setRooms] = useState<(StudyRoom & { my_status: RoomMemberStatus })[]>([]);
  const [invites, setInvites] = useState<(RoomInvite & { room_name?: string; inviter_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [openRoomId, setOpenRoomId] = useState<string | null>(initialOpenRoomId || null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, i] = await Promise.all([
        fetchMyRooms(),
        fetchMyInvites(userId),
      ]);
      setRooms(r);
      setInvites(i);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription for invites and membership changes
  useEffect(() => {
    const invitesChannel = supabase.channel(`my_invites:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'study_room_invites',
        filter: `invitee_user_id=eq.${userId}`,
      }, () => { load(); })
      .subscribe();

    const membersChannel = supabase.channel(`my_memberships:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'study_room_members',
        filter: `user_id=eq.${userId}`,
      }, () => { load(); })
      .subscribe();

    return () => {
      supabase.removeChannel(invitesChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [userId, load]);

  if (openRoomId) {
    return (
      <RoomErrorBoundary onBack={() => setOpenRoomId(null)}>
        <RoomProfileView
          roomId={openRoomId}
          userId={userId}
          onBack={() => { setOpenRoomId(null); load(); }}
        />
      </RoomErrorBoundary>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: '#1B2A4A' }}>Study Rooms</h1>
          <p className="text-sm mt-1" style={{ color: '#6B6B6B' }}>
            Focus together. Only your Activity time is shared — your planner stays private.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowJoin(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#fff', color: '#1B2A4A', border: '1.5px solid #E8EBF4', cursor: 'pointer' }}
          >
            <KeyRound size={14} /> Join by code
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}
          >
            <Plus size={14} /> Create Room
          </button>
        </div>
      </div>

      {/* Room Invitations Section */}
      {invites.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Mail size={16} color="#7B1C3E" />
            <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>Room Invitations</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {invites.map(invite => (
              <InvitationCard
                key={invite.id}
                invite={invite}
                onAccept={async () => {
                  await acceptInvite(invite.room_id, userId);
                  load();
                }}
                onDecline={async () => {
                  await declineInvite(invite.room_id, userId);
                  load();
                }}
              />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} color="#9CA3AF" />
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <RoomCard
              key={room.id}
              room={room}
              userId={userId}
              onOpen={() => setOpenRoomId(room.id)}
              onLeftOrDeleted={load}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateRoomModal
          userId={userId}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); setOpenRoomId(id); load(); }}
        />
      )}

      {showJoin && (
        <JoinByCodeModal
          onClose={() => setShowJoin(false)}
          onFound={(id) => { setShowJoin(false); setOpenRoomId(id); }}
        />
      )}
    </div>
  );
}

// ─── Invitation Card ────────────────────────────────────────────────────────
function InvitationCard({
  invite,
  onAccept,
  onDecline,
}: {
  invite: RoomInvite & { room_name?: string; inviter_name?: string };
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [acting, setActing] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const handleAccept = async () => {
    setActing(true); setAccepting(true);
    try { await onAccept(); }
    finally { setActing(false); }
  };

  const handleDecline = async () => {
    setActing(true); setAccepting(false);
    try { await onDecline(); }
    finally { setActing(false); }
  };

  return (
    <div className="rounded-xl p-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)', border: '1.5px solid #FEF3C7' }}>
      <p className="text-sm font-bold" style={{ color: '#1B2A4A' }}>{invite.room_name || 'Study Room'}</p>
      <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>
        Invited by {invite.inviter_name || 'a member'}
      </p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleAccept}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold text-white"
          style={{ background: acting && accepting ? '#9CA3AF' : '#059669', border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}
        >
          {acting && accepting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={acting}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}
        >
          {acting && !accepting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Decline
        </button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      className="rounded-xl p-10 text-center"
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
    >
      <div
        className="inline-flex items-center justify-center rounded-full mb-4"
        style={{ width: 56, height: 56, background: '#F5E6EC' }}
      >
        <Users size={26} color="#7B1C3E" />
      </div>
      <h2 className="text-lg font-bold mb-1" style={{ color: '#1B2A4A' }}>No study rooms yet</h2>
      <p className="text-sm mb-5" style={{ color: '#6B6B6B' }}>
        Create a room and invite people by link or username. Only Activity time is shared.
      </p>
      <button
        onClick={onCreate}
        className="px-4 py-2.5 rounded-lg text-sm font-bold text-white"
        style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}
      >
        Create your first room
      </button>
    </div>
  );
}

// ─── Room card with three-dot action menu ──────────────────────────────────────
function RoomCard({
  room, userId, onOpen, onLeftOrDeleted,
}: {
  room: StudyRoom & { my_status: RoomMemberStatus };
  userId: string;
  onOpen: () => void;
  onLeftOrDeleted: () => void;
}) {
  const statusLabel: Record<RoomMemberStatus, string> = {
    approved: 'Member',
    pending: 'Request pending',
    invited: 'Invited',
    rejected: 'Rejected',
    declined: 'Declined',
    left: 'Left',
    removed: 'Removed',
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'delete' | 'leave' | 'transfer'>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOwner = room.owner_id === userId;
  const myStatus = room.my_status;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (confirm !== 'transfer') return;
    fetchMembers(room.id).then(setMembers).catch(() => {});
  }, [confirm, room.id]);

  const approvedOthers = members.filter(
    (m) => m.status === 'approved' && m.user_id !== userId
  );

  const handleDelete = async () => {
    setBusy(true);
    try { await deleteRoom(room.id); onLeftOrDeleted(); }
    catch (e) { console.error(e); }
    finally { setBusy(false); setConfirm(null); }
  };

  const handleLeave = async () => {
    setBusy(true);
    try { await leaveRoom(room.id, userId); onLeftOrDeleted(); }
    catch (e) { console.error(e); }
    finally { setBusy(false); setConfirm(null); }
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    setBusy(true);
    try {
      await transferOwnership(room.id, transferTarget);
      // DON'T leave the room - previous owner stays as member
      onLeftOrDeleted();
    } catch (e) { console.error(e); }
    finally { setBusy(false); setConfirm(null); setShowTransferConfirm(false); setTransferTarget(''); }
  };

  return (
    <>
      <div
        onClick={onOpen}
        className="relative rounded-xl p-4 cursor-pointer transition-all duration-150 group"
        style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)', border: '1.5px solid #F2F2F2' }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 20px rgba(27,42,74,0.18)'; e.currentTarget.style.borderColor = '#7B1C3E'; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(27,42,74,0.10)'; e.currentTarget.style.borderColor = '#F2F2F2'; }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {room.profile_image_url ? (
              <img src={room.profile_image_url} alt="" className="rounded-lg object-cover flex-shrink-0" style={{ width: 44, height: 44 }} />
            ) : (
              <div
                className="rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                style={{ width: 44, height: 44, background: room.theme_color }}
              >
                {room.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: '#1B2A4A' }}>{room.name}</p>
              <p className="text-xs" style={{ color: '#9CA3AF' }}>Code: {room.room_code}</p>
            </div>
          </div>

          {/* Three-dot menu */}
          <div ref={menuRef} className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: menuOpen ? '#F2F2F2' : 'transparent', border: 'none', cursor: 'pointer' }}
              aria-label="Room actions"
            >
              <MoreVertical size={18} color="#6B6B6B" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-1 z-50 rounded-xl py-1.5 min-w-[180px]"
                style={{ background: '#fff', boxShadow: '0 8px 30px rgba(27,42,74,0.18)', border: '1px solid #E8E8E8' }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setMenuOpen(false); onOpen(); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-left transition-colors hover:bg-gray-50"
                  style={{ color: '#1B2A4A', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <DoorOpen size={14} /> Open Room
                </button>

                <div className="my-1" style={{ borderTop: '1px solid #F2F2F2' }} />

                {isOwner && (
                  <button
                    onClick={() => { setMenuOpen(false); setConfirm('transfer'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-left transition-colors hover:bg-gray-50"
                    style={{ color: '#92400E', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <UserCog size={14} /> Transfer Ownership
                  </button>
                )}

                <button
                  onClick={() => { setMenuOpen(false); setConfirm('leave'); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-left transition-colors hover:bg-gray-50"
                  style={{ color: '#B45309', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                  <LogOut size={14} /> Leave Room
                </button>

                {isOwner && (
                  <button
                    onClick={() => { setMenuOpen(false); setConfirm('delete'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-left transition-colors hover:bg-red-50"
                    style={{ color: '#B91C1C', border: 'none', background: 'transparent', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} /> Delete Room
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {room.description && (
          <p className="text-xs mb-3 line-clamp-2" style={{ color: '#6B6B6B' }}>{room.description}</p>
        )}

        <span
          className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{
            background: room.my_status === 'approved' ? '#E6F6EF' : '#FEF3C7',
            color: room.my_status === 'approved' ? '#059669' : '#B45309',
          }}
        >
          {statusLabel[room.my_status]}
        </span>
      </div>

      {/* Delete confirmation */}
      {confirm === 'delete' && (
        <ConfirmModal
          title="Delete Room"
          message="Are you sure you want to delete this room? This will remove the room for all members. This action cannot be undone."
          confirmLabel="Yes, delete room"
          danger
          busy={busy}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Leave confirmation */}
      {confirm === 'leave' && (
        <ConfirmModal
          title="Leave Room"
          message={isOwner
            ? (approvedOthers.length > 0
              ? "You must transfer ownership to another approved member before leaving this room, or delete the room completely."
              : "There are no other approved members to transfer ownership to. You can either keep the room or delete it.")
            : "Are you sure you want to leave this room? The room will remain available for other members."}
          confirmLabel={isOwner ? undefined : "Yes, leave room"}
          busy={busy}
          onConfirm={isOwner ? () => setConfirm(null) : handleLeave}
          onCancel={() => setConfirm(null)}
          extraActions={isOwner && approvedOthers.length > 0 ? (
            <button
              onClick={() => setConfirm('transfer')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={{ background: '#FEF3C7', color: '#92400E', border: 'none', cursor: 'pointer' }}
            >
              Transfer ownership
            </button>
          ) : undefined}
        />
      )}

      {/* Transfer ownership modal */}
      {confirm === 'transfer' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => !busy && setConfirm(null)}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: '#1B2A4A' }}>Transfer Ownership</h3>
              <button onClick={() => setConfirm(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} color="#6B6B6B" /></button>
            </div>
            {approvedOthers.length === 0 ? (
              <p className="text-xs" style={{ color: '#6B6B6B' }}>
                There are no other approved members to transfer ownership to. You can either keep the room or delete it.
              </p>
            ) : !showTransferConfirm ? (
              <>
                <p className="text-xs mb-3" style={{ color: '#6B6B6B' }}>
                  Select an approved member to become the new owner. You will remain as a member after the transfer.
                </p>
                <select
                  value={transferTarget}
                  onChange={e => setTransferTarget(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-xs mb-3 outline-none"
                  style={{ border: '1.5px solid #C8C8C8', background: '#F8F8F8', color: '#111' }}
                >
                  <option value="">Select a member…</option>
                  {approvedOthers.map(m => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.username || m.user_id.slice(0, 8)}{m.role === 'admin' ? ' (admin)' : ''}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTransferConfirm(true)}
                    disabled={!transferTarget || busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: !transferTarget || busy ? '#9CA3AF' : '#92400E', border: 'none', cursor: !transferTarget || busy ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                  <button onClick={() => setConfirm(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle size={20} color="#92400E" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p className="text-xs" style={{ color: '#6B6B6B' }}>
                    Are you sure you want to transfer ownership to{' '}
                    <strong style={{ color: '#1B2A4A' }}>
                      {approvedOthers.find(m => m.user_id === transferTarget)?.username || 'this member'}
                    </strong>
                    ? You will no longer be the owner.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTransfer}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: busy ? '#9CA3AF' : '#92400E', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}
                  >
                    {busy ? 'Transferring…' : 'Yes, transfer'}
                  </button>
                  <button onClick={() => setShowTransferConfirm(false)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}>Back</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Reusable confirmation modal ────────────────────────────────────────────────
function ConfirmModal({
  title, message, confirmLabel, danger, busy, onConfirm, onCancel, extraActions,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  extraActions?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          {danger && <AlertTriangle size={20} color="#B91C1C" style={{ flexShrink: 0, marginTop: 1 }} />}
          <div>
            <h3 className="text-sm font-bold mb-2" style={{ color: '#1B2A4A' }}>{title}</h3>
            <p className="text-xs" style={{ color: '#6B6B6B' }}>{message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {confirmLabel && (
            <button
              onClick={onConfirm}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ background: busy ? '#9CA3AF' : (danger ? '#B91C1C' : '#1B2A4A'), border: 'none', cursor: busy ? 'not-allowed' : 'pointer' }}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          )}
          {extraActions}
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create room modal ────────────────────────────────────────────────────────
function CreateRoomModal({
  userId, onClose, onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [theme, setTheme] = useState(THEME_COLORS[0]);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Image file is too large. Maximum 5 MB.'); return; }
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setError('Unsupported image format. Use PNG, JPG, or WEBP.'); return;
    }
    setError(null);
    setProfileImage(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const room = await createRoom({ name, description, theme_color: theme, profileImage }, userId);
      setSuccess('Study Room created successfully.');
      setTimeout(() => onCreated(room.id), 900);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Room creation failed. Please try again.';
      setError(msg);
      // eslint-disable-next-line no-console
      console.error('[CreateRoom] full error:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Create Study Room" onClose={onClose}>
      <Label>Room name</Label>
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. PhD Study Room"
        maxLength={60}
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-4"
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
        onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
      />

      <Label>Description <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></Label>
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="What is this room for?"
        maxLength={200}
        rows={3}
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-4 resize-none"
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
        onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
      />

      <Label>Room profile image <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span></Label>
      <div className="flex items-center gap-3 mb-4">
        {imagePreview ? (
          <img src={imagePreview} alt="Preview" className="rounded-lg object-cover" style={{ width: 56, height: 56 }} />
        ) : (
          <div className="rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ width: 56, height: 56, background: theme }}>
            {(name.charAt(0) || '?').toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <label className="cursor-pointer">
            <span className="inline-block px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: '#F2F2F2', color: '#1B2A4A', border: '1px solid #E8EBF4' }}>
              Choose image
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} className="hidden" />
          </label>
          {profileImage && (
            <button onClick={() => { setProfileImage(null); setImagePreview(null); }} className="ml-2 text-xs font-semibold" style={{ color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>
              Remove
            </button>
          )}
          <p className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>PNG, JPG, or WEBP. Max 5 MB.</p>
        </div>
      </div>

      <Label>Theme color</Label>
      <div className="flex gap-2 mb-6">
        {THEME_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setTheme(c)}
            className="rounded-full transition-transform"
            style={{
              width: 28, height: 28, background: c, cursor: 'pointer',
              border: theme === c ? '2px solid #1B2A4A' : '2px solid transparent',
              transform: theme === c ? 'scale(1.1)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm mb-4" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2" style={{ background: '#E6F6EF', color: '#059669' }}>
          <Check size={16} /> {success}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
          style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || !name.trim()}
          className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
          style={{ background: '#1B2A4A', border: 'none', cursor: saving || !name.trim() ? 'not-allowed' : 'pointer', opacity: saving || !name.trim() ? 0.6 : 1 }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Create
        </button>
      </div>
    </Modal>
  );
}

// ─── Join by code modal ───────────────────────────────────────────────────────
function JoinByCodeModal({
  onClose, onFound,
}: {
  onClose: () => void;
  onFound: (roomId: string) => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFind() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const room = await fetchRoomByCode(code);
      if (!room) {
        setError('No room found with that code. Check the code and try again.');
        return;
      }
      onFound(room.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not find room');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal title="Join by Room Code" onClose={onClose}>
      <p className="text-xs mb-4" style={{ color: '#6B6B6B' }}>
        Enter the short code the room owner shared with you (e.g. TM-48291). You'll request to join — the owner must approve.
      </p>
      <Label>Room code</Label>
      <input
        autoFocus
        type="text"
        value={code}
        onChange={e => setCode(e.target.value.toUpperCase())}
        placeholder="TM-48291"
        className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-4 font-mono tracking-wider"
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
        onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
        onKeyDown={e => e.key === 'Enter' && handleFind()}
      />
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm mb-4" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
          {error}
        </div>
      )}
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
          style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleFind}
          disabled={loading || !code.trim()}
          className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
          style={{ background: '#1B2A4A', border: 'none', cursor: loading || !code.trim() ? 'not-allowed' : 'pointer', opacity: loading || !code.trim() ? 0.6 : 1 }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Find room
        </button>
      </div>
    </Modal>
  );
}

// ─── Shared modal primitives ──────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  border: '1.5px solid #E8EBF4',
  background: '#F8F9FC',
  fontFamily: 'inherit',
  color: '#111',
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#6B6B6B' }}>
      {children}
    </label>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(27,42,74,0.45)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: '#1B2A4A' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={16} color="#9CA3AF" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

