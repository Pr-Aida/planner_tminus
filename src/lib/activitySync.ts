import { supabase } from './supabase';

export interface DraftForm {
  name: string;
  from: string;
  to: string;
  note: string;
}

export interface DraftRecord {
  form: DraftForm;
  updatedAt: string;
}

export interface TimerRecord {
  id: string;
  activity_name: string;
  activity_note: string | null;
  started_at: string;
  accumulated_seconds: number;
  is_paused: boolean;
  paused_at: string | null;
}

export const emptyDraftForm: DraftForm = { name: '', from: '', to: '', note: '' };

export function isEmptyDraftForm(form: DraftForm): boolean {
  return !form.name && !form.from && !form.to && !form.note;
}

export function isSameDraftForm(a: DraftForm, b: DraftForm): boolean {
  return a.name === b.name && a.from === b.from && a.to === b.to && a.note === b.note;
}

export function timerElapsedSeconds(
  timer: Pick<TimerRecord, 'started_at' | 'accumulated_seconds' | 'is_paused'>,
  nowMs: number,
): number {
  if (timer.is_paused) return timer.accumulated_seconds;
  const started = new Date(timer.started_at).getTime();
  return timer.accumulated_seconds + Math.max(0, Math.floor((nowMs - started) / 1000));
}

function parseDraftForm(value: unknown): DraftForm {
  if (!value || typeof value !== 'object') return emptyDraftForm;
  const v = value as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === 'string' ? field : '');
  return { name: text(v.name), from: text(v.from), to: text(v.to), note: text(v.note) };
}

export async function getSignedInUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchTimer(userId: string): Promise<TimerRecord | null> {
  const { data, error } = await supabase
    .from('activity_timer_state')
    .select('id, activity_name, activity_note, started_at, accumulated_seconds, is_paused, paused_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as TimerRecord | null;
}

export async function saveTimer(userId: string, fields: Omit<TimerRecord, 'id'>): Promise<TimerRecord> {
  const { data, error } = await supabase
    .from('activity_timer_state')
    .upsert(
      { user_id: userId, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select('id, activity_name, activity_note, started_at, accumulated_seconds, is_paused, paused_at')
    .single();
  if (error) throw error;
  return data as TimerRecord;
}

export async function removeTimer(userId: string): Promise<void> {
  const { error } = await supabase
    .from('activity_timer_state')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

export async function fetchDraft(dateKey: string): Promise<DraftRecord | null> {
  const { data, error } = await supabase
    .from('activity_drafts')
    .select('payload, updated_at')
    .eq('date_key', dateKey)
    .eq('mode', 'manual')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { form: parseDraftForm(data.payload), updatedAt: data.updated_at as string };
}

export async function saveDraft(userId: string, dateKey: string, form: DraftForm): Promise<string> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('activity_drafts')
    .upsert(
      { user_id: userId, date_key: dateKey, mode: 'manual', payload: form, updated_at: updatedAt },
      { onConflict: 'user_id,date_key,mode' },
    );
  if (error) throw error;
  return updatedAt;
}

export async function removeDraft(dateKey: string): Promise<void> {
  const { error } = await supabase
    .from('activity_drafts')
    .delete()
    .eq('date_key', dateKey)
    .eq('mode', 'manual');
  if (error) throw error;
}

export function subscribeToActivitySync(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`activity-sync:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_timer_state', filter: `user_id=eq.${userId}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_drafts', filter: `user_id=eq.${userId}` }, () => onChange())
    .subscribe(status => {
      if (status === 'SUBSCRIBED') onChange();
    });

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') onChange();
  };

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', onChange);
  window.addEventListener('online', onChange);

  return () => {
    supabase.removeChannel(channel);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('focus', onChange);
    window.removeEventListener('online', onChange);
  };
}
