import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Clock, Play, Pause, Square, Timer, Loader2, Pencil, X } from 'lucide-react';
import type { Activity } from '../types';
import { useTheme } from '../lib/theme';
import { useTimeFormat, formatTimeRange as fmtRange } from '../lib/timeFormat';
import {
  type DraftForm,
  type TimerRecord,
  emptyDraftForm,
  fetchDraft,
  fetchTimer,
  getSignedInUserId,
  isEmptyDraftForm,
  isSameDraftForm,
  removeDraft,
  removeTimer,
  saveDraft,
  saveTimer,
  subscribeToActivitySync,
  timerElapsedSeconds,
} from '../lib/activitySync';

interface Props {
  activities: Activity[];
  dateKey: string;
  onAdd: (act: Omit<Activity, 'id'>) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, act: Omit<Activity, 'id'>) => void;
}

type AddMode = 'menu' | 'timer' | 'manual' | null;

interface SyncedDraft {
  dateKey: string;
  updatedAt: string;
  form: DraftForm;
}

const DRAFT_SAVE_DELAY_MS = 800;
const SYNC_ERROR_MESSAGE = "Changes couldn't be synced. Check your connection; they'll be retried.";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function formatTimeInput(seconds: number): { from: string; to: string } {
  const now = new Date();
  const toMinutes = now.getHours() * 60 + now.getMinutes();
  const fromMinutes = toMinutes - Math.floor(seconds / 60);
  const fromHours = Math.floor(fromMinutes / 60) % 24;
  const fromMins = fromMinutes % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return {
    from: `${pad(fromHours)}:${pad(fromMins)}`,
    to: `${pad(now.getHours())}:${pad(now.getMinutes())}`
  };
}

