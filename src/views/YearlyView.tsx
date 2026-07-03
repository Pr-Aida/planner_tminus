import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { useTheme } from '../lib/theme';
import type { CalendarMode, Reminder, ShDate, GregDate } from '../types';
import {
  SH_MONTHS, SH_WEEKDAYS_SHORT, shDayOfWeek, shDateKey, shDaysInMonth, todaySh,
  GREG_MONTH_NAMES, GREG_WEEKDAYS_SHORT,
  gregDayOfWeek, gregMonthDays, dateKey, todayGreg,
} from '../lib/calendar';

interface Props {
  calMode: CalendarMode;
  viewShYear: number;
  viewGregYear: number;
  onViewShYearChange: (y: number) => void;
  onViewGregYearChange: (y: number) => void;
  reminders: Reminder[];
  onPickMonth: (month: number, mode: 'daily' | 'monthly') => void;
  timezone?: string;
  selectedShDate?: ShDate;
  selectedGregDate?: GregDate;
}

export default function YearlyView({
  calMode, viewShYear, viewGregYear,
  onViewShYearChange, onViewGregYearChange, reminders, onPickMonth, timezone,
  selectedShDate, selectedGregDate,
}: Props) {
  if (calMode === 'shamsi') {
    return (
      <ShYearly
        viewYear={viewShYear}
        onPrev={() => onViewShYearChange(viewShYear - 1)}
        onNext={() => onViewShYearChange(viewShYear + 1)}
        today={todaySh(timezone)}
        reminders={reminders}
        onPickMonth={m => onPickMonth(m, 'monthly')}
        selectedDate={selectedShDate}
      />
    );
  }

  return (
    <GregYearly
      viewYear={viewGregYear}
      onPrev={() => onViewGregYearChange(viewGregYear - 1)}
      onNext={() => onViewGregYearChange(viewGregYear + 1)}
      today={todayGreg(timezone)}
      reminders={reminders}
      onPickMonth={m => onPickMonth(m, 'monthly')}
      selectedDate={selectedGregDate}
    />
  );
}

// ─── SHAMSI YEARLY ─────────────────────────────────────────────────────────
interface ShYearlyProps {
  viewYear: number;
  onPrev: () => void;
  onNext: () => void;
  today: ShDate;
  reminders: Reminder[];
  onPickMonth: (month: number) => void;
  selectedDate?: ShDate;
}

