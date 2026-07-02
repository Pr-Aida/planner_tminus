import { useState, useEffect, useCallback } from 'react';
import { Inbox, Reply, Clock, X, Send, Check, AlertCircle, Mail, User } from 'lucide-react';
import {
  adminFetchAllFeedback, adminFetchReplies, adminReplyToFeedback, adminUpdateStatus, adminRetryEmail,
  type FeedbackMessage, type FeedbackReply, type FeedbackStatus,
} from '../lib/feedback';

const STATUSES: FeedbackStatus[] = ['new', 'reviewed', 'planned', 'fixed', 'archived'];

export default function FeedbackInbox({ onClose }: { onClose: () => void }) {
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all');
  const [selected, setSelected] = useState<FeedbackMessage | null>(null);
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyState, setReplyState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [statusUpdateMsg, setStatusUpdateMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchAllFeedback(statusFilter === 'all' ? undefined : statusFilter);
      setFeedback(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function openMessage(fb: FeedbackMessage) {
    setSelected(fb);
    setReplyText('');
    setReplyState('idle');
    setStatusUpdateMsg(null);
    setLoadingReplies(true);
    setReplies([]);
    try {
      const data = await adminFetchReplies(fb.id);
      setReplies(data);
    } catch { /* ignore */ } finally {
      setLoadingReplies(false);
    }
  }

  async function handleReply() {
    if (!selected || !replyText.trim()) return;
    setReplyState('sending');
    try {
      const result = await adminReplyToFeedback(selected.id, replyText.trim());
      if (result.ok) {
        setReplyState('success');
        setReplyText('');
        // Refresh replies
        const data = await adminFetchReplies(selected.id);
        setReplies(data);
        // Refresh list
        load();
        setTimeout(() => setReplyState('idle'), 2500);
      } else {
        setReplyState('error');
      }
    } catch {
      setReplyState('error');
    }
  }

  async function handleStatusChange(newStatus: FeedbackStatus) {
    if (!selected) return;
    setStatusUpdateMsg(null);
    try {
      const result = await adminUpdateStatus(selected.id, newStatus);
      if (result.ok) {
        setSelected({ ...selected, status: newStatus });
        setFeedback(prev => prev.map(f => f.id === selected.id ? { ...f, status: newStatus } : f));
        setStatusUpdateMsg('Status updated to ' + newStatus);
        setTimeout(() => setStatusUpdateMsg(null), 2000);
      }
    } catch { /* ignore */ }
  }

  const filtered = statusFilter === 'all' ? feedback : feedback.filter(f => f.status === statusFilter);
  const counts: Record<string, number> = { all: feedback.length };
  for (const s of STATUSES) counts[s] = feedback.filter(f => f.status === s).length;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#fff', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#E8EBF4' }}>
          <div className="flex items-center gap-2">
            <Inbox size={18} color="#7B1C3E" />
            <h2 className="text-base font-bold" style={{ color: '#1B2A4A' }}>Feedback Inbox</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F5E6EC', color: '#7B1C3E' }}>{feedback.length}</span>
          </div>
          <button onClick={onClose} className="flex items-center justify-center rounded-full w-7 h-7 transition-colors hover:bg-gray-100" style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}>
            <X size={16} color="#6B6B6B" />
          </button>
        </div>

        {/* Body: list + detail panel */}
        <div className="flex flex-col md:flex-row overflow-hidden" style={{ flex: 1 }}>
          {/* List */}
          <div className={`${selected ? 'hidden md:block' : 'block'} md:w-80 border-r overflow-y-auto`} style={{ borderColor: '#E8EBF4', flexShrink: 0 }}>
            {/* Filter tabs */}
            <div className="flex flex-wrap gap-1 p-3 sticky top-0" style={{ background: '#fff', borderBottom: '1px solid #E8EBF4', zIndex: 1 }}>
              <FilterChip label="All" count={counts.all} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
              {STATUSES.map(s => (
                <FilterChip key={s} label={s} count={counts[s] || 0} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
              ))}
            </div>

            {/* Items */}
            {loading ? (
              <p className="text-xs text-center py-8" style={{ color: '#9CA3AF' }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-10">
                <Inbox size={28} color="#D1D5DB" className="mx-auto mb-2" />
                <p className="text-xs" style={{ color: '#9CA3AF' }}>No feedback found.</p>
              </div>
            ) : (
              <div>
                {filtered.map(fb => (
                  <button
                    key={fb.id}
                    onClick={() => openMessage(fb)}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{
                      borderBottom: '1px solid #F2F2F2',
                      background: selected?.id === fb.id ? '#F8F9FC' : 'transparent',
                      border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (selected?.id !== fb.id) e.currentTarget.style.background = '#FAFAFA'; }}
                    onMouseLeave={e => { if (selected?.id !== fb.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <TypeBadge type={fb.feedback_type} />
                      <StatusDot status={fb.status} />
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: '#1B2A4A' }}>{fb.subject}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: '#6B6B6B' }}>{fb.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px]" style={{ color: '#9CA3AF' }}>
                        {fb.username ? `@${fb.username}` : 'Guest'}
                      </span>
                      <span className="text-[10px]" style={{ color: '#D1D5DB' }}>·</span>
                      <span className="text-[10px]" style={{ color: '#9CA3AF' }}>{formatDate(fb.created_at)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <button onClick={() => setSelected(null)} className="text-xs font-semibold mb-4 flex items-center gap-1 md:hidden" style={{ color: '#7B1C3E', background: 'none', border: 'none', cursor: 'pointer' }}>
                <ChevronLeft size={12} /> Back
              </button>

              {/* Message detail */}
              <div className="rounded-xl p-5 mb-4" style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}>
                <div className="flex items-center gap-2 mb-3">
                  <TypeBadge type={selected.feedback_type} />
                  <StatusBadge status={selected.status} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: '#1B2A4A' }}>{selected.subject}</h3>
                <p className="text-sm whitespace-pre-wrap" style={{ color: '#1B2A4A', lineHeight: 1.6 }}>{selected.message}</p>

                {/* Metadata */}
                <div className="flex flex-wrap gap-4 mt-4 pt-3" style={{ borderTop: '1px solid #E8EBF4' }}>
                  <MetaItem icon={<User size={12} />} label="From" value={selected.username ? `@${selected.username}` : 'Guest (not logged in)'} />
                  <MetaItem icon={<Mail size={12} />} label="Contact" value={selected.contact_email || 'Not provided'} />
                  <MetaItem icon={<Clock size={12} />} label="Submitted" value={formatDate(selected.created_at)} />
                </div>

                {/* Email notification status */}
                <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid #E8EBF4' }}>
                  {selected.email_sent ? (
                    <p className="text-xs flex items-center gap-1.5" style={{ color: '#059669' }}>
                      <Check size={12} /> Email notification sent to admin
                    </p>
                  ) : (
                    <>
                      <p className="text-xs flex items-center gap-1.5" style={{ color: '#D97706' }}>
                        <AlertCircle size={12} /> Email not sent: {selected.email_error || 'Unknown error'}
                      </p>
                      <button
                        onClick={async () => {
                          const r = await adminRetryEmail(selected.id);
                          if (r.ok && r.email_sent) {
                            setFeedback(prev => prev.map(f => f.id === selected.id ? { ...f, email_sent: true, email_error: null } : f));
                          } else if (!r.ok) {
                            alert(r.error || 'Retry failed. Make sure RESEND_API_KEY is set in Supabase secrets.');
                          }
                        }}
                        className="text-xs px-2 py-0.5 rounded-md transition-colors"
                        style={{ background: '#F5E6EC', color: '#7B1C3E' }}
                      >
                        Retry email
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Status controls */}
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#1B2A4A' }}>Update Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg transition-all capitalize"
                      style={{
                        background: selected.status === s ? '#7B1C3E' : '#F2F2F2',
                        color: selected.status === s ? '#fff' : '#6B6B6B',
                        border: selected.status === s ? '1.5px solid #7B1C3E' : '1.5px solid #E8EBF4',
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {statusUpdateMsg && <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#059669' }}><Check size={12} /> {statusUpdateMsg}</p>}
              </div>

              {/* Replies */}
              {loadingReplies ? (
                <p className="text-xs text-center py-4" style={{ color: '#9CA3AF' }}>Loading replies…</p>
              ) : replies.length > 0 ? (
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>Replies ({replies.length})</p>
                  {replies.map(r => (
                    <div key={r.id} className="rounded-lg p-3" style={{ background: '#fff', border: '1px solid #E8EBF4' }}>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: '#1B2A4A', lineHeight: 1.6 }}>{r.reply_message}</p>
                      <p className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>{formatDate(r.created_at)} {r.read_at ? '· Read' : '· Unread'}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {/* Reply box */}
              <div className="rounded-xl p-4" style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: '#1B2A4A' }}>Write a Reply</p>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                  style={{ border: '1.5px solid #C8C8C8', background: '#fff', color: '#111', fontFamily: 'inherit', minHeight: '70px' }}
                  onFocus={e => e.target.style.borderColor = '#7B1C3E'}
                  onBlur={e => e.target.style.borderColor = '#C8C8C8'}
                  placeholder="Type your reply to the user…"
                  disabled={replyState === 'sending'}
                />
                <p className="text-[10px] mt-0.5 mb-3" style={{ color: '#9CA3AF' }}>{replyText.length}/2000</p>

                {replyState === 'error' && (
                  <div className="rounded-lg px-3 py-2 text-xs mb-2 flex items-center gap-1.5" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
                    <AlertCircle size={12} /> Could not send reply. Please try again.
                  </div>
                )}
                {replyState === 'success' && (
                  <div className="rounded-lg px-3 py-2 text-xs mb-2 flex items-center gap-1.5" style={{ background: '#D1FAE5', color: '#059669' }}>
                    <Check size={12} /> Reply sent! User will be notified.
                  </div>
                )}

                <button
                  onClick={handleReply}
                  disabled={replyState === 'sending' || !replyText.trim()}
                  className="w-full py-2 rounded-lg text-sm font-bold text-white transition-opacity flex items-center justify-center gap-2"
                  style={{
                    background: '#7B1C3E', border: 'none',
                    cursor: replyState === 'sending' || !replyText.trim() ? 'not-allowed' : 'pointer',
                    opacity: replyState === 'sending' || !replyText.trim() ? 0.5 : 1,
                  }}
                >
                  {replyState === 'sending' ? <><Clock size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Reply</>}
                </button>
                {!selected.user_id && (
                  <p className="text-[10px] mt-2 text-center" style={{ color: '#9CA3AF' }}>
                    This is guest feedback — no in-app notification will be sent.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <Inbox size={40} color="#D1D5DB" className="mx-auto mb-3" />
                <p className="text-sm" style={{ color: '#9CA3AF' }}>Select a feedback message to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small UI components ─────────────────────────────────────────────────────
function FilterChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-[10px] font-bold rounded-full transition-all capitalize"
      style={{
        background: active ? '#7B1C3E' : '#F2F2F2',
        color: active ? '#fff' : '#6B6B6B',
        border: 'none', cursor: 'pointer',
      }}
    >
      {label} ({count})
    </button>
  );
}

function TypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    suggestion: 'Suggestion', bug_report: 'Bug', feature_request: 'Feature', general: 'General',
  };
  const colors: Record<string, string> = {
    suggestion: '#EBF0FF', bug_report: '#FEE2E2', feature_request: '#E6F6EF', general: '#F3F4F6',
  };
  const textColors: Record<string, string> = {
    suggestion: '#1B2A4A', bug_report: '#B91C1C', feature_request: '#059669', general: '#6B6B6B',
  };
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
      style={{ background: colors[type] || '#F3F4F6', color: textColors[type] || '#6B6B6B' }}>
      {labels[type] || type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: '#7B1C3E', reviewed: '#1B2A4A', planned: '#B45309', fixed: '#059669', archived: '#9CA3AF',
  };
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full capitalize"
      style={{ background: '#F2F2F2', color: colors[status] || '#6B6B6B' }}>
      {status}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: '#7B1C3E', reviewed: '#1B2A4A', planned: '#B45309', fixed: '#059669', archived: '#9CA3AF',
  };
  return (
    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: colors[status] || '#6B6B6B' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors[status] || '#9CA3AF' }} />
      {status}
    </span>
  );
}

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: '#9CA3AF' }}>{icon}</span>
      <span className="text-[10px] font-semibold uppercase" style={{ color: '#9CA3AF' }}>{label}:</span>
      <span className="text-[10px]" style={{ color: '#1B2A4A' }}>{value}</span>
    </div>
  );
}

function ChevronLeft({ size }: { size: number }) {
  return <span style={{ fontSize: size, lineHeight: 1 }}>‹</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
