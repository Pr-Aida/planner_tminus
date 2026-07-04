import { useCallback, useMemo } from 'react';
import { Bell, Check, X, RotateCcw, Ban, PartyPopper } from 'lucide-react';
import ActivitySection from '../components/ActivitySection';
import HabitSection from '../components/HabitSection';
import { useTheme } from '../lib/theme';
import type { Activity, DailyData, Habit, HabitType, Reminder, ReminderStatus } from '../types';
function genId() { return crypto.randomUUID(); }

interface Props {
  data: DailyData;
  habits: Habit[];
  dateKey: string;
  isToday: boolean;
  reminders: Reminder[];
  onDataChange: (patch: Partial<DailyData>) => void;
  onAddHabitToTemplate: (name: string, type: HabitType, unit: string | null) => Promise<void>;
  onAddHabitToDay: (name: string, type: HabitType, unit: string | null) => void;
  onDeleteHabit: (id: string) => Promise<void>;
  onRenameHabit: (id: string, newName: string) => Promise<void>;
  onUpdateHabitUnit: (id: string, unit: string | null) => Promise<void>;
  onHideHabitForDay: (id: string) => void;
  onRemoveExtraHabit: (id: string) => void;
  onSaveTemplate: () => void;
  onUpdateReminderStatus: (id: string, status: ReminderStatus) => void;
}

