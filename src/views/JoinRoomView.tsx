import { useState, useEffect } from 'react';
import { Loader2, Users, Clock, Check, X, ArrowLeft } from 'lucide-react';
import type { StudyRoom, RoomMember } from '../types';
import {
  fetchRoomByInviteCode, fetchMyMembership, requestToJoin,
  acceptInvite, declineInvite,
} from '../lib/studyRooms';

interface Props {
  inviteCode: string;
  userId: string;
  isAuthenticated: boolean;
  onRequireAuth: () => void;
  onOpenRoom: (roomId: string) => void;
  onBack: () => void;
}

export default function JoinRoomView({
  inviteCode, userId, isAuthenticated, onRequireAuth, onOpenRoom, onBack,
}: Props) {
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [membership, setMembership] = useState<RoomMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetchRoomByInviteCode(inviteCode);
        if (cancelled) return;
        setRoom(r);
        if (r && isAuthenticated) {
          const m = await fetchMyMembership(r.id, userId);
          if (cancelled) return;
          setMembership(m);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load room');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inviteCode, userId, isAuthenticated]);

  async function handleRequest() {
    if (!room) return;
    if (!isAuthenticated) { onRequireAuth(); return; }
    setActing(true);
    try {
      await requestToJoin(room.id, userId);
      const m = await fetchMyMembership(room.id, userId);
      setMembership(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not request to join');
    } finally {
      setActing(false);
    }
  }

  async function handleAccept() {
    if (!room) return;
    setActing(true);
    try {
      await acceptInvite(room.id, userId);
      onOpenRoom(room.id);
    } finally {
      setActing(false);
    }
  }

  async function handleDecline() {
    if (!room) return;
    setActing(true);
    try {
      await declineInvite(room.id, userId);
      setMembership(prev => prev ? { ...prev, status: 'declined' } : prev);
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EDEDEE' }}>
        <Loader2 className="animate-spin" size={28} color="#1B2A4A" />
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEDEE' }}>
        <div className="max-w-md w-full rounded-2xl p-8 text-center" style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#1B2A4A' }}>Room not found</h1>
          <p className="text-sm mb-5" style={{ color: '#6B6B6B' }}>
            {error || 'This invite link is invalid or the room no longer exists.'}
          </p>
          <button onClick={onBack} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}>
            Back to planner
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#EDEDEE' }}>
        <div className="max-w-md w-full rounded-2xl p-8" style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}>
          <RoomPreview room={room} />
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: '#FEF3C7', color: '#B45309' }}>
            You need an account to join this room. Sign in or sign up — you'll come back here.
          </div>
          <button onClick={onRequireAuth} className="w-full py-2.5 rounded-lg text-sm font-bold text-white" style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}>
            Sign in or Sign up
          </button>
          <button onClick={onBack} className="w-full mt-2 py-2 text-xs font-semibold" style={{ background: 'none', border: 'none', color: '#6B6B6B', cursor: 'pointer' }}>
            Back to planner
          </button>
        </div>
      </div>
    );
  }

  // Authenticated — show preview + request/accept/decline based on membership status.
  const status = membership?.status;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: '#EDEDEE' }}>
      <div className="max-w-md w-full rounded-2xl p-8" style={{ background: '#fff', boxShadow: '0 4px 24px rgba(27,42,74,0.15)' }}>
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-semibold mb-4" style={{ color: '#1B2A4A', background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Back to planner
        </button>

        <RoomPreview room={room} />

        {!room.invite_enabled && (
          <div className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
            The owner has disabled this invite link.
          </div>
        )}

        {/* Status-based content */}
        {(!status || status === 'left' || status === 'removed' || status === 'declined' || status === 'rejected') && (
          <>
            <p className="text-sm mb-4" style={{ color: '#6B6B6B' }}>
              This is a private room. Request to join — the owner will review your request.
            </p>
            <button
              onClick={handleRequest}
              disabled={acting || !room.invite_enabled}
              className="w-full py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1.5"
              style={{ background: '#1B2A4A', border: 'none', cursor: acting || !room.invite_enabled ? 'not-allowed' : 'pointer', opacity: acting || !room.invite_enabled ? 0.6 : 1 }}
            >
              {acting ? <Loader2 size={16} className="animate-spin" /> : <Users size={16} />} Request to join
            </button>
          </>
        )}

        {status === 'pending' && (
          <div className="text-center rounded-lg p-4" style={{ background: '#FEF3C7' }}>
            <Clock size={22} color="#B45309" className="mx-auto mb-2" />
            <p className="text-sm font-bold" style={{ color: '#1B2A4A' }}>Request pending</p>
            <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>
              Your request to join this room is pending approval.
            </p>
          </div>
        )}

        {status === 'invited' && (
          <div>
            <p className="text-sm mb-4 text-center" style={{ color: '#6B6B6B' }}>
              You've been invited to join this room.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={acting}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-1.5"
                style={{ background: '#059669', border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}
              >
                <Check size={16} /> Accept
              </button>
              <button
                onClick={handleDecline}
                disabled={acting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5"
                style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: acting ? 'not-allowed' : 'pointer' }}
              >
                <X size={16} /> Decline
              </button>
            </div>
          </div>
        )}

        {status === 'approved' && (
          <button
            onClick={() => onOpenRoom(room.id)}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white"
            style={{ background: '#059669', border: 'none', cursor: 'pointer' }}
          >
            You're a member — Open room
          </button>
        )}
      </div>
    </div>
  );
}

function RoomPreview({ room }: { room: StudyRoom }) {
  return (
    <div className="text-center mb-5">
      {room.avatar_url ? (
        <img src={room.avatar_url} alt="" className="rounded-2xl object-cover mx-auto mb-3" style={{ width: 72, height: 72 }} />
      ) : (
        <div className="rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl mx-auto mb-3" style={{ width: 72, height: 72, background: room.theme_color }}>
          {room.name.charAt(0).toUpperCase()}
        </div>
      )}
      <h1 className="text-xl font-extrabold" style={{ color: '#1B2A4A' }}>{room.name}</h1>
      {room.description && (
        <p className="text-sm mt-1.5" style={{ color: '#6B6B6B' }}>{room.description}</p>
      )}
      <p className="text-xs mt-2" style={{ color: '#9CA3AF' }}>Private study room</p>
    </div>
  );
}
