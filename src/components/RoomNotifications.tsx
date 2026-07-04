import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, X, UserPlus, UserCheck, LogIn, LogOut, Ban, MessageSquare } from 'lucide-react';
import type { RoomNotification, RoomNotificationType } from '../types';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  deleteNotification, unreadNotificationCount, approveMember, rejectMember,
  fetchFeedbackNotifications, markFeedbackNotificationRead, markAllFeedbackNotificationsRead,
  deleteFeedbackNotification, unreadFeedbackNotificationCount,
  type FeedbackNotification,
} from '../lib/studyRooms';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

interface Props {
  userId: string;
  onOpenRoom: (roomId: string) => void;
  onOpenFeedback?: () => void;
}

type MergedNotification =
  | { kind: 'room'; data: RoomNotification }
  | { kind: 'feedback'; data: FeedbackNotification };

export default function RoomNotifications({ userId, onOpenRoom, onOpenFeedback }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [roomNotifs, setRoomNotifs] = useState<RoomNotification[]>([]);
  const [feedbackNotifs, setFeedbackNotifs] = useState<FeedbackNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const [n, fn, u, fu] = await Promise.all([
        fetchNotifications(userId),
        fetchFeedbackNotifications(userId),
        unreadNotificationCount(userId),
        unreadFeedbackNotificationCount(userId),
      ]);
      setRoomNotifs(n);
      setFeedbackNotifs(fn);
      setUnread(u + fu);
    } catch (e) {
      console.error(e);
    }
  }, [userId]);

  useEffect(() => {
    setRoomNotifs([]);
    setFeedbackNotifs([]);
    setUnread(0);
    load();
  }, [load]);

  // Realtime subscription for room notifications
  useEffect(() => {
    const channel = supabase.channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'room_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const newRow = payload.new as RoomNotification;
        setRoomNotifs(prev => prev.some(n => n.id === newRow.id) ? prev : [newRow, ...prev]);
        setUnread(u => u + 1);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'room_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as RoomNotification;
        setRoomNotifs(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
        setUnread(u => updated.read ? Math.max(0, u - 1) : u);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'room_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const oldRow = payload.old as { id: string };
        setRoomNotifs(prev => prev.filter(n => n.id !== oldRow.id));
        setUnread(u => Math.max(0, u - 1));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Realtime subscription for feedback notifications
  useEffect(() => {
    const channel = supabase.channel(`feedback-notifs:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'feedback_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const newRow = payload.new as FeedbackNotification;
        setFeedbackNotifs(prev => prev.some(n => n.id === newRow.id) ? prev : [newRow, ...prev]);
        setUnread(u => u + 1);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'feedback_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const updated = payload.new as FeedbackNotification;
        setFeedbackNotifs(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
        setUnread(u => updated.read ? Math.max(0, u - 1) : u);
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'feedback_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const oldRow = payload.old as { id: string };
        setFeedbackNotifs(prev => prev.filter(n => n.id !== oldRow.id));
        setUnread(u => Math.max(0, u - 1));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && btnRef.current && !ref.current.contains(e.target as Node) && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function handleMarkAllRead() {
    await Promise.all([
      markAllNotificationsRead(userId),
      markAllFeedbackNotificationsRead(userId),
    ]);
    setUnread(0);
    setRoomNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setFeedbackNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }

  async function handleAction(n: RoomNotification, action: 'approve' | 'reject') {
    const requesterId = n.actor_user_id;
    if (!requesterId) return;
    if (action === 'approve') await approveMember(n.room_id, requesterId);
    else await rejectMember(n.room_id, requesterId);
    await markNotificationRead(n.id);
    setRoomNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    setUnread(u => Math.max(0, u - 1));
  }

  async function handleDismissRoom(n: RoomNotification) {
    await deleteNotification(n.id);
    setRoomNotifs(prev => prev.filter(x => x.id !== n.id));
    if (!n.read) setUnread(u => Math.max(0, u - 1));
  }

  async function handleDismissFeedback(n: FeedbackNotification) {
    await deleteFeedbackNotification(n.id);
    setFeedbackNotifs(prev => prev.filter(x => x.id !== n.id));
    if (!n.read) setUnread(u => Math.max(0, u - 1));
  }

  async function handleFeedbackClick(n: FeedbackNotification) {
    if (!n.read) {
      await markFeedbackNotificationRead(n.id);
      setFeedbackNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    if (onOpenFeedback) {
      onOpenFeedback();
      setOpen(false);
    }
  }

  // Merge and sort all notifications by created_at desc
  const merged: MergedNotification[] = [
    ...roomNotifs.map(n => ({ kind: 'room' as const, data: n })),
    ...feedbackNotifs.map(n => ({ kind: 'feedback' as const, data: n })),
  ].sort((a, b) => new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime());

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="relative flex items-center justify-center rounded-md transition-all"
        style={{ width: 32, height: 32, background: open ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', cursor: 'pointer' }}
        title="Notifications"
      >
        <Bell size={16} color="rgba(255,255,255,0.75)" />
        {unread > 0 && (
          <span
            className="absolute rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ top: 2, right: 2, minWidth: 14, height: 14, padding: '0 3px', background: '#7B1C3E' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={ref}
          className="absolute top-12 right-0 w-80 max-w-[calc(100vw-2rem)] rounded-xl py-2 z-[200]"
          style={{ background: colors.bgCard, boxShadow: '0 8px 32px rgba(0,0,0,0.22)' }}
        >
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.textPrimary }}>Notifications</span>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} className="text-[10px] font-semibold" style={{ color: colors.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ height: 1, background: colors.borderLight, margin: '0 0 4px' }} />

          {loading ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: colors.textSecondary }}>Loading…</div>
          ) : merged.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs" style={{ color: colors.textSecondary }}>No notifications yet.</div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {merged.map(item => {
                if (item.kind === 'room') {
                  const n = item.data;
                  return (
                    <RoomNotificationRow
                      key={`r-${n.id}`}
                      n={n}
                      colors={colors}
                      onOpenRoom={() => { onOpenRoom(n.room_id); setOpen(false); }}
                      onApprove={() => handleAction(n, 'approve')}
                      onReject={() => handleAction(n, 'reject')}
                      onDismiss={() => handleDismissRoom(n)}
                    />
                  );
                } else {
                  const n = item.data;
                  return (
                    <FeedbackNotificationRow
                      key={`f-${n.id}`}
                      n={n}
                      colors={colors}
                      onClick={() => handleFeedbackClick(n)}
                      onDismiss={() => handleDismissFeedback(n)}
                    />
                  );
                }
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RoomNotificationRow({
  n, colors, onOpenRoom, onApprove, onReject, onDismiss,
}: {
  n: RoomNotification;
  colors: ReturnType<typeof useTheme>['colors'];
  onOpenRoom: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
  const icon = iconFor(n.type);
  const payload = n.payload as Record<string, unknown>;
  const actorAvatar = payload?.actor_avatar_url as string | null;
  const actorName = payload?.actor_display_name as string || payload?.actor_username as string || 'Someone';

  return (
    <div
      className="px-4 py-3 transition-colors"
      style={{ background: n.read ? 'transparent' : colors.bgSubtle, borderBottom: `1px solid ${colors.bgInput}` }}
    >
      <div className="flex items-start gap-2">
        {n.type === 'join_request' && actorAvatar ? (
          <img src={actorAvatar} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
        ) : (
          <span style={{ color: icon.color, marginTop: 2, width: 20, display: 'inline-flex', justifyContent: 'center' }}>{icon.icon}</span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed" style={{ color: colors.textPrimary }}>
            {textFor(n)}
          </p>
          <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>{timeAgo(n.created_at)}</p>

          {n.type === 'join_request' && !n.read && n.actor_user_id && (
            <div className="flex gap-1.5 mt-2">
              <button
                onClick={onApprove}
                className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded text-white"
                style={{ background: '#059669', border: 'none', cursor: 'pointer' }}
              >
                <Check size={10} /> Approve
              </button>
              <button
                onClick={onReject}
                className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded"
                style={{ background: '#FEE2E2', color: '#B91C1C', border: 'none', cursor: 'pointer' }}
              >
                <X size={10} /> Reject
              </button>
            </div>
          )}

          {(n.type === 'request_approved' || n.type === 'invite_accepted') && (
            <button
              onClick={onOpenRoom}
              className="text-[10px] font-semibold mt-1.5"
              style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Open room →
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-0.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.border }}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function FeedbackNotificationRow({
  n, colors, onClick, onDismiss,
}: {
  n: FeedbackNotification;
  colors: ReturnType<typeof useTheme>['colors'];
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="px-4 py-3 transition-colors cursor-pointer"
      style={{ background: n.read ? 'transparent' : colors.bgSubtle, borderBottom: `1px solid ${colors.bgInput}` }}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span style={{ color: '#7B1C3E', marginTop: 2, width: 20, display: 'inline-flex', justifyContent: 'center' }}>
          <MessageSquare size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed" style={{ color: colors.textPrimary }}>
            <span className="font-semibold">T Minus Support</span>
            <br />
            {n.message}
          </p>
          <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>{timeAgo(n.created_at)}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          className="flex-shrink-0 p-0.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.border }}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

function iconFor(type: RoomNotificationType): { icon: React.ReactNode; color: string } {
  switch (type) {
    case 'join_request': return { icon: <UserPlus size={14} />, color: '#B45309' };
    case 'request_approved': return { icon: <Check size={14} />, color: '#059669' };
    case 'request_rejected': return { icon: <Ban size={14} />, color: '#B91C1C' };
    case 'room_invited': return { icon: <UserPlus size={14} />, color: 'var(--theme-text, #1B2A4A)' };
    case 'invite_accepted': return { icon: <UserCheck size={14} />, color: '#059669' };
    case 'member_left': return { icon: <LogOut size={14} />, color: '#9CA3AF' };
    case 'member_removed': return { icon: <LogIn size={14} />, color: '#B91C1C' };
    case 'feedback_reply': return { icon: <MessageSquare size={14} />, color: '#7B1C3E' };
    case 'admin_notification': return { icon: <MessageSquare size={14} />, color: '#7B1C3E' };
    default: return { icon: <Bell size={14} />, color: 'var(--theme-text, #1B2A4A)' };
  }
}

function textFor(n: RoomNotification): string {
  const payload = n.payload as Record<string, unknown>;
  const roomName = payload?.room_name as string || 'a room';
  const actorName = payload?.actor_display_name as string || payload?.actor_username as string || 'Someone';

  switch (n.type) {
    case 'join_request': return `${actorName} requested to join "${roomName}".`;
    case 'request_approved': return `Your request to join "${roomName}" was approved.`;
    case 'request_rejected': return `Your request to join "${roomName}" was declined.`;
    case 'room_invited': return `You've been invited to join "${roomName}".`;
    case 'invite_accepted': return `Your invitation to "${roomName}" was accepted.`;
    case 'member_left': return `A member left "${roomName}".`;
    case 'member_removed': return `You were removed from "${roomName}".`;
    case 'feedback_reply': return 'T Minus Support replied to your feedback.';
    case 'admin_notification': return 'You have new feedback activity.';
    default: return 'New notification';
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