export default function DailyView({ data, habits, dateKey, isToday, reminders, onDataChange, onAddHabitToTemplate, onAddHabitToDay, onDeleteHabit, onRenameHabit, onUpdateHabitUnit, onHideHabitForDay, onRemoveExtraHabit, onSaveTemplate, onUpdateReminderStatus }: Props) {
  const { colors } = useTheme();
  // Compute summary stats
  const { totalMinutes, namedActivities } = useMemo(() => {
    let totalMinutes = 0;
    let namedActivities = 0;
    for (const act of data.activities) {
      if (act.name) namedActivities++;
      if (act.from && act.to) {
        const [fh, fm] = act.from.split(':').map(Number);
        const [th, tm] = act.to.split(':').map(Number);
        const diff = (th * 60 + tm) - (fh * 60 + fm);
        if (diff > 0) totalMinutes += diff;
      }
    }
    return { totalMinutes, namedActivities };
  }, [data.activities]);

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;

  // Find total habit "value" minutes (habits with type='value' and unit containing 'min')
  const { habitMinutes, habitPages } = useMemo(() => {
    let mins = 0;
    let pages = 0;
    for (const h of habits) {
      if (h.habit_type === 'value') {
        const val = data.habit_values[h.id];
        if (typeof val === 'number') {
          const unit = (h.unit || 'min').toLowerCase();
          if (unit === 'pages' || unit === 'page') {
            pages += val;
          } else {
            mins += val;
          }
        }
      }
    }
    return { habitMinutes: mins, habitPages: pages };
  }, [habits, data.habit_values]);

  const handleAddActivity = useCallback((act: Omit<Activity, 'id'>) => {
    onDataChange({ activities: [...data.activities, { ...act, id: genId() }] });
  }, [data.activities, onDataChange]);

  const handleDeleteActivity = useCallback((id: string) => {
    onDataChange({ activities: data.activities.filter(a => a.id !== id) });
  }, [data.activities, onDataChange]);

  const handleToggleHabit = useCallback((id: string, value: boolean | number) => {
    onDataChange({ habit_values: { ...data.habit_values, [id]: value } });
  }, [data.habit_values, onDataChange]);

  return (
    <div>
      {/* Today's reminders + check-in */}
      {isToday && reminders.length > 0 && (
        <div
          className="rounded-xl p-6 mb-4"
          data-tour="tour-daily-reminders"
          style={{ background: 'linear-gradient(135deg, #1B2A4A 0%, #7B1C3E 100%)', boxShadow: '0 2px 12px rgba(27,42,74,0.18)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <PartyPopper size={16} color="#fff" />
            <span className="text-xs font-bold uppercase tracking-widest text-white">Today is the day!</span>
          </div>
          <p className="text-sm text-white/90 mb-4">Did you complete it? Was it successful?</p>
          <div className="space-y-2.5">
            {reminders.map(r => (
              <ReminderCheckin key={r.id} reminder={r} onUpdateStatus={onUpdateReminderStatus} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming reminders (not today) */}
      {!isToday && reminders.length > 0 && (
        <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={14} color={colors.accent} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>Reminders on this day</span>
          </div>
          <div className="space-y-2">
            {reminders.map(r => (
              <ReminderCheckin key={r.id} reminder={r} onUpdateStatus={onUpdateReminderStatus} />
            ))}
          </div>
        </div>
      )}

      {/* Quick Notes */}
      <div
        className="rounded-xl p-6 mb-4"
        data-tour="tour-notes"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
        <CardTitle>Quick Notes</CardTitle>
        <textarea
          value={data.top_note}
          onChange={e => onDataChange({ top_note: e.target.value })}
          placeholder="Jot down anything you don't want to forget today..."
          className="w-full rounded-lg p-3 text-sm outline-none resize-y"
          style={{
            minHeight: '64px',
            border: `1.5px solid ${colors.border}`,
            background: colors.bgInput,
            fontFamily: 'inherit',
            color: colors.textPrimary,
          }}
          onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
          onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
        />
      </div>

      {/* Daily Summary */}
      <div
        className="rounded-xl px-6 py-4 mb-4 flex flex-wrap items-center gap-8"
        data-tour="tour-summary"
        style={{
          background: 'linear-gradient(135deg, #1B2A4A 0%, #7B1C3E 100%)',
          boxShadow: '0 2px 12px rgba(27,42,74,0.18)',
        }}
      >
        <StatItem num={String(namedActivities)} label="Activities" />
        <StatItem num={`${totalH}h ${totalM}m`} label="Total Time" />
        {habitPages > 0 ? (
          <StatItem num={`${habitMinutes} min · ${habitPages} pg`} label="Habit Time" />
        ) : (
          <StatItem num={`${habitMinutes} min`} label="Habit Time" />
        )}
      </div>

      {/* Activities */}
      <ActivitySection
        activities={data.activities}
        dateKey={dateKey}
        onAdd={handleAddActivity}
        onDelete={handleDeleteActivity}
      />

      {/* Habits */}
      <HabitSection
        habits={habits}
        habitValues={data.habit_values}
        overrides={data.habit_overrides}
        onAddHabitToTemplate={onAddHabitToTemplate}
        onAddHabitToDay={onAddHabitToDay}
        onDeleteHabit={onDeleteHabit}
        onRenameHabit={onRenameHabit}
        onUpdateHabitUnit={onUpdateHabitUnit}
        onToggleHabit={handleToggleHabit}
        onHideHabitForDay={onHideHabitForDay}
        onRemoveExtraHabit={onRemoveExtraHabit}
        onSaveTemplate={onSaveTemplate}
      />
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <div className="flex items-center mb-3">
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
        {children}
      </span>
      <div className="flex-1 h-px ml-3" style={{ background: colors.accentLight }} />
    </div>
  );
}

function StatItem({ num, label }: { num: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-extrabold text-white leading-none">{num}</div>
      <div className="text-xs uppercase tracking-widest mt-1" style={{ color: 'rgba(255,255,255,0.70)' }}>
        {label}
      </div>
    </div>
  );
}

function ReminderCheckin({ reminder, onUpdateStatus }: { reminder: Reminder; onUpdateStatus: (id: string, status: ReminderStatus) => void }) {
  const statusLabel: Record<ReminderStatus, { label: string; color: string }> = {
    pending: { label: 'Pending', color: '#E8EBF4' },
    completed: { label: 'Completed', color: '#D1FAE5' },
    not_completed: { label: 'Not completed', color: '#FEE2E2' },
    postponed: { label: 'Postponed', color: '#FEF3C7' },
    cancelled: { label: 'Cancelled', color: '#F2F2F2' },
  };
  const meta = statusLabel[reminder.status];
  return (
    <div className="rounded-lg p-3" style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <p className="text-sm font-semibold text-white truncate min-w-0 flex-1">{reminder.title}</p>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ color: '#fff', background: meta.color === '#E8EBF4' ? '#1B2A4A' : 'transparent' }}>
          {meta.label}
        </span>
      </div>
      {reminder.note && <p className="text-xs text-white/70 mb-2">{reminder.note}</p>}
      <div className="flex flex-wrap gap-2">
        <CheckBtn onClick={() => onUpdateStatus(reminder.id, 'completed')} icon={<Check size={12} />} label="Completed" active={reminder.status === 'completed'} />
        <CheckBtn onClick={() => onUpdateStatus(reminder.id, 'not_completed')} icon={<X size={12} />} label="Not completed" active={reminder.status === 'not_completed'} />
        <CheckBtn onClick={() => onUpdateStatus(reminder.id, 'postponed')} icon={<RotateCcw size={12} />} label="Postponed" active={reminder.status === 'postponed'} />
        <CheckBtn onClick={() => onUpdateStatus(reminder.id, 'cancelled')} icon={<Ban size={12} />} label="Cancelled" active={reminder.status === 'cancelled'} />
      </div>
    </div>
  );
}

function CheckBtn({ onClick, icon, label, active }: { onClick: () => void; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
      style={{
        border: '1px solid rgba(255,255,255,0.3)',
        color: '#fff',
        background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {icon} {label}
    </button>
  );
}
