import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Check, AlertTriangle, Loader2, Reply, Shield, MoreVertical, Trash2 } from 'lucide-react';
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

  // User-side delete state
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const remaining = MAX_LEN - message.length;
  const trimmed = message.trim();

  const loadItems = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // anonymous users don't have a feedback history
    setLoadingItems(true);
    const { data, error: qErr } = await supabase
      .from('feedback')
      .select('id, feedback_type, message, status, admin_reply, admin_reply_created_at, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    setLoadingItems(false);
    if (qErr) return;
    if (data) setItems(data as unknown as FeedbackItem[]);
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
      // ignore — admin list is best-effort
    }
  }, []);

  // Check admin status on mount, then load the appropriate data.
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

  // Load the user's own feedback on mount, and poll for new admin replies.
  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 15000);
    return () => clearInterval(interval);
  }, [loadItems]);

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

  async function handleDelete(feedbackId: string) {
    setConfirmDeleteId(null);
    setMenuOpenFor(null);
    setDeletingId(feedbackId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback/delete`;
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
        throw new Error((body as { error?: string }).error || 'Could not delete feedback.');
      }
      setItems(prev => prev.filter(i => i.id !== feedbackId));
    } catch {
      // If the edge function fails, try direct delete via RLS (owner can delete own).
      try {
        await supabase.from('feedback').delete().eq('id', feedbackId);
        setItems(prev => prev.filter(i => i.id !== feedbackId));
      } catch {
        // give up silently
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAdminDelete(feedbackId: string) {
    setDeletingId(feedbackId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback/delete`;
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ feedback_id: feedbackId }),
      });
      if (!res.ok) throw new Error('Could not delete feedback.');
      setAdminItems(prev => prev.filter(i => i.id !== feedbackId));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
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

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} color={colors.accent} />
        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Feedback &amp; Support</p>
      </div>

      <div className="space-y-3">
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
            <span>Your feedback was saved, but email delivery failed. I will still receive it through the system.</span>
          </div>
        )}
        {error && status === 'error' && (
          <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: colors.errorBg, color: colors.error }}>
            {error}
          </div>
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
                          {deletingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <MoreVertical size={12} />}
                        </button>
                        {menuOpenFor === item.id && (
                          <div
                            className="absolute right-0 top-full mt-1 rounded-lg shadow-lg z-10"
                            style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, minWidth: '160px' }}
                          >
                            <button
                              onClick={() => { setMenuOpenFor(null); setConfirmDeleteId(item.id); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left rounded-lg transition-colors"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.error }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = colors.errorBg; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                            >
                              <Trash2 size={12} />
                              Delete feedback
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
                          Reply
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
                      {TYPE_LABEL[item.feedback_type] || item.feedback_type}
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
                    </div>
                  </div>
                  <p className="text-xs mb-1.5 whitespace-pre-wrap" style={{ color: colors.textPrimary }}>{item.message}</p>
                  <div className="text-[10px] space-y-0.5 mb-2" style={{ color: colors.textTertiary }}>
                    {item.user_id && <div>user: {item.user_id.slice(0, 8)}…</div>}
                    {item.optional_contact_email && <div>contact: {item.optional_contact_email}</div>}
                    {item.page_route && <div>page: {item.page_route}</div>}
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
                      <div className="flex items-center gap-2">
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
                        <div className="ml-auto flex gap-1">
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
                      <button
                        onClick={() => handleAdminDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-xs font-semibold flex items-center gap-1"
                        style={{ color: colors.error, background: 'transparent', border: 'none', cursor: deletingId === item.id ? 'not-allowed' : 'pointer', opacity: deletingId === item.id ? 0.5 : 1 }}
                      >
                        {deletingId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {confirmDeleteId && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setConfirmDeleteId(null)}
          >
            <div
              className="rounded-xl p-5 max-w-xs mx-4"
              style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} style={{ color: colors.error }} />
                <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>Delete feedback?</h3>
              </div>
              <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                Delete this feedback? This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: colors.bgSubtle, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDeleteId)}
                  disabled={deletingId === confirmDeleteId}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                  style={{ background: colors.error, color: '#fff', border: 'none', cursor: deletingId === confirmDeleteId ? 'not-allowed' : 'pointer', opacity: deletingId === confirmDeleteId ? 0.5 : 1 }}
                >
                  {deletingId === confirmDeleteId ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
