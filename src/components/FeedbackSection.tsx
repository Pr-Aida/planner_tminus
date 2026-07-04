import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Check, AlertTriangle, Loader2, Reply, Shield, MoreVertical, Trash2, User, Bell, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';

type FeedbackType = 'bug' | 'suggestion' | 'design' | 'feature' | 'other';

const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'design', label: 'Design feedback' },
  { value: 'feature', label: 'Feature request' },
  { value: 'other', label: 'Other' },
];

const TYPE_LABEL: Record<FeedbackType, string> = {
  bug: 'Bug report',
  suggestion: 'Suggestion',
  design: 'Design feedback',
  feature: 'Feature request',
  other: 'Other',
};

const MAX_LEN = 2000;

type SendStatus = 'sent' | 'saved_only' | 'error';

interface FeedbackItem {
  id: string;
  feedback_type: FeedbackType;
  message: string;
  status: string;
  admin_reply: string | null;
  admin_reply_created_at: string | null;
  created_at: string;
}

interface AdminFeedbackItem extends FeedbackItem {
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  optional_contact_email: string | null;
  page_route: string | null;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function FeedbackSection({ pageRoute }: { pageRoute?: string }) {
  const { colors } = useTheme();
  const [type, setType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<SendStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminItems, setAdminItems] = useState<AdminFeedbackItem[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [replyError, setReplyError] = useState<string | null>(null);

  // Dismissal state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);
  const [confirmDismissIsAdmin, setConfirmDismissIsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Feedback notifications
  const [notifCount, setNotifCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<{ id: string; message: string; read: boolean; created_at: string; type: string }[]>([]);

  const remaining = MAX_LEN - message.length;
  const trimmed = message.trim();

  const loadItems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setLoadingItems(true);

    // Get user's feedback, excluding dismissed ones
    const { data: dismissals } = await supabase
      .from('feedback_dismissals')
      .select('feedback_id')
      .eq('user_id', session.user.id);

    const dismissedIds = new Set(dismissals?.map(d => d.feedback_id) || []);

    const { data, error: qErr } = await supabase
      .from('feedback')
      .select('id, feedback_type, message, status, admin_reply, admin_reply_created_at, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    setLoadingItems(false);
    if (qErr) return;
    if (data) {
      const filteredData = data.filter(f => !dismissedIds.has(f.id));
      setItems(filteredData as unknown as FeedbackItem[]);
    }
  }, []);

  const loadAdminItems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback/list`;
    try {
      const res = await fetch(fnUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const body = await res.json().catch(() => ({}));
      const list = (body as { items?: AdminFeedbackItem[] }).items;
      if (list) setAdminItems(list);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase
        .from('profiles')
        .select('is_admin')
        .maybeSingle();
      if (prof?.is_admin) {
        setIsAdmin(true);
        setLoadingAdmin(true);
        await loadAdminItems();
        setLoadingAdmin(false);
      }
    })();
  }, [loadAdminItems]);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 15000);
    return () => clearInterval(interval);
  }, [loadItems]);

  // Load feedback notifications count
  const loadNotifCount = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { count } = await supabase
      .from('feedback_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
    setNotifCount(count || 0);
  }, []);

  // Load feedback notifications list
  const loadNotifs = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('feedback_notifications')
      .select('id, message, read, created_at, type')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setNotifs((data || []) as { id: string; message: string; read: boolean; created_at: string; type: string }[]);
  }, []);

  // Mark all notifications as read
  const markNotifsRead = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase
      .from('feedback_notifications')
      .update({ read: true })
      .eq('user_id', session.user.id)
      .eq('read', false);
    setNotifCount(0);
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    loadNotifCount();
    const interval = setInterval(loadNotifCount, 15000);
    return () => clearInterval(interval);
  }, [loadNotifCount]);

  useEffect(() => {
    let prevUid: string | null = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      prevUid = session?.user?.id ?? null;
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUid = session?.user?.id ?? null;
      if (newUid !== prevUid) {
        prevUid = newUid;
        setItems([]);
        setAdminItems([]);
        setIsAdmin(false);
        setReplyingTo(null);
        setReplyText('');
        setReplyStatus('idle');
        setReplyError(null);
        setMenuOpenFor(null);
        setConfirmDismissId(null);
        setStatus(null);
        setError(null);
        setMessage('');
        setContactEmail('');
        setNotifCount(0);
        setNotifs([]);
        setShowNotifs(false);

        if (newUid) {
          loadItems();
          loadNotifCount();
          (async () => {
            const { data: prof } = await supabase
              .from('profiles')
              .select('is_admin')
              .maybeSingle();
            if (prof?.is_admin) {
              setIsAdmin(true);
              setLoadingAdmin(true);
              await loadAdminItems();
              setLoadingAdmin(false);
            }
          })();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [loadItems, loadAdminItems, loadNotifCount]);

  async function handleSubmit() {
    setError(null);
    setStatus(null);
    if (!trimmed) {
      setError('Please enter a message.');
      return;
    }
    if (trimmed.length > MAX_LEN) {
      setError(`Message must be ${MAX_LEN} characters or fewer.`);
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          feedback_type: type,
          message: trimmed,
          contact_email: contactEmail.trim() || undefined,
          page_route: pageRoute || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || 'Feedback could not be sent. Please try again.');
      }
      const s = (body as { status?: string }).status;
      if (s === 'saved_only') {
        setStatus('saved_only');
      } else {
        setStatus('sent');
      }
      setMessage('');
      setContactEmail('');
      loadItems();
    } catch (err) {
      setError((err as Error).message || 'Feedback could not be sent. Please try again.');
      setStatus('error');
    } finally {
      setSending(false);
    }
  }

  async function handleAdminReply(feedbackId: string, newStatus?: string) {
    setReplyError(null);
    const reply = replyText.trim();
    if (!reply && !newStatus) {
      setReplyError('Reply cannot be empty.');
      return;
    }
    if (reply.length > MAX_LEN) {
      setReplyError(`Reply must be ${MAX_LEN} characters or fewer.`);
      return;
    }
    setReplyStatus('sending');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback/reply`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ feedback_id: feedbackId, reply: reply || undefined, status: newStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error || 'Could not send reply.');
      setReplyStatus('ok');
      setReplyText('');
      setReplyingTo(null);
      loadAdminItems();
    } catch (err) {
      setReplyError((err as Error).message || 'Could not send reply.');
      setReplyStatus('error');
    }
  }

