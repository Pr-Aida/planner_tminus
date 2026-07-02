import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────
export type FeedbackType = 'suggestion' | 'bug_report' | 'feature_request' | 'general';
export type FeedbackStatus = 'new' | 'reviewed' | 'planned' | 'fixed' | 'archived';

export interface FeedbackMessage {
  id: string;
  user_id: string | null;
  username: string | null;
  contact_email: string | null;
  feedback_type: FeedbackType;
  subject: string;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
  email_sent?: boolean;
  email_error?: string | null;
}

export interface FeedbackReply {
  id: string;
  feedback_id: string;
  admin_user_id: string;
  recipient_user_id: string | null;
  reply_message: string;
  created_at: string;
  read_at: string | null;
}

export interface FeedbackNotification {
  id: string;
  user_id: string;
  feedback_id: string;
  reply_id: string;
  type: string;
  read: boolean;
  created_at: string;
}

// ─── Submit feedback (calls edge function) ───────────────────────────────────
export interface SubmitResult {
  ok: boolean;
  saved: boolean;
  email_sent: boolean;
  email_error: string | null;
  error?: string;
  feedback_id?: string;
}

export async function submitFeedback(params: {
  feedbackType: FeedbackType;
  subject: string;
  message: string;
  contactEmail?: string;
}): Promise<SubmitResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback/submit`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      feedback_type: params.feedbackType,
      subject: params.subject.trim(),
      message: params.message.trim(),
      contact_email: params.contactEmail?.trim() || '',
    }),
  });

  const body = await res.json().catch(() => ({} as SubmitResult));
  if (!res.ok) {
    console.error('[feedback] Submit failed:', res.status, (body as SubmitResult).error);
    return { ok: false, saved: false, email_sent: false, email_error: null, error: (body as SubmitResult).error || 'Submission failed.' };
  }
  console.log('[feedback] Submit result:', { saved: (body as SubmitResult).ok, email_sent: (body as SubmitResult).email_sent, email_error: (body as SubmitResult).email_error });
  return body as SubmitResult;
}

// ─── Fetch current user's feedback ───────────────────────────────────────────
export async function fetchMyFeedback(): Promise<FeedbackMessage[]> {
  const { data, error } = await supabase
    .from('feedback_messages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as FeedbackMessage[];
}

// ─── Fetch replies for a specific feedback message (user view) ───────────────
export async function fetchMyReplies(feedbackId: string): Promise<FeedbackReply[]> {
  const { data, error } = await supabase
    .from('feedback_replies')
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as FeedbackReply[];
}

// ─── Fetch feedback notifications (for badge count) ──────────────────────────
export async function fetchFeedbackNotifications(): Promise<FeedbackNotification[]> {
  const { data, error } = await supabase
    .from('feedback_notifications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as FeedbackNotification[];
}

export async function unreadFeedbackCount(): Promise<number> {
  const { count, error } = await supabase
    .from('feedback_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false);
  if (error) return 0;
  return count || 0;
}

export async function markFeedbackNotificationRead(id: string): Promise<void> {
  await supabase.from('feedback_notifications').update({ read: true }).eq('id', id);
}

export async function markAllFeedbackNotificationsRead(): Promise<void> {
  await supabase.from('feedback_notifications').update({ read: true }).eq('read', false);
}

// ─── Mark reply as read (when user opens their thread) ───────────────────────
export async function markReplyRead(replyId: string): Promise<void> {
  await supabase.from('feedback_replies').update({ read_at: new Date().toISOString() }).eq('id', replyId);
}

// ─── Admin: fetch all feedback ───────────────────────────────────────────────
export async function adminFetchAllFeedback(statusFilter?: FeedbackStatus): Promise<FeedbackMessage[]> {
  let query = supabase.from('feedback_messages').select('*').order('created_at', { ascending: false });
  if (statusFilter && statusFilter !== 'all' as any) {
    query = query.eq('status', statusFilter);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as FeedbackMessage[];
}

// ─── Admin: fetch replies for a feedback message ─────────────────────────────
export async function adminFetchReplies(feedbackId: string): Promise<FeedbackReply[]> {
  const { data, error } = await supabase
    .from('feedback_replies')
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as FeedbackReply[];
}

// ─── Admin: reply to feedback (calls edge function) ──────────────────────────
export async function adminReplyToFeedback(feedbackId: string, replyMessage: string): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Not authenticated.' };

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback/reply`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ feedback_id: feedbackId, reply_message: replyMessage.trim() }),
  });

  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) return { ok: false, error: (body as { error?: string }).error || 'Reply failed.' };
  return { ok: true };
}

// ─── Admin: update feedback status (calls edge function) ─────────────────────
export async function adminUpdateStatus(feedbackId: string, status: FeedbackStatus): Promise<{ ok: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Not authenticated.' };

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback/status`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ feedback_id: feedbackId, status }),
  });

  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) return { ok: false, error: (body as { error?: string }).error || 'Status update failed.' };
  return { ok: true };
}

export async function adminRetryEmail(feedbackId: string): Promise<{ ok: boolean; email_sent?: boolean; error?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Not authenticated.' };

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/feedback/retry-email`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ feedback_id: feedbackId }),
  });

  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) return { ok: false, error: (body as { error?: string }).error || 'Retry failed.' };
  return { ok: true, email_sent: (body as { email_sent?: boolean }).email_sent };
}

// ─── Check if current user is admin ──────────────────────────────────────────
export async function checkIsAdmin(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data) return false;
  return !!data.is_admin;
}
