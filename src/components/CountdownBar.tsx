import { useState, useEffect } from 'react';
import { Plus, Pencil, X, Clock } from 'lucide-react';
import type { CalendarMode } from '../types';
import { SH_MONTHS, shToGregorian, todaySh } from '../lib/calendar';
import { useTheme } from '../lib/theme';

export interface CountdownConfig {
  name: string;
  targetDate: string; // Gregorian ISO "YYYY-MM-DD"
}

interface Props {
  countdown: CountdownConfig | null;
  calMode: CalendarMode;
  currentShMonth: number;
  onSave: (cfg: CountdownConfig | null) => void;
}

function daysLeft(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export default function CountdownBar({
  countdown, calMode, currentShMonth, onSave,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const days = countdown ? daysLeft(countdown.targetDate) : null;

  function handleDelete() {
    onSave(null);
  }

  return (
    <>
      {/* The bar */}
      <div
        className="flex items-center justify-center gap-3 px-6"
        data-tour="tour-countdown"
        style={{
          background: '#253660',
          height: '38px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {countdown && days !== null ? (
          <div className="flex items-center gap-3">
            <Clock size={13} color="rgba(255,255,255,0.55)" />
            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {countdown.name}
            </span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: days > 0 ? 'rgba(123,28,62,0.55)' : days === 0 ? '#B8860B' : 'rgba(255,255,255,0.15)',
                color: '#fff',
              }}
            >
              {days > 0 ? `${days} day${days !== 1 ? 's' : ''} left` : days === 0 ? 'Today!' : `${Math.abs(days)} days ago`}
            </span>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', padding: '2px' }}
              title="Edit countdown"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: '2px' }}
              title="Remove countdown"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 text-xs transition-opacity hover:opacity-80"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)' }}
          >
            <Plus size={13} />
            Add a countdown
          </button>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <CountdownModal
          initial={countdown}
          calMode={calMode}
          currentShMonth={currentShMonth}
          onSave={cfg => { onSave(cfg); setModalOpen(false); }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  initial: CountdownConfig | null;
  calMode: CalendarMode;
  currentShMonth: number;
  onSave: (cfg: CountdownConfig) => void;
  onClose: () => void;
}

type InputMode = 'days' | 'date';

function CountdownModal({ initial, calMode, currentShMonth, onSave, onClose }: ModalProps) {
  const { colors } = useTheme();
  const [name, setName] = useState(initial?.name || '');
  const [inputMode, setInputMode] = useState<InputMode>(initial ? 'date' : 'days');
  const [daysInput, setDaysInput] = useState('');
  const [saved, setSaved] = useState(false);

  // SH date pickers — default to current SH year
  const todayShDate = todaySh();
  const [shYear, setShYear] = useState(todayShDate.year);
  const [shMonth, setShMonth] = useState(currentShMonth);
  const [shDay, setShDay] = useState(1);

  // Gregorian date picker
  const [gregDateStr, setGregDateStr] = useState(() => {
    if (initial) return initial.targetDate;
    const t = new Date();
    t.setDate(t.getDate() + 30);
    return t.toISOString().slice(0, 10);
  });

  function computeTargetDate(): string | null {
    if (inputMode === 'days') {
      const n = parseInt(daysInput);
      if (!n || n < 1) return null;
      const t = new Date();
      t.setDate(t.getDate() + n);
      return t.toISOString().slice(0, 10);
    }
    if (calMode === 'shamsi') {
      const g = shToGregorian({ year: shYear, month: shMonth, day: shDay });
      return `${g.year}-${String(g.month).padStart(2,'0')}-${String(g.day).padStart(2,'0')}`;
    }
    return gregDateStr;
  }

  function handleSave() {
    if (!name.trim()) return;
    const target = computeTargetDate();
    if (!target) return;
    onSave({ name: name.trim(), targetDate: target });
    setSaved(true);
  }

  useEffect(() => {
    if (saved) {
      const id = setTimeout(onClose, 1200);
      return () => clearTimeout(id);
    }
  }, [saved, onClose]);

  const canSave = name.trim() && (inputMode === 'date' || parseInt(daysInput) > 0);

  const dateTabLabel = calMode === 'shamsi' ? 'Target Date (SH)' : 'Target Date';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-5"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-7"
        style={{ background: colors.bgCard, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold" style={{ color: colors.textPrimary }}>Countdown</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.border }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Name */}
        <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
          Name
        </label>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Violin Recital, Final Exam..."
          className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-5"
          style={{
            border: `1.5px solid ${colors.borderLight}`,
            background: colors.bgCard,
            fontFamily: 'inherit',
            color: colors.textPrimary,
          }}
          onFocus={e => (e.target.style.borderColor = colors.accent)}
          onBlur={e => (e.target.style.borderColor = colors.borderLight)}
        />

        {/* Mode toggle */}
        <div
          className="flex rounded-xl overflow-hidden mb-5"
          style={{ border: `1.5px solid ${colors.borderLight}` }}
        >
          <button
            onClick={() => setInputMode('days')}
            className="flex-1 py-2.5 text-xs font-bold transition-all"
            style={{
              background: inputMode === 'days' ? colors.accentLight : colors.bgCard,
              color: inputMode === 'days' ? colors.accent : colors.textSecondary,
              border: inputMode === 'days' ? `1.5px solid ${colors.accent}` : '1.5px solid transparent',
              borderRadius: '10px 0 0 10px',
              cursor: 'pointer',
            }}
          >
            Number of Days
          </button>
          <button
            onClick={() => setInputMode('date')}
            className="flex-1 py-2.5 text-xs font-bold transition-all"
            style={{
              background: inputMode === 'date' ? colors.accentLight : colors.bgCard,
              color: inputMode === 'date' ? colors.accent : colors.textSecondary,
              border: inputMode === 'date' ? `1.5px solid ${colors.accent}` : '1.5px solid transparent',
              borderRadius: '0 10px 10px 0',
              cursor: 'pointer',
            }}
          >
            {dateTabLabel}
          </button>
        </div>

        {/* Input based on mode */}
        {inputMode === 'days' ? (
          <>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
              Days from Today
            </label>
            <input
              type="number"
              min={1}
              max={9999}
              value={daysInput}
              onChange={e => setDaysInput(e.target.value)}
              placeholder="e.g. 30"
              className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-6"
              style={{
                border: `1.5px solid ${colors.borderLight}`,
                background: colors.bgCard,
                fontFamily: 'inherit',
                color: colors.textPrimary,
              }}
              onFocus={e => (e.target.style.borderColor = colors.accent)}
              onBlur={e => (e.target.style.borderColor = colors.borderLight)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </>
        ) : calMode === 'shamsi' ? (
          <>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
              Target Date (SH)
            </label>
            <div className="flex gap-2 mb-6">
              <select
                value={shYear}
                onChange={e => setShYear(Number(e.target.value))}
                className="rounded-xl px-3 py-3 text-sm outline-none"
                style={{ width: '90px', border: `1.5px solid ${colors.borderLight}`, color: colors.textPrimary, background: colors.bgCard }}
              >
                {Array.from({ length: 6 }, (_, i) => todayShDate.year + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={shMonth}
                onChange={e => { setShMonth(Number(e.target.value)); setShDay(1); }}
                className="flex-1 rounded-xl px-3 py-3 text-sm outline-none"
                style={{ border: `1.5px solid ${colors.borderLight}`, color: colors.textPrimary, background: colors.bgCard }}
              >
                {SH_MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m.name}</option>
                ))}
              </select>
              <select
                value={shDay}
                onChange={e => setShDay(Number(e.target.value))}
                className="rounded-xl px-3 py-3 text-sm outline-none"
                style={{ width: '72px', border: `1.5px solid ${colors.borderLight}`, color: colors.textPrimary, background: colors.bgCard }}
              >
                {Array.from({ length: SH_MONTHS[shMonth - 1].days }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
              Target Date
            </label>
            <input
              type="date"
              value={gregDateStr}
              onChange={e => setGregDateStr(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none mb-6"
              style={{
                border: `1.5px solid ${colors.borderLight}`,
                color: colors.textPrimary,
                background: colors.bgCard,
                fontFamily: 'inherit',
              }}
              onFocus={e => (e.target.style.borderColor = colors.accent)}
              onBlur={e => (e.target.style.borderColor = colors.borderLight)}
            />
          </>
        )}

        {/* Spacer if needed */}
        {inputMode === 'days' ? null : <div />}

        {/* Actions */}
        <div className="flex gap-3">
          {saved ? (
            <div
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-center"
              style={{ background: '#D1FAE5', color: '#059669' }}
            >
              Countdown saved successfully.
            </div>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: colors.bgInput, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity"
                style={{
                  background: colors.accent,
                  border: 'none',
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  opacity: canSave ? 1 : 0.5,
                }}
              >
                Save
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
