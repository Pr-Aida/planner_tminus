import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Send, Check, AlertCircle, Inbox, ChevronRight, Clock, Reply, X } from 'lucide-react';
import {
  submitFeedback, fetchMyFeedback, fetchMyReplies, markReplyRead, markAllFeedbackNotificationsRead,
  type FeedbackType, type FeedbackMessage, type FeedbackReply,
} from '../lib/feedback';
import { supabase } from '../lib/supabase';

type SubmitState = 'idle' | 'submitting' | 'success' | 'saved_no_email' | 'error';

const FEEDBACK_TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'bug_report', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'general', label: 'General Feedback' },
];

const inputStyle: React.CSSProperties = {
  border: '1.5px solid #C8C8C8',
  background: '#F2F2F2',
  color: '#111',
  fontFamily: 'inherit',
};

export default function FeedbackSection({ userId, username }: { userId: string | null; username: string }) {
  const [view, setView] = useState<'form' | 'history'>('form');
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [myFeedback, setMyFeedback] = useState<FeedbackMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [openThread, setOpenThread] = useState<FeedbackMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<FeedbackReply[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const data = await fetchMyFeedback();
      setMyFeedback(data);
    } catch { /* ignore */ } finally {
      setLoadingHistory(false);
    }
  }, [userId]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  async function handleSubmit() {
    setErrorMsg('');
    if (!subject.trim()) { setErrorMsg('Subject is required.'); return; }
    if (subject.trim().length > 120) { setErrorMsg('Subject must be 120 characters or less.'); return; }
    if (!message.trim()) { setErrorMsg('Message is required.'); return; }
    if (message.trim().length > 2000) { setErrorMsg('Message must be 2000 characters or less.'); return; }
    if (contactEmail.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) { setErrorMsg('Please enter a valid email.'); return; }
    }

    setState('submitting');
    try {
      const result = await submitFeedback({
        feedbackType: type,
        subject: subject.trim(),
        message: message.trim(),
        contactEmail: contactEmail.trim(),
      });
      if (result.ok && result.saved) {
        if (!result.email_sent) {
          setState('saved_no_email');
        } else {
          setState('success');
        }
        setSubject('');
        setMessage('');
        setContactEmail('');
      } else {
        setState('error');
        setErrorMsg(result.error || 'Something went wrong. Please try again later.');
      }
    } catch {
      setState('error');
      setErrorMsg('Something went wrong. Please try again later.');
    }
  }

  async function openFeedbackThread(fb: FeedbackMessage) {
    setOpenThread(fb);
    setLoadingThread(true);
    setThreadReplies([]);
    try {
      const replies = await fetchMyReplies(fb.id);
      setThreadReplies(replies);
      // Mark unread replies as read
      const unread = replies.filter(r => !r.read_at);
      for (const r of unread) {
        await markReplyRead(r.id);
      }
      // Mark feedback notifications as read
      await markAllFeedbackNotificationsRead();
    } catch { /* ignore */ } finally {
      setLoadingThread(false);
    }
  }

  if (openThread) {
    return (
      <FeedbackThread
        feedback={openThread}
        replies={threadReplies}
        loading={loadingThread}
        onBack={() => { setOpenThread(null); loadHistory(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toggle: Form / History */}
      <div className="flex gap-1">
        <button
          onClick={() => setView('form')}
          className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
          style={{
            background: view === 'form' ? '#7B1C3E' : 'transparent',
            color: view === 'form' ? '#fff' : '#6B6B6B',
            border: 'none', cursor: 'pointer',
          }}
        >
          New Feedback
        </button>
        {userId && (
          <button
            onClick={() => setView('history')}
            className="px-3 py-1.5 text-xs font-bold rounded-lg transition-colors"
            style={{
              background: view === 'history' ? '#7B1C3E' : 'transparent',
              color: view === 'history' ? '#fff' : '#6B6B6B',
              border: 'none', cursor: 'pointer',
            }}
          >
            My Feedback
          </button>
        )}
      </div>

      {view === 'form' ? (
        <div className="space-y-4">
          {/* Feedback type */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              Feedback Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FEEDBACK_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className="py-2 px-3 text-xs font-semibold rounded-lg transition-all text-center"
                  style={{
                    background: type === t.value ? '#7B1C3E' : '#F2F2F2',
                    color: type === t.value ? '#fff' : '#6B6B6B',
                    border: type === t.value ? '1.5px solid #7B1C3E' : '1.5px solid #E8EBF4',
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="Brief summary of your feedback"
            />
            <p className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>{subject.length}/120</p>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              Message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
              style={{ ...inputStyle, minHeight: '100px' }}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="Tell me your thoughts, suggestions, bug reports, or ideas…"
            />
            <p className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>{message.length}/2000</p>
          </div>

          {/* Contact email (optional) */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#1B2A4A' }}>
              Contact Email <span style={{ color: '#9CA3AF' }}>(optional)</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={e => setContactEmail(e.target.value)}
              maxLength={254}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
              onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
              placeholder="Only if you want me to be able to reach you by email"
            />
          </div>

          {/* Guest notice */}
          {!userId && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: '#FFF7ED', border: '1px solid #FED7AA', color: '#92400E' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Log in if you want to receive a reply inside the app. Guest feedback can still be submitted.</span>
            </div>
          )}

          {/* Error */}
          {state === 'error' && errorMsg && (
            <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: '#FEE2E2', color: '#B91C1C' }}>
              {errorMsg}
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: '#D1FAE5', color: '#059669' }}>
              <Check size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="font-semibold">Thank you for your feedback! I'll review it soon.</p>
                {userId && <p className="mt-0.5" style={{ color: '#047857' }}>If I reply, you'll receive a notification here.</p>}
              </div>
            </div>
          )}

          {/* Saved but email failed */}
          {state === 'saved_no_email' && (
            <div className="rounded-lg px-3 py-2.5 text-xs flex items-start gap-2" style={{ background: '#FEF3C7', color: '#92400E' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="font-semibold">Your feedback was saved, but the email notification could not be sent.</p>
                {userId && <p className="mt-0.5" style={{ color: '#B45309' }}>If I reply, you'll receive a notification here.</p>}
                {!userId && <p className="mt-0.5" style={{ color: '#B45309' }}>Your feedback was sent. Log in next time if you want to receive a reply inside the app.</p>}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={state === 'submitting'}
            className="w-full py-2.5 rounded-lg text-sm font-bold text-white transition-opacity flex items-center justify-center gap-2"
            style={{
              background: '#7B1C3E', border: 'none',
              cursor: state === 'submitting' ? 'not-allowed' : 'pointer',
              opacity: state === 'submitting' ? 0.6 : 1,
            }}
          >
            {state === 'submitting' ? (
              <><Clock size={14} className="animate-spin" /> Sending…</>
            ) : (
              <><Send size={14} /> Submit Feedback</>
            )}
          </button>
        </div>
      ) : (
        /* History view */
        <div className="space-y-2">
          {loadingHistory ? (
            <p className="text-xs text-center py-6" style={{ color: '#9CA3AF' }}>Loading…</p>
          ) : myFeedback.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare size={28} color="#D1D5DB" className="mx-auto mb-2" />
              <p className="text-xs" style={{ color: '#9CA3AF' }}>You haven't submitted any feedback yet.</p>
            </div>
          ) : (
            myFeedback.map(fb => (
              <button
                key={fb.id}
                onClick={() => openFeedbackThread(fb)}
                className="w-full text-left rounded-lg p-3 transition-all hover:shadow-sm"
                style={{ background: '#F8F9FC', border: '1px solid #E8EBF4', cursor: 'pointer' }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge type={fb.feedback_type} />
                  <StatusBadge status={fb.status} />
                </div>
                <p className="text-sm font-semibold truncate" style={{ color: '#1B2A4A' }}>{fb.subject}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#6B6B6B' }}>{fb.message}</p>
                <p className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>{formatDate(fb.created_at)}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Feedback Thread View ────────────────────────────────────────────────────
function FeedbackThread({ feedback, replies, loading, onBack }: {
  feedback: FeedbackMessage;
  replies: FeedbackReply[];
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs font-semibold flex items-center gap-1" style={{ color: '#7B1C3E', background: 'none', border: 'none', cursor: 'pointer' }}>
        <ChevronRight size={12} style={{ transform: 'rotate(180deg)' }} /> Back
      </button>

      {/* Original message */}
      <div className="rounded-lg p-4" style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}>
        <div className="flex items-center gap-2 mb-2">
          <TypeBadge type={feedback.feedback_type} />
          <StatusBadge status={feedback.status} />
        </div>
        <p className="text-sm font-bold" style={{ color: '#1B2A4A' }}>{feedback.subject}</p>
        <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: '#6B6B6B', lineHeight: 1.6 }}>{feedback.message}</p>
        <p className="text-[10px] mt-3" style={{ color: '#9CA3AF' }}>{formatDate(feedback.created_at)}</p>
      </div>

      {/* Replies */}
      {loading ? (
        <p className="text-xs text-center py-4" style={{ color: '#9CA3AF' }}>Loading replies…</p>
      ) : replies.length === 0 ? (
        <div className="text-center py-6">
          <Reply size={24} color="#D1D5DB" className="mx-auto mb-2" />
          <p className="text-xs" style={{ color: '#9CA3AF' }}>No replies yet. I'll review your feedback soon.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>Replies</p>
          {replies.map(r => (
            <div key={r.id} className="rounded-lg p-3" style={{ background: '#fff', border: '1px solid #E8EBF4', boxShadow: '0 2px 8px rgba(27,42,74,0.06)' }}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#7B1C3E' }}>
                  <span className="text-[8px] font-bold text-white">A</span>
                </div>
                <span className="text-xs font-bold" style={{ color: '#1B2A4A' }}>Admin</span>
              </div>
              <p className="text-xs whitespace-pre-wrap" style={{ color: '#1B2A4A', lineHeight: 1.6 }}>{r.reply_message}</p>
              <p className="text-[10px] mt-2" style={{ color: '#9CA3AF' }}>{formatDate(r.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: FeedbackType }) {
  const labels: Record<FeedbackType, string> = {
    suggestion: 'Suggestion', bug_report: 'Bug', feature_request: 'Feature', general: 'General',
  };
  const colors: Record<FeedbackType, string> = {
    suggestion: '#EBF0FF', bug_report: '#FEE2E2', feature_request: '#E6F6EF', general: '#F3F4F6',
  };
  const textColors: Record<FeedbackType, string> = {
    suggestion: '#1B2A4A', bug_report: '#B91C1C', feature_request: '#059669', general: '#6B6B6B',
  };
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
      style={{ background: colors[type], color: textColors[type] }}>
      {labels[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: '#7B1C3E', reviewed: '#1B2A4A', planned: '#B45309', fixed: '#059669', archived: '#9CA3AF',
  };
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
      style={{ background: '#F2F2F2', color: colors[status] || '#6B6B6B' }}>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