export default function ActivitySection({ activities, dateKey, onAdd, onDelete, onUpdate }: Props) {
  const { colors } = useTheme();
  const timeFormat = useTimeFormat();
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [form, setForm] = useState<DraftForm>(emptyDraftForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadedDateKey, setLoadedDateKey] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [timerState, setTimerState] = useState<TimerRecord | null>(null);
  const [loadingTimer, setLoadingTimer] = useState(true);
  const [timerName, setTimerName] = useState('');
  const [timerNote, setTimerNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const dateKeyRef = useRef(dateKey);
  dateKeyRef.current = dateKey;
  const addModeRef = useRef(addMode);
  addModeRef.current = addMode;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;

  const syncedDraftRef = useRef<SyncedDraft | null>(null);
  const editVersionRef = useRef(0);
  const pendingDraftRef = useRef<{ dateKey: string; form: DraftForm } | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftInFlightRef = useRef(0);

  function enqueueDraftTask(task: () => Promise<void>) {
    draftInFlightRef.current += 1;
    draftQueueRef.current = draftQueueRef.current
      .then(task)
      .catch(err => {
        console.error('Activity draft sync failed', err);
        setSyncError(SYNC_ERROR_MESSAGE);
      })
      .finally(() => {
        draftInFlightRef.current -= 1;
      });
  }

  async function persistDraft(dk: string, draft: DraftForm) {
    const synced = syncedDraftRef.current;
    if (synced && synced.dateKey === dk && isSameDraftForm(synced.form, draft)) return;
    const userId = await getSignedInUserId();
    if (!userId) return;
    if (isEmptyDraftForm(draft)) {
      await removeDraft(dk);
      syncedDraftRef.current = null;
      return;
    }
    const updatedAt = await saveDraft(userId, dk, draft);
    syncedDraftRef.current = { dateKey: dk, updatedAt, form: draft };
  }

  function cancelPendingDraft() {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
    pendingDraftRef.current = null;
  }

  function flushPendingDraft() {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = null;
    const pending = pendingDraftRef.current;
    pendingDraftRef.current = null;
    if (pending) enqueueDraftTask(() => persistDraft(pending.dateKey, pending.form));
  }

  function queueDraftSave(dk: string, draft: DraftForm) {
    editVersionRef.current += 1;
    pendingDraftRef.current = { dateKey: dk, form: draft };
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(flushPendingDraft, DRAFT_SAVE_DELAY_MS);
  }

  function discardDraft(dk: string) {
    cancelPendingDraft();
    syncedDraftRef.current = null;
    enqueueDraftTask(() => removeDraft(dk));
  }

  async function applyRemoteDraft(dk: string) {
    const versionAtStart = editVersionRef.current;
    let remote: Awaited<ReturnType<typeof fetchDraft>>;
    try {
      remote = await fetchDraft(dk);
    } catch (err) {
      console.error('Could not load activity draft', err);
      setSyncError(SYNC_ERROR_MESSAGE);
      return;
    }
    if (dateKeyRef.current !== dk) return;
    setLoadedDateKey(dk);
    if (
      pendingDraftRef.current ||
      draftInFlightRef.current > 0 ||
      editingIdRef.current ||
      editVersionRef.current !== versionAtStart
    ) {
      return;
    }
    setSyncError(null);

    const synced = syncedDraftRef.current?.dateKey === dk ? syncedDraftRef.current : null;

    if (!remote) {
      if (synced && addModeRef.current === 'manual') {
        setForm(emptyDraftForm);
        setAddMode(null);
      }
      syncedDraftRef.current = null;
      return;
    }

    if (synced && Date.parse(remote.updatedAt) <= Date.parse(synced.updatedAt)) {
      return;
    }

    syncedDraftRef.current = { dateKey: dk, updatedAt: remote.updatedAt, form: remote.form };
    setForm(remote.form);
    setAddMode(prev => (prev === null || prev === 'menu' ? 'manual' : prev));
  }

  async function refreshTimer() {
    try {
      const userId = await getSignedInUserId();
      if (!userId) return;
      const timer = await fetchTimer(userId);
      setTimerState(timer);
      if (timer) {
        setTimerName(timer.activity_name);
        setTimerNote(timer.activity_note ?? '');
      }
      setSyncError(null);
    } catch (err) {
      console.error('Could not load activity timer', err);
      setSyncError(SYNC_ERROR_MESSAGE);
    } finally {
      setLoadingTimer(false);
    }
  }

  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    void refreshTimer();
    void applyRemoteDraft(dateKeyRef.current);
  };

  useEffect(() => {
    setLoadedDateKey(null);
    setForm(emptyDraftForm);
    setEditingId(null);
    setAddMode(null);
    syncedDraftRef.current = null;
    void applyRemoteDraft(dateKey);
    return () => {
      flushPendingDraft();
    };
  }, [dateKey]);

  useEffect(() => {
    if (loadedDateKey !== dateKey || addMode !== 'manual' || editingId) return;
    queueDraftSave(dateKey, form);
  }, [form, addMode, editingId, loadedDateKey, dateKey]);

  useEffect(() => {
    void refreshTimer();
  }, []);

  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      const userId = await getSignedInUserId();
      if (!userId || disposed) return;
      unsubscribe = subscribeToActivitySync(userId, () => refreshRef.current());
    })();
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (!timerState || timerState.is_paused) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [timerState]);

  async function runTimerAction(
    action: (userId: string, latest: TimerRecord | null) => Promise<void>,
  ) {
    setSaving(true);
    try {
      const userId = await getSignedInUserId();
      if (!userId) return;
      const latest = await fetchTimer(userId);
      setTimerState(latest);
      await action(userId, latest);
      setSyncError(null);
    } catch (err) {
      console.error('Activity timer sync failed', err);
      setSyncError(SYNC_ERROR_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  async function writeTimer(userId: string, fields: Omit<TimerRecord, 'id'>) {
    const saved = await saveTimer(userId, fields);
    setTimerState(saved);
  }

  async function handleStartTimer() {
    if (!timerName.trim()) return;
    await runTimerAction(async userId => {
      await writeTimer(userId, {
        activity_name: timerName.trim(),
        activity_note: timerNote.trim(),
        started_at: new Date().toISOString(),
        accumulated_seconds: 0,
        is_paused: false,
        paused_at: null,
      });
      setAddMode(null);
    });
  }

  async function handlePauseTimer() {
    await runTimerAction(async (userId, latest) => {
      if (!latest || latest.is_paused) return;
      await writeTimer(userId, {
        activity_name: latest.activity_name,
        activity_note: latest.activity_note,
        started_at: latest.started_at,
        accumulated_seconds: timerElapsedSeconds(latest, Date.now()),
        is_paused: true,
        paused_at: new Date().toISOString(),
      });
    });
  }

  async function handleResumeTimer() {
    await runTimerAction(async (userId, latest) => {
      if (!latest || !latest.is_paused) return;
      await writeTimer(userId, {
        activity_name: latest.activity_name,
        activity_note: latest.activity_note,
        started_at: new Date().toISOString(),
        accumulated_seconds: latest.accumulated_seconds,
        is_paused: false,
        paused_at: null,
      });
    });
  }

  async function handleEndTimer() {
    await runTimerAction(async (userId, latest) => {
      if (!latest) return;
      const finalSeconds = timerElapsedSeconds(latest, Date.now());

      if (finalSeconds > 0) {
        const timeRange = formatTimeInput(finalSeconds);
        const timerNoteText = latest.activity_note?.trim();
        const durationLabel = `${Math.floor(finalSeconds / 60)} minutes (timer)`;
        setForm({
          name: latest.activity_name,
          from: timeRange.from,
          to: timeRange.to,
          note: timerNoteText ? `${durationLabel} — ${timerNoteText}` : durationLabel,
        });
        setEditingId(null);
        setAddMode('manual');
      }

      await removeTimer(userId);
      setTimerState(null);
      setTimerName('');
      setTimerNote('');
    });
  }

  function handleSaveForm() {
    if (!form.name.trim()) return;
    if (editingId) {
      onUpdate(editingId, { name: form.name.trim(), from: form.from, to: form.to, note: form.note.trim() });
    } else {
      onAdd({ name: form.name.trim(), from: form.from, to: form.to, note: form.note.trim() });
    }
    discardDraft(dateKey);
    setForm(emptyDraftForm);
    setEditingId(null);
    setAddMode(null);
  }

  function handleEditActivity(act: Activity) {
    setForm({ name: act.name, from: act.from, to: act.to, note: act.note });
    setEditingId(act.id);
    setAddMode('manual');
  }

  function handleCancelForm() {
    discardDraft(dateKey);
    setForm(emptyDraftForm);
    setEditingId(null);
    setAddMode(null);
  }

  const elapsedSeconds = timerState ? timerElapsedSeconds(timerState, nowMs) : 0;

  const inputStyle: React.CSSProperties = {
    border: `1.5px solid ${colors.borderLight}`,
    background: colors.bgInput,
    fontFamily: 'inherit',
    color: colors.textPrimary,
  };

  return (
    <div
      className="rounded-xl p-6 mb-4"
      data-tour="tour-activities"
      style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
    >
      {/* Card title row */}
      <div className="flex items-center mb-4">
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: colors.accent }}
        >
          Activities
        </span>
        <div className="flex-1 h-px ml-3" style={{ background: colors.accentLight }} />
        <button
          onClick={() => { if (editingId) { setForm(emptyDraftForm); setEditingId(null); } setAddMode('menu'); }}
          className="ml-3 flex items-center justify-center rounded-lg w-7 h-7 transition-opacity hover:opacity-80"
          style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
          title="Add activity"
        >
          <Plus size={14} color="#fff" />
        </button>
      </div>

      {syncError && (
        <p className="text-xs mb-3 leading-relaxed" style={{ color: colors.warning }}>
          {syncError}
        </p>
      )}

      {/* Active timer display — always visible when a timer is running/paused */}
      {!loadingTimer && timerState && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Timer size={14} color={colors.accent} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
              Activity Timer
            </span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                {timerState.activity_name}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: timerState.is_paused ? colors.warningBg : colors.successBg,
                  color: timerState.is_paused ? colors.warning : colors.success,
                }}
              >
                {timerState.is_paused ? 'Paused' : 'Running'}
              </span>
            </div>
            {timerState.activity_note && (
              <p className="text-xs mb-2 leading-relaxed" style={{ color: colors.textSecondary }}>
                {timerState.activity_note}
              </p>
            )}
            <div
              className="text-2xl font-mono font-bold text-center py-3 rounded-lg mb-3"
              style={{
                background: colors.bgCard,
                color: timerState.is_paused ? colors.textSecondary : colors.accent,
              }}
            >
              {formatDuration(elapsedSeconds)}
            </div>

            {/* Timer controls */}
            <div className="flex gap-2">
              {timerState.is_paused ? (
                <>
                  <button
                    onClick={handleResumeTimer}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: colors.success, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                    Resume
                  </button>
                  <button
                    onClick={handleEndTimer}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: colors.heroBg, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                    End & Edit
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handlePauseTimer}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold"
                    style={{ background: colors.warningBg, color: colors.warning, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}
                    Pause
                  </button>
                  <button
                    onClick={handleEndTimer}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold text-white"
                    style={{ background: colors.heroBg, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
                    End & Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add choice menu */}
      {addMode === 'menu' && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
              Add Activity
            </span>
            <button
              onClick={() => setAddMode(null)}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setAddMode('timer')}
              disabled={!!timerState}
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-lg text-xs font-bold transition-opacity"
              style={{
                background: colors.bgCard,
                border: `1.5px solid ${colors.borderLight}`,
                color: colors.textPrimary,
                cursor: timerState ? 'not-allowed' : 'pointer',
                opacity: timerState ? 0.5 : 1,
              }}
            >
              <Timer size={20} color={colors.accent} />
              Activity Timer
            </button>
            <button
              onClick={() => { if (editingId) { setForm(emptyDraftForm); setEditingId(null); } setAddMode('manual'); }}
              className="flex-1 flex flex-col items-center gap-2 py-4 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
              style={{
                background: colors.bgCard,
                border: `1.5px solid ${colors.borderLight}`,
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              <Plus size={20} color={colors.accent} />
              Add Manually
            </button>
          </div>
          {timerState && (
            <p className="text-xs mt-2 text-center" style={{ color: colors.textTertiary }}>
              Finish the active timer first to start a new one.
            </p>
          )}
        </div>
      )}

      {/* New timer form */}
      {addMode === 'timer' && !timerState && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Timer size={14} color={colors.accent} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                Activity Timer
              </span>
            </div>
            <button
              onClick={() => setAddMode(null)}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={timerName}
                onChange={e => setTimerName(e.target.value)}
                placeholder="What are you studying?"
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = colors.accent}
                onBlur={e => e.target.style.borderColor = colors.borderLight}
                onKeyDown={e => e.key === 'Enter' && handleStartTimer()}
              />
              <button
                onClick={handleStartTimer}
                disabled={!timerName.trim() || saving}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white"
                style={{ background: colors.success, border: 'none', cursor: !timerName.trim() || saving ? 'not-allowed' : 'pointer', opacity: !timerName.trim() || saving ? 0.6 : 1 }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Start
              </button>
            </div>
            <input
              type="text"
              value={timerNote}
              onChange={e => setTimerNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = colors.accent}
              onBlur={e => e.target.style.borderColor = colors.borderLight}
              onKeyDown={e => e.key === 'Enter' && handleStartTimer()}
            />
          </div>
        </div>
      )}

      {/* Manual add/edit form */}
      {addMode === 'manual' && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={12} color={colors.textSecondary} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                {editingId ? 'Edit Activity' : 'Add Activity Manually'}
              </span>
            </div>
            <button
              onClick={handleCancelForm}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Activity name */}
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Activity name"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = colors.heroBg}
            onBlur={e => e.target.style.borderColor = colors.borderLight}
          />

          {/* Time inputs */}
          <div className="flex gap-3 mb-3">
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
            >
              <input
                type="time"
                value={form.from}
                onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.from ? colors.textPrimary : colors.textTertiary, border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color={colors.textTertiary} />
            </div>
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
            >
              <input
                type="time"
                value={form.to}
                onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.to ? colors.textPrimary : colors.textTertiary, border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color={colors.textTertiary} />
            </div>
          </div>

          {/* Note */}
          <input
            type="text"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Note (optional)"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-4"
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = colors.heroBg}
            onBlur={e => e.target.style.borderColor = colors.borderLight}
            onKeyDown={e => e.key === 'Enter' && handleSaveForm()}
          />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSaveForm}
              disabled={!form.name.trim()}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{
                background: colors.heroBg,
                border: 'none',
                cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                opacity: form.name.trim() ? 1 : 0.6,
              }}
            >
              {editingId ? 'Save Changes' : 'Add'}
            </button>
            <button
              onClick={handleCancelForm}
              className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activity list */}
      <div className="space-y-2">
        {activities.map(act => (
          <ActivityCard
            key={act.id}
            activity={act}
            onDelete={() => onDelete(act.id)}
            onEdit={() => handleEditActivity(act)}
            timeFormat={timeFormat}
          />
        ))}
        {activities.length === 0 && !addMode && !loadingTimer && (
          <p className="text-xs py-2" style={{ color: colors.textTertiary }}>
            No activities yet — click + to start a timer or add one manually.
          </p>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  activity: Activity;
  onDelete: () => void;
  onEdit: () => void;
  timeFormat: '12h' | '24h';
}

function ActivityCard({ activity, onDelete, onEdit, timeFormat }: CardProps) {
  const { colors } = useTheme();
  const duration = (() => {
    if (!activity.from || !activity.to) return null;
    const [fh, fm] = activity.from.split(':').map(Number);
    const [th, tm] = activity.to.split(':').map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3 group"
      style={{
        background: colors.bgSubtle,
        borderLeft: `3px solid ${colors.heroBg}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
            {activity.name}
          </span>
          {activity.from && activity.to && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: colors.bgHover, color: colors.textSecondary }}
            >
              {fmtRange(activity.from, activity.to, timeFormat)}
              {duration && ` · ${duration}`}
            </span>
          )}
        </div>
        {activity.note && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>
            {activity.note}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onEdit}
          className="p-1 rounded transition-colors"
          style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.accent)}
          onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
          title="Edit activity"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1 rounded transition-colors"
          style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
          onMouseEnter={e => (e.currentTarget.style.color = colors.accent)}
          onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
          title="Delete activity"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
