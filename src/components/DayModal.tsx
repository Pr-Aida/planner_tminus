import { useState, useEffect } from 'react';
import { X, Bell, Plus, Trash2, Check, RotateCcw, Ban } from 'lucide-react';
import type { Reminder, ReminderStatus, ReminderOffset } from '../types';
import { useTheme } from '../lib/theme';

interface Props {
  open: boolean;
  title: string;
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
  reminders: Reminder[];
  onAddReminder: (title: string, offset: ReminderOffset) => void;
  onUpdateReminderStatus: (id: string, status: ReminderStatus) => void;
  onDeleteReminder: (id: string) => void;
}

const OFFSET_LABELS: Record<ReminderOffset, string> = {
  7: '1 week before',
  3: '3 days before',
  1: '1 day before',
  0: 'On the day',
};

export default function DayModal({
  open, title, initialNote, onSave, onClose,
  reminders, onAddReminder, onUpdateReminderStatus, onDeleteReminder,
}: Props) {
  const { colors } = useTheme();
  const [note, setNote] = useState(initialNote);
  const [newReminder, setNewReminder] = useState('');
  const [newOffset, setNewOffset] = useState<ReminderOffset>(0);

  const STATUS_META: Record<ReminderStatus, { label: string; color: string; bg: string }> = {
    pending: { label: 'Pending', color: colors.textPrimary, bg: colors.bgHover },
    completed: { label: 'Completed', color: '#059669', bg: '#D1FAE5' },
    not_completed: { label: 'Not completed', color: colors.error, bg: colors.errorBg },
    postponed: { label: 'Postponed', color: colors.warning, bg: colors.warningBg },
    cancelled: { label: 'Cancelled', color: colors.textSecondary, bg: colors.bgInput },
  };

  useEffect(() => { setNote(initialNote); }, [initialNote]);
  useEffect(() => { if (open) { setNewReminder(''); setNewOffset(0); } }, [open]);

  if (!open) return null;

  function handleAdd() {
    const t = newReminder.trim();
    if (!t) return;
    onAddReminder(t, newOffset);
    setNewReminder('');
    setNewOffset(0);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: colors.bgCard, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold" style={{ color: colors.textPrimary }}>{title}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full w-7 h-7 transition-colors hover:bg-gray-100"
            style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
          >
            <X size={16} color={colors.textSecondary} />
          </button>
        </div>

        {/* Notes */}
        <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: colors.textPrimary }}>
          Day Notes
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Notes for this day..."
          className="w-full rounded-lg p-3 text-sm outline-none resize-y"
          style={{ minHeight: '70px', border: `1.5px solid ${colors.border}`, background: colors.bgInput, fontFamily: 'inherit', color: colors.textPrimary }}
          onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
          onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
        />

        {/* Reminders section */}
        <div className="mt-5" data-tour="tour-monthly-reminders">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} color={colors.accent} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
              Reminders & Events
            </span>
            <div className="flex-1 h-px ml-2" style={{ background: colors.accentLight }} />
          </div>

          {/* Add new reminder */}
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <input
              type="text"
              value={newReminder}
              onChange={e => setNewReminder(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Event title e.g. Exam, Recital..."
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: `1.5px solid ${colors.border}`, background: colors.bgInput, color: colors.textPrimary }}
              onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
              onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
            />
          </div>
          <div className="flex gap-2 mb-3">
            <select
              value={newOffset}
              onChange={e => setNewOffset(Number(e.target.value) as ReminderOffset)}
              className="flex-1 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer"
              style={{ border: `1.5px solid ${colors.border}`, color: colors.textPrimary, background: colors.bgCard }}
            >
              {(Object.keys(OFFSET_LABELS) as unknown as ReminderOffset[]).map(k => (
                <option key={k} value={k}>{OFFSET_LABELS[k]}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newReminder.trim()}
              className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{ background: newReminder.trim() ? colors.accent : '#9CA3AF', border: 'none', cursor: newReminder.trim() ? 'pointer' : 'not-allowed' }}
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Existing reminders */}
          {reminders.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: '#9CA3AF' }}>
              No reminders for this day yet.
            </p>
          ) : (
            <div className="space-y-2">
              {reminders.map(r => {
                const meta = STATUS_META[r.status];
                return (
                  <div key={r.id} className="rounded-lg p-3" style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>{r.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>
                          {OFFSET_LABELS[r.remind_offset]}
                        </p>
                      </div>
                      <button
                        onClick={() => onDeleteReminder(r.id)}
                        className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded transition-colors hover:bg-gray-200"
                        style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
                        title="Delete reminder"
                      >
                        <Trash2 size={12} color="#B91C1C" />
                      </button>
                    </div>

                    {/* Check-in status buttons */}
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ color: meta.color, background: meta.bg }}>
                        {meta.label}
                      </span>
                      {r.status !== 'completed' && (
                        <StatusBtn onClick={() => onUpdateReminderStatus(r.id, 'completed')} icon={<Check size={11} />} label="Done" color="#059669" />
                      )}
                      {r.status !== 'not_completed' && (
                        <StatusBtn onClick={() => onUpdateReminderStatus(r.id, 'not_completed')} icon={<X size={11} />} label="No" color="#B91C1C" />
                      )}
                      {r.status !== 'postponed' && (
                        <StatusBtn onClick={() => onUpdateReminderStatus(r.id, 'postponed')} icon={<RotateCcw size={11} />} label="Postpone" color="#B45309" />
                      )}
                      {r.status !== 'cancelled' && (
                        <StatusBtn onClick={() => onUpdateReminderStatus(r.id, 'cancelled')} icon={<Ban size={11} />} label="Cancel" color="#6B6B6B" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: colors.bgInput, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(note)}
            className="px-5 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
            style={{ background: colors.accent, border: 'none', cursor: 'pointer' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusBtn({ onClick, icon, label, color }: { onClick: () => void; icon: React.ReactNode; label: string; color: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
      style={{ border: `1px solid ${color}40`, color, background: 'transparent', cursor: 'pointer' }}
    >
      {icon} {label}
    </button>
  );
}
