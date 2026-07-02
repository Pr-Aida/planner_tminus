import { useState, useEffect, useCallback } from 'react';
import { Plus, Users, KeyRound, ArrowLeft, Check, Loader2 } from 'lucide-react';
import type { StudyRoom, RoomMemberStatus } from '../types';
import {
  fetchMyRooms, createRoom, fetchRoomByCode,
} from '../lib/studyRooms';
import RoomProfileView from '../components/RoomProfileView';

interface Props {
  userId: string;
  onOpenRoom: (roomId: string) => void;
  initialOpenRoomId?: string | null;
}

const THEME_COLORS = ['#1B2A4A', '#7B1C3E', '#059669', '#B45309', '#2563EB', '#7c3aed'];

export default function StudyRoomsView({ userId, onOpenRoom, initialOpenRoomId }: Props) {
  const [rooms, setRooms] = useState<(StudyRoom & { my_status: RoomMemberStatus })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [openRoomId, setOpenRoomId] = useState<string | null>(initialOpenRoomId || null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchMyRooms();
      setRooms(r);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (openRoomId) {
    return (
      <RoomProfileView
        roomId={openRoomId}
        userId={userId}
        onBack={() => { setOpenRoomId(null); load(); }}
      />
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

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin" size={24} color="#9CA3AF" />
        </div>
      ) : rooms.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <RoomCard key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
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

// ─── Room card ────────────────────────────────────────────────────────────────
function RoomCard({ room, onOpen }: { room: StudyRoom & { my_status: RoomMemberStatus }; onOpen: () => void }) {
  const statusLabel: Record<RoomMemberStatus, string> = {
    approved: 'Member',
    pending: 'Request pending',
    invited: 'Invited',
    rejected: 'Rejected',
    declined: 'Declined',
    left: 'Left',
    removed: 'Removed',
  };
  return (
    <button
      onClick={onOpen}
      className="text-left rounded-xl p-4 transition-all hover:opacity-90"
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)', border: 'none', cursor: 'pointer' }}
    >
      <div className="flex items-center gap-3 mb-3">
        {room.avatar_url ? (
          <img src={room.avatar_url} alt="" className="rounded-lg object-cover" style={{ width: 44, height: 44 }} />
        ) : (
          <div
            className="rounded-lg flex items-center justify-center text-white font-bold"
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
    </button>
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const room = await createRoom({ name, description, theme_color: theme }, userId);
      onCreated(room.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create room');
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