  async function handleDismiss(feedbackId: string, isAdminContext: boolean) {
    setConfirmDismissId(null);
    setMenuOpenFor(null);
    setDismissingId(feedbackId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback/dismiss`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ feedback_id: feedbackId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Could not remove feedback.');
      }
      if (isAdminContext) {
        setAdminItems(prev => prev.filter(i => i.id !== feedbackId));
      } else {
        setItems(prev => prev.filter(i => i.id !== feedbackId));
      }
    } catch {
      // Fallback: try direct insert into dismissals
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await supabase.from('feedback_dismissals').upsert({
            feedback_id: feedbackId,
            user_id: session.user.id,
          });
          if (isAdminContext) {
            setAdminItems(prev => prev.filter(i => i.id !== feedbackId));
          } else {
            setItems(prev => prev.filter(i => i.id !== feedbackId));
          }
        }
      } catch {
        // give up silently
      }
    } finally {
      setDismissingId(null);
    }
  }

  // Close the three-dot menu when clicking outside.
  useEffect(() => {
    if (!menuOpenFor) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenFor(null);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpenFor]);

  const inputStyle: React.CSSProperties = {
    border: `1.5px solid ${colors.border}`,
    background: colors.bgInput,
    color: colors.textPrimary,
    fontFamily: 'inherit',
  };

  // Helper to display user info for admin
  function formatUserDisplay(item: AdminFeedbackItem): string {
    if (item.display_name && item.username) {
      return `${item.display_name} (@${item.username})`;
    }
    if (item.username) {
      return `@${item.username}`;
    }
    if (item.display_name) {
      return item.display_name;
    }
    if (item.user_id) {
      return `User ${item.user_id.slice(0, 8)}…`;
    }
    return 'Anonymous';
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} color={colors.accent} />
        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Feedback &amp; Support</p>
        {notifCount > 0 && (
          <div className="relative ml-auto">
            <button
              onClick={() => {
                if (!showNotifs) { loadNotifs(); }
                setShowNotifs(s => !s);
                if (!showNotifs && notifCount > 0) { markNotifsRead(); }
              }}
              className="relative flex items-center justify-center rounded-full transition-opacity hover:opacity-80"
              style={{ background: colors.accentLight, border: 'none', cursor: 'pointer', width: 28, height: 28 }}
              aria-label="Feedback notifications"
            >
              <Bell size={14} color={colors.accent} />
              <span
                className="absolute -top-1 -right-1 flex items-center justify-center text-[9px] font-bold text-white rounded-full"
                style={{ background: colors.accent, minWidth: 16, height: 16, padding: '0 4px' }}
              >
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            </button>
            {showNotifs && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-20"
                style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, minWidth: '260px', maxWidth: 'calc(100vw - 2rem)' }}
              >
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Notifications</span>
                  <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <X size={12} color={colors.textTertiary} />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <p className="text-xs text-center py-4" style={{ color: colors.textTertiary }}>No notifications.</p>
                  ) : notifs.map(n => (
                    <div key={n.id} className="px-3 py-2.5" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                      <div className="flex items-start gap-2">
                        {n.type === 'admin_notification' ? (
                          <Shield size={12} color={colors.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                        ) : (
                          <Reply size={12} color={colors.accent} style={{ flexShrink: 0, marginTop: 1 }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs" style={{ color: colors.textPrimary }}>{n.message}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                            {formatDate(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Admin info banner — replaces submission form for admin accounts */}
        {isAdmin && (
          <div className="rounded-lg px-3 py-2.5 text-xs flex items-center gap-2" style={{ background: colors.accentLight, color: colors.textSecondary }}>
            <Shield size={14} color={colors.accent} />
            <span>You are signed in as an admin. Use the admin section below to manage user feedback.</span>
          </div>
        )}

        {/* Submission form — hidden for admin accounts */}
        {!isAdmin && (
          <>
        {/* Type */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
            Type
          </label>
          <select
            value={type}
            onChange={e => setType(e.target.value as FeedbackType)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
          >
            {FEEDBACK_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Message */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
            Message
          </label>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value.slice(0, MAX_LEN)); setStatus(null); setError(null); }}
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
            style={{ ...inputStyle, minHeight: '90px' }}
            placeholder="Tell us what's on your mind…"
          />
          <p className="text-[10px] mt-1" style={{ color: remaining < 100 ? colors.warning : colors.textTertiary }}>
            {remaining} characters left
          </p>
        </div>

        {/* Optional contact email */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
            Email (optional)
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={e => { setContactEmail(e.target.value); setStatus(null); }}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
            placeholder="only if you want a reply"
          />
          <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
            Email optional — only if you want a reply.
          </p>
        </div>

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={sending || !trimmed}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity"
          style={{
            background: colors.accent,
            border: 'none',
            cursor: sending || !trimmed ? 'not-allowed' : 'pointer',
            opacity: sending || !trimmed ? 0.5 : 1,
          }}
        >
          {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {sending ? 'Sending…' : 'Send Feedback'}
        </button>

        {/* Status messages */}
        {status === 'sent' && (
          <div className="rounded-lg px-3 py-2.5 text-xs flex items-center gap-2" style={{ background: colors.successBg, color: colors.success }}>
            <Check size={14} /> Thank you — your feedback has been sent.
          </div>
        )}
        {status === 'saved_only' && (
          <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: colors.warningBg, color: colors.warning }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Your feedback was saved, but email delivery failed. We will still receive it through the system.</span>
          </div>
        )}
        {error && status === 'error' && (
          <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: colors.errorBg, color: colors.error }}>
            {error}
          </div>
        )}
        </>
        )}

        {/* Your feedback history + admin replies */}
        {(loadingItems || items.length > 0) && (
          <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: colors.textSecondary }}>
              Your Feedback
            </p>
            <div className="space-y-2">
              {loadingItems && items.length === 0 && (
                <p className="text-xs" style={{ color: colors.textTertiary }}>Loading…</p>
              )}
              {items.map(item => (
                <div
                  key={item.id}
                  className="rounded-lg p-2.5"
                  style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.accent }}>
                      {TYPE_LABEL[item.feedback_type] || item.feedback_type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: colors.textTertiary }}>
                        {formatDate(item.created_at)}
                      </span>
                      <div ref={menuOpenFor === item.id ? menuRef : undefined} style={{ position: 'relative' }}>
                        <button
                          onClick={() => setMenuOpenFor(menuOpenFor === item.id ? null : item.id)}
                          className="p-1 rounded transition-colors"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}
                          aria-label="Feedback options"
                        >
                          {dismissingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <MoreVertical size={12} />}
                        </button>
                        {menuOpenFor === item.id && (
                          <div
                            className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-10"
                            style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, minWidth: '160px', maxWidth: 'calc(100vw - 2rem)' }}
                          >
                            <button
                              onClick={() => { setMenuOpenFor(null); setConfirmDismissId(item.id); setConfirmDismissIsAdmin(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg transition-colors"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textSecondary }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <Trash2 size={12} />
                              Remove from my list
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs mb-1.5 whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{item.message}</p>
                  {item.admin_reply && (
                    <div className="mt-2 rounded-lg p-2.5" style={{ background: colors.bgSubtle, border: `1px solid ${colors.accent}33` }}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Reply size={11} color={colors.accent} />
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.accent }}>
                          T Minus Support
                        </span>
                        {item.admin_reply_created_at && (
                          <span className="text-[10px] ml-auto" style={{ color: colors.textTertiary }}>
                            {formatDate(item.admin_reply_created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{item.admin_reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin-only feedback management */}
        {isAdmin && (
          <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} color={colors.accent} />
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                Admin — All Feedback
              </p>
            </div>
            {loadingAdmin && adminItems.length === 0 && (
              <p className="text-xs" style={{ color: colors.textTertiary }}>Loading…</p>
            )}
            {!loadingAdmin && adminItems.length === 0 && (
              <p className="text-xs" style={{ color: colors.textTertiary }}>No feedback yet.</p>
            )}
            <div className="space-y-2">
              {adminItems.map(item => (
                <div
                  key={item.id}
                  className="rounded-lg p-3"
                  style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.accent }}>
                      {TYPE_LABEL[item.feedback_type as FeedbackType] || item.feedback_type}
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase"
                        style={{
                          background: item.status === 'resolved' ? colors.successBg : item.status === 'reviewed' ? colors.warningBg : colors.bgSubtle,
                          color: item.status === 'resolved' ? colors.success : item.status === 'reviewed' ? colors.warning : colors.textTertiary,
                        }}
                      >
                        {item.status}
                      </span>
                      <span className="text-[10px]" style={{ color: colors.textTertiary }}>
                        {formatDate(item.created_at)}
                      </span>
                      <div ref={menuOpenFor === item.id ? menuRef : undefined} style={{ position: 'relative' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setMenuOpenFor(menuOpenFor === item.id ? null : item.id); }}
                          className="p-1 rounded transition-colors"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}
                          aria-label="Feedback options"
                        >
                          {dismissingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <MoreVertical size={12} />}
                        </button>
                        {menuOpenFor === item.id && (
                          <div
                            className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-10"
                            style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, minWidth: '180px', maxWidth: 'calc(100vw - 2rem)' }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => { setMenuOpenFor(null); setConfirmDismissId(item.id); setConfirmDismissIsAdmin(true); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg transition-colors"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textSecondary }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = colors.bgHover; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <Trash2 size={12} />
                              Remove from my admin list
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* User info - show display name and username */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <User size={10} color={colors.textTertiary} />
                    <span className="text-[10px] font-semibold" style={{ color: colors.textSecondary }}>
                      From: {formatUserDisplay(item)}
                    </span>
                  </div>

                  <p className="text-xs mb-1.5 whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{item.message}</p>

                  {/* Contact info if available */}
                  <div className="text-[10px] space-y-0.5 mb-2" style={{ color: colors.textTertiary }}>
                    {item.optional_contact_email && (
                      <div className="flex items-center gap-1">
                        <span>Contact:</span>
                        <a href={`mailto:${item.optional_contact_email}`} className="underline" style={{ color: colors.accent }}>
                          {item.optional_contact_email}
                        </a>
                      </div>
                    )}
                    {item.page_route && <div>Page: {item.page_route}</div>}
                  </div>

                  {item.admin_reply && (
                    <div className="rounded-lg p-2 mb-2" style={{ background: colors.bgSubtle, border: `1px solid ${colors.accent}33` }}>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Reply size={10} color={colors.accent} />
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: colors.accent }}>Your reply</span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{item.admin_reply}</p>
                    </div>
                  )}

                  {replyingTo === item.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value.slice(0, MAX_LEN))}
                        rows={2}
                        className="w-full rounded-lg px-2.5 py-1.5 text-xs outline-none resize-y"
                        style={{ ...inputStyle, minHeight: '60px' }}
                        placeholder="Write a reply…"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => handleAdminReply(item.id)}
                          disabled={replyStatus === 'sending' || !replyText.trim()}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                          style={{ background: colors.accent, opacity: replyStatus === 'sending' || !replyText.trim() ? 0.5 : 1, cursor: replyStatus === 'sending' || !replyText.trim() ? 'not-allowed' : 'pointer' }}
                        >
                          {replyStatus === 'sending' ? 'Sending…' : 'Send Reply'}
                        </button>
                        <button
                          onClick={() => { setReplyingTo(null); setReplyText(''); setReplyError(null); setReplyStatus('idle'); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ color: colors.textSecondary, background: 'transparent', border: `1px solid ${colors.border}` }}
                        >
                          Cancel
                        </button>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAdminReply(item.id, 'reviewed')}
                            className="px-2 py-1 rounded text-[10px] font-semibold"
                            style={{ background: colors.warningBg, color: colors.warning, border: 'none', cursor: 'pointer' }}
                          >
                            Mark reviewed
                          </button>
                          <button
                            onClick={() => handleAdminReply(item.id, 'resolved')}
                            className="px-2 py-1 rounded text-[10px] font-semibold"
                            style={{ background: colors.successBg, color: colors.success, border: 'none', cursor: 'pointer' }}
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                      {replyError && replyingTo === item.id && (
                        <p className="text-[10px]" style={{ color: colors.error }}>{replyError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setReplyingTo(item.id); setReplyText(item.admin_reply || ''); setReplyError(null); setReplyStatus('idle'); }}
                        className="text-xs font-semibold flex items-center gap-1"
                        style={{ color: colors.accent, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      >
                        <Reply size={12} /> {item.admin_reply ? 'Edit reply' : 'Reply'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dismissal confirmation modal */}
        {confirmDismissId && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setConfirmDismissId(null)}
          >
            <div
              className="rounded-xl p-5 max-w-xs mx-4"
              style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} style={{ color: colors.warning }} />
                <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>Remove from your list?</h3>
              </div>
              <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                This will hide the feedback from your view. It will not delete it for the {confirmDismissIsAdmin ? 'user who submitted it' : 'admin'}.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmDismissId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: colors.bgSubtle, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDismiss(confirmDismissId, confirmDismissIsAdmin)}
                  disabled={dismissingId === confirmDismissId}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  style={{ background: colors.warning, color: '#fff', border: 'none', cursor: dismissingId === confirmDismissId ? 'not-allowed' : 'pointer', opacity: dismissingId === confirmDismissId ? 0.5 : 1 }}
                >
                  {dismissingId === confirmDismissId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