function ShYearly({ viewYear, onPrev, onNext, today, reminders, onPickMonth, selectedDate }: ShYearlyProps) {
  const { colors } = useTheme();
  const reminderKeys = new Set(reminders.map(r => r.date_key));
  const selectedMonthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDate && selectedDate.year === viewYear && selectedMonthRef.current) {
      selectedMonthRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedDate, viewYear]);

  return (
    <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onPrev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: colors.bgHover, color: colors.textPrimary, cursor: 'pointer' }}><ChevronLeft size={16} /></button>
        <span className="flex-1 text-center text-base font-bold" style={{ color: colors.textPrimary }}>
          {viewYear} — Solar Hijri Year
        </span>
        <button onClick={onNext} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: colors.bgHover, color: colors.textPrimary, cursor: 'pointer' }}><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SH_MONTHS.map((m, mi) => {
          const monthIdx = mi + 1;
          const days = shDaysInMonth(viewYear, monthIdx);
          const firstWD = shDayOfWeek(viewYear, monthIdx, 1);
          const cells: (number | null)[] = [
            ...Array(firstWD).fill(null),
            ...Array.from({ length: days }, (_, i) => i + 1),
          ];
          const isCurrentMonth = today.year === viewYear && today.month === monthIdx;

          return (
            <button
              key={mi}
              ref={selectedDate && selectedDate.month === monthIdx ? selectedMonthRef : undefined}
              onClick={() => onPickMonth(monthIdx)}
              className="rounded-lg p-3 text-left transition-all"
              data-tour={mi === 0 ? 'tour-year-grid' : undefined}
              style={{
                border: `1.5px solid ${isCurrentMonth ? colors.accent : colors.borderLight}`,
                background: isCurrentMonth ? colors.accentLight : colors.bgSubtle,
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isCurrentMonth) (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accent; }}
              onMouseLeave={e => { if (!isCurrentMonth) (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderLight; }}
            >
              <p className="text-xs font-bold mb-2" style={{ color: isCurrentMonth ? colors.accent : colors.textPrimary }}>
                {m.name}
              </p>
              <div className="grid grid-cols-7 gap-0.5">
                {SH_WEEKDAYS_SHORT.map(wd => (
                  <div key={wd} className="text-center" style={{ fontSize: 8, color: colors.textSecondary, fontWeight: 700 }}>{wd}</div>
                ))}
                {cells.map((day, ci) => {
                  if (day === null) return <div key={ci} style={{ minHeight: 14 }} />;
                  const dk = shDateKey(viewYear, monthIdx, day);
                  const hasReminder = reminderKeys.has(dk);
                  const isToday = isCurrentMonth && today.day === day;
                  const isSelected = selectedDate && selectedDate.year === viewYear && selectedDate.month === monthIdx + 1 && selectedDate.day === day;
                  return (
                    <div key={ci} className="text-center relative" style={{ minHeight: 14, borderRadius: 3, background: isSelected ? colors.selectedBg : 'transparent' }}>
                      <span style={{ fontSize: 9, color: isToday ? colors.accent : isSelected ? colors.burgundy : colors.textSecondary, fontWeight: isToday || isSelected ? 700 : 400 }}>{day}</span>
                      {hasReminder && (
                        <span className="absolute" style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: colors.accent }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── GREGORIAN YEARLY ──────────────────────────────────────────────────────
interface GregYearlyProps {
  viewYear: number;
  onPrev: () => void;
  onNext: () => void;
  today: GregDate;
  reminders: Reminder[];
  onPickMonth: (month: number) => void;
  selectedDate?: GregDate;
}

function GregYearly({ viewYear, onPrev, onNext, today, reminders, onPickMonth, selectedDate }: GregYearlyProps) {
  const { colors } = useTheme();
  const reminderKeys = new Set(reminders.map(r => r.date_key));
  const selectedMonthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedDate && selectedDate.year === viewYear && selectedMonthRef.current) {
      selectedMonthRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedDate, viewYear]);

  return (
    <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onPrev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: colors.bgHover, color: colors.textPrimary, cursor: 'pointer' }}><ChevronLeft size={16} /></button>
        <span className="flex-1 text-center text-base font-bold" style={{ color: colors.textPrimary }}>{viewYear}</span>
        <button onClick={onNext} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: 'none', background: colors.bgHover, color: colors.textPrimary, cursor: 'pointer' }}><ChevronRight size={16} /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GREG_MONTH_NAMES.map((name, mi) => {
          const monthIdx = mi + 1;
          const days = gregMonthDays(viewYear, monthIdx);
          const firstWD = gregDayOfWeek(viewYear, monthIdx, 1);
          const cells: (number | null)[] = [
            ...Array(firstWD).fill(null),
            ...Array.from({ length: days }, (_, i) => i + 1),
          ];
          const isCurrentMonth = today.year === viewYear && today.month === monthIdx;

          return (
            <button
              key={mi}
              ref={selectedDate && selectedDate.month === monthIdx ? selectedMonthRef : undefined}
              onClick={() => onPickMonth(monthIdx)}
              className="rounded-lg p-3 text-left transition-all"
              data-tour={mi === 0 ? 'tour-year-grid' : undefined}
              style={{
                border: `1.5px solid ${isCurrentMonth ? colors.accent : colors.borderLight}`,
                background: isCurrentMonth ? colors.accentLight : colors.bgSubtle,
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isCurrentMonth) (e.currentTarget as HTMLButtonElement).style.borderColor = colors.accent; }}
              onMouseLeave={e => { if (!isCurrentMonth) (e.currentTarget as HTMLButtonElement).style.borderColor = colors.borderLight; }}
            >
              <p className="text-xs font-bold mb-2" style={{ color: isCurrentMonth ? colors.accent : colors.textPrimary }}>{name}</p>
              <div className="grid grid-cols-7 gap-0.5">
                {GREG_WEEKDAYS_SHORT.map(wd => (
                  <div key={wd} className="text-center" style={{ fontSize: 8, color: colors.textSecondary, fontWeight: 700 }}>{wd}</div>
                ))}
                {cells.map((day, ci) => {
                  if (day === null) return <div key={ci} style={{ minHeight: 14 }} />;
                  const dk = dateKey({ year: viewYear, month: monthIdx, day });
                  const hasReminder = reminderKeys.has(dk);
                  const isToday = isCurrentMonth && today.day === day;
                  const isSelected = selectedDate && selectedDate.year === viewYear && selectedDate.month === monthIdx + 1 && selectedDate.day === day;
                  return (
                    <div key={ci} className="text-center relative" style={{ minHeight: 14, borderRadius: 3, background: isSelected ? colors.selectedBg : 'transparent' }}>
                      <span style={{ fontSize: 9, color: isToday ? colors.accent : isSelected ? colors.burgundy : colors.textSecondary, fontWeight: isToday || isSelected ? 700 : 400 }}>{day}</span>
                      {hasReminder && (
                        <span className="absolute" style={{ bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: colors.accent }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
