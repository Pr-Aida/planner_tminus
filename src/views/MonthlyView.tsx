import { useState } from 'react';
import { ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import type { CalendarMode, DailyData, Habit, Reminder, ReminderOffset, ReminderStatus } from '../types';
import {
  SH_MONTHS, SH_WEEKDAYS_SHORT, shDayOfWeek, shDateKey, shDaysInMonth, todaySh,
  GREG_MONTH_NAMES, GREG_WEEKDAYS_SHORT,
  gregDayOfWeek, gregMonthDays, dateKey, todayGreg,
  monthKey as makeMonthKey,
} from '../lib/calendar';
import DayModal from '../components/DayModal';

interface Props {
  calMode: CalendarMode;
  // Lifted view-nav state (synced with parent for Today button)
  viewShYear: number;
  viewShMonth: number;
  viewGregYear: number;
  viewGregMonth: number;
  onViewShYearChange: (y: number) => void;
  onViewShMonthChange: (m: number) => void;
  onViewGregYearChange: (y: number) => void;
  onViewGregMonthChange: (m: number) => void;
  getDayData: (dateKeyStr: string) => DailyData;
  getDayNote: (dateKeyStr: string) => string;
  setDayNote: (dateKeyStr: string, note: string) => void;
  habits: Habit[];
  monthlyNote: string;
  onMonthlyNoteChange: (key: string, note: string) => void;
  // Reminders
  reminders: Reminder[];
  onAddReminder: (dateKeyStr: string, title: string, offset: ReminderOffset) => void;
  onUpdateReminderStatus: (id: string, status: ReminderStatus) => void;
  onDeleteReminder: (id: string) => void;
  timezone?: string;
}

interface ModalState {
  open: boolean;
  dateKeyStr: string;
  title: string;
}

export default function MonthlyView({
  calMode,
  viewShYear, viewShMonth, viewGregYear, viewGregMonth,
  onViewShYearChange, onViewShMonthChange, onViewGregYearChange, onViewGregMonthChange,
  getDayData, getDayNote, setDayNote,
  habits, monthlyNote, onMonthlyNoteChange,
  reminders, onAddReminder, onUpdateReminderStatus, onDeleteReminder,
  timezone,
}: Props) {
  const [modal, setModal] = useState<ModalState>({ open: false, dateKeyStr: '', title: '' });

  function openModal(dateKeyStr: string, title: string) {
    setModal({ open: true, dateKeyStr, title });
  }
  function closeModal() {
    setModal(m => ({ ...m, open: false }));
  }
  function saveModal(note: string) {
    setDayNote(modal.dateKeyStr, note);
    closeModal();
  }

  const modalReminders = reminders.filter(r => r.date_key === modal.dateKeyStr);

  if (calMode === 'shamsi') {
    return (
      <>
        <ShMonthly
          viewYear={viewShYear}
          viewMonth={viewShMonth}
          onPrev={() => {
            if (viewShMonth === 1) { onViewShYearChange(viewShYear - 1); onViewShMonthChange(12); }
            else onViewShMonthChange(viewShMonth - 1);
          }}
          onNext={() => {
            if (viewShMonth === 12) { onViewShYearChange(viewShYear + 1); onViewShMonthChange(1); }
            else onViewShMonthChange(viewShMonth + 1);
          }}
          getDayData={getDayData}
          getDayNote={getDayNote}
          habits={habits}
          onDayClick={openModal}
          monthlyNote={monthlyNote}
          onMonthlyNoteChange={note => onMonthlyNoteChange(makeMonthKey('shamsi', viewShYear, viewShMonth), note)}
          reminders={reminders}
          timezone={timezone}
        />
        <DayModal
          open={modal.open}
          title={modal.title}
          initialNote={getDayNote(modal.dateKeyStr)}
          onSave={saveModal}
          onClose={closeModal}
          reminders={modalReminders}
          onAddReminder={(title, offset) => onAddReminder(modal.dateKeyStr, title, offset)}
          onUpdateReminderStatus={onUpdateReminderStatus}
          onDeleteReminder={onDeleteReminder}
        />
      </>
    );
  }

  return (
    <>
      <GregMonthly
        viewYear={viewGregYear}
        viewMonth={viewGregMonth}
        onPrev={() => {
          if (viewGregMonth === 1) { onViewGregYearChange(viewGregYear - 1); onViewGregMonthChange(12); }
          else onViewGregMonthChange(viewGregMonth - 1);
        }}
        onNext={() => {
          if (viewGregMonth === 12) { onViewGregYearChange(viewGregYear + 1); onViewGregMonthChange(1); }
          else onViewGregMonthChange(viewGregMonth + 1);
        }}
        getDayData={getDayData}
        getDayNote={getDayNote}
        habits={habits}
        onDayClick={openModal}
        monthlyNote={monthlyNote}
        onMonthlyNoteChange={note => onMonthlyNoteChange(makeMonthKey('gregorian', viewGregYear, viewGregMonth), note)}
        reminders={reminders}
        timezone={timezone}
      />
      <DayModal
        open={modal.open}
        title={modal.title}
        initialNote={getDayNote(modal.dateKeyStr)}
        onSave={saveModal}
        onClose={closeModal}
        reminders={modalReminders}
        onAddReminder={(title, offset) => onAddReminder(modal.dateKeyStr, title, offset)}
        onUpdateReminderStatus={onUpdateReminderStatus}
        onDeleteReminder={onDeleteReminder}
      />
    </>
  );
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function reminderDot() {
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full"
      style={{ background: '#F5E6EC' }}
    >
      <Bell size={7} color="#7B1C3E" />
    </span>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return '#059669';
    case 'not_completed': return '#B91C1C';
    case 'postponed': return '#B45309';
    case 'cancelled': return '#6B6B6B';
    default: return '#7B1C3E';
  }
}

// ─── SHAMSI MONTHLY GRID ─────────────────────────────────────────────────────
interface ShMonthlyProps {
  viewYear: number;
  viewMonth: number;
  onPrev: () => void;
  onNext: () => void;
  getDayData: (key: string) => DailyData;
  getDayNote: (key: string) => string;
  habits: Habit[];
  onDayClick: (key: string, title: string) => void;
  monthlyNote: string;
  onMonthlyNoteChange: (note: string) => void;
  reminders: Reminder[];
  timezone?: string;
}

function ShMonthly({
  viewYear, viewMonth, onPrev, onNext, getDayData, getDayNote, habits, onDayClick,
  monthlyNote, onMonthlyNoteChange, reminders, timezone,
}: ShMonthlyProps) {
  const today = todaySh(timezone);
  const daysInMonth = shDaysInMonth(viewYear, viewMonth);
  const firstWD = shDayOfWeek(viewYear, viewMonth, 1);
  const cells: (number | null)[] = [
    ...Array(firstWD).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  return (
    <div>
      <div
        className="rounded-xl p-6 mb-4"
        data-tour="tour-monthly-reminders"
        style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onPrev} style={navBtnStyle}><ChevronLeft size={16} /></button>
          <span className="flex-1 text-center text-base font-bold" style={{ color: '#1B2A4A' }}>
            {SH_MONTHS[viewMonth - 1].name} {viewYear}
          </span>
          <button onClick={onNext} style={navBtnStyle}><ChevronRight size={16} /></button>
        </div>

        <div className="flex flex-wrap gap-4 mb-4">
          <Legend color="#253660" label="Habit (value)" />
          <Legend color="#4CAF50" label="Checkbox done" />
          <Legend color="#7B1C3E" label="Reminder" />
        </div>

        <div className="grid grid-cols-7 gap-1">
          {SH_WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-xs font-bold uppercase py-1" style={{ color: '#7B1C3E', letterSpacing: 1 }}>{wd}</div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} className="rounded-lg" style={{ minHeight: 70, background: '#F2F2F2' }} />;
            const key = shDateKey(viewYear, viewMonth, day);
            const data = getDayData(key);
            const note = getDayNote(key);
            const dayReminders = reminders.filter(r => r.date_key === key);
            const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
            const checkboxDone = habits.filter(h => h.habit_type === 'checkbox' && data.habit_values[h.id]).length;
            const valueDone = habits.filter(h => h.habit_type === 'value' && (data.habit_values[h.id] as number) > 0).length;

            return (
              <div
                key={idx}
                onClick={() => onDayClick(key, `${SH_MONTHS[viewMonth - 1].name} ${day}, ${viewYear} — Notes & Reminders`)}
                className="rounded-lg p-1.5 cursor-pointer transition-all"
                style={{ minHeight: 70, border: `1px solid ${isToday ? '#7B1C3E' : '#F2F2F2'}`, background: isToday ? '#F5E6EC' : '#fff' }}
                onMouseEnter={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.borderColor = '#7B1C3E'; }}
                onMouseLeave={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.borderColor = '#F2F2F2'; }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: isToday ? '#7B1C3E' : '#1B2A4A' }}>{day}</span>
                  {dayReminders.length > 0 && reminderDot()}
                </div>
                {note && (
                  <p className="text-xs leading-tight mt-0.5 line-clamp-2" style={{ color: '#6B6B6B', fontSize: '10px' }}>{note}</p>
                )}
                {dayReminders.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {dayReminders.slice(0, 2).map(r => (
                      <p key={r.id} className="text-xs leading-tight truncate" style={{ fontSize: '9px', color: statusColor(r.status) }}>
                        {r.title}
                      </p>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                  {Array(valueDone).fill(0).map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full block" style={{ background: '#253660' }} />)}
                  {Array(checkboxDone).fill(0).map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full block" style={{ background: '#4CAF50' }} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl p-6 mb-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
        <CardTitle>Monthly Notes</CardTitle>
        <textarea
          value={monthlyNote}
          onChange={e => onMonthlyNoteChange(e.target.value)}
          placeholder="Reflections, goals, highlights for this month..."
          className="w-full rounded-lg p-3 text-sm outline-none resize-y"
          style={{ minHeight: '90px', border: '1.5px solid #C8C8C8', background: '#F2F2F2', fontFamily: 'inherit', color: '#111' }}
          onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
        />
      </div>
    </div>
  );
}

// ─── GREGORIAN MONTHLY GRID ──────────────────────────────────────────────────
interface GregMonthlyProps {
  viewYear: number;
  viewMonth: number;
  onPrev: () => void;
  onNext: () => void;
  getDayData: (key: string) => DailyData;
  getDayNote: (key: string) => string;
  habits: Habit[];
  onDayClick: (key: string, title: string) => void;
  monthlyNote: string;
  onMonthlyNoteChange: (note: string) => void;
  reminders: Reminder[];
  timezone?: string;
}

function GregMonthly({
  viewYear, viewMonth, onPrev, onNext, getDayData, getDayNote, habits, onDayClick,
  monthlyNote, onMonthlyNoteChange, reminders, timezone,
}: GregMonthlyProps) {
  const today = todayGreg(timezone);
  const daysInMonth = gregMonthDays(viewYear, viewMonth);
  const firstWD = gregDayOfWeek(viewYear, viewMonth, 1);
  const cells: (number | null)[] = [
    ...Array(firstWD).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div
        className="rounded-xl p-6 mb-4"
        data-tour="tour-monthly-reminders"
        style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onPrev} style={navBtnStyle}><ChevronLeft size={16} /></button>
          <span className="flex-1 text-center text-base font-bold" style={{ color: '#1B2A4A' }}>
            {GREG_MONTH_NAMES[viewMonth - 1]} {viewYear}
          </span>
          <button onClick={onNext} style={navBtnStyle}><ChevronRight size={16} /></button>
        </div>

        <div className="flex flex-wrap gap-4 mb-4">
          <Legend color="#253660" label="Habit (value)" />
          <Legend color="#4CAF50" label="Checkbox done" />
          <Legend color="#7B1C3E" label="Reminder" />
        </div>

        <div className="grid grid-cols-7 gap-1">
          {GREG_WEEKDAYS_SHORT.map(wd => (
            <div key={wd} className="text-center text-xs font-bold uppercase py-1" style={{ color: '#7B1C3E', letterSpacing: 1 }}>{wd}</div>
          ))}
          {cells.map((day, idx) => {
            if (day === null) return <div key={idx} className="rounded-lg" style={{ minHeight: 70, background: '#F2F2F2' }} />;
            const key = dateKey({ year: viewYear, month: viewMonth, day });
            const data = getDayData(key);
            const note = getDayNote(key);
            const dayReminders = reminders.filter(r => r.date_key === key);
            const isToday = today.year === viewYear && today.month === viewMonth && today.day === day;
            const checkboxDone = habits.filter(h => h.habit_type === 'checkbox' && data.habit_values[h.id]).length;
            const valueDone = habits.filter(h => h.habit_type === 'value' && (data.habit_values[h.id] as number) > 0).length;

            return (
              <div
                key={idx}
                onClick={() => onDayClick(key, `${GREG_MONTH_NAMES[viewMonth - 1]} ${day}, ${viewYear} — Notes & Reminders`)}
                className="rounded-lg p-1.5 cursor-pointer transition-all"
                style={{ minHeight: 70, border: `1px solid ${isToday ? '#7B1C3E' : '#F2F2F2'}`, background: isToday ? '#F5E6EC' : '#fff' }}
                onMouseEnter={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.borderColor = '#7B1C3E'; }}
                onMouseLeave={e => { if (!isToday) (e.currentTarget as HTMLDivElement).style.borderColor = '#F2F2F2'; }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold" style={{ color: isToday ? '#7B1C3E' : '#1B2A4A' }}>{day}</span>
                  {dayReminders.length > 0 && reminderDot()}
                </div>
                {note && (
                  <p className="text-xs leading-tight mt-0.5 line-clamp-2" style={{ color: '#6B6B6B', fontSize: '10px' }}>{note}</p>
                )}
                {dayReminders.length > 0 && (
                  <div className="mt-0.5 space-y-0.5">
                    {dayReminders.slice(0, 2).map(r => (
                      <p key={r.id} className="text-xs leading-tight truncate" style={{ fontSize: '9px', color: statusColor(r.status) }}>{r.title}</p>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 mt-1 flex-wrap">
                  {Array(valueDone).fill(0).map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full block" style={{ background: '#253660' }} />)}
                  {Array(checkboxDone).fill(0).map((_, i) => <span key={i} className="w-1.5 h-1.5 rounded-full block" style={{ background: '#4CAF50' }} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl p-6 mb-4" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}>
        <CardTitle>Monthly Notes</CardTitle>
        <textarea
          value={monthlyNote}
          onChange={e => onMonthlyNoteChange(e.target.value)}
          placeholder="Reflections, goals, highlights for this month..."
          className="w-full rounded-lg p-3 text-sm outline-none resize-y"
          style={{ minHeight: '90px', border: '1.5px solid #C8C8C8', background: '#F2F2F2', fontFamily: 'inherit', color: '#111' }}
          onFocus={e => { e.target.style.borderColor = '#7B1C3E'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#C8C8C8'; e.target.style.background = '#F2F2F2'; }}
        />
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const navBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8, border: 'none',
  background: '#E8EBF4', color: '#1B2A4A', cursor: 'pointer',
};

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-full block" style={{ background: color }} />
      <span className="text-xs" style={{ color: '#6B6B6B' }}>{label}</span>
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center mb-3">
      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>{children}</span>
      <div className="flex-1 h-px ml-3" style={{ background: '#F5E6EC' }} />
    </div>
  );
}
