import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { CalendarMode, ShDate, GregDate } from '../types';
import {
  SH_MONTHS, GREG_MONTH_NAMES,
  SH_WEEKDAYS_FULL, GREG_WEEKDAYS_FULL,
  shDayOfWeek, gregDayOfWeek,
  shDaysInMonth, gregMonthDays,
} from '../lib/calendar';
import { useTheme } from '../lib/theme';

interface Props {
  calMode: CalendarMode;
  shDate: ShDate;
  gregDate: GregDate;
  onShDateChange: (d: ShDate) => void;
  onGregDateChange: (d: GregDate) => void;
  onToday: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
}

export default function DateBar({
  calMode, shDate, gregDate,
  onShDateChange, onGregDateChange, onToday, onPrevDay, onNextDay,
}: Props) {
  const { colors } = useTheme();
  const isShamsi = calMode === 'shamsi';

  const [openMenu, setOpenMenu] = useState<'month' | 'day' | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const year = isShamsi ? shDate.year : gregDate.year;
  const month = isShamsi ? shDate.month : gregDate.month;
  const day = isShamsi ? shDate.day : gregDate.day;

  const daysInMonth = isShamsi
    ? shDaysInMonth(year, month)
    : gregMonthDays(year, month);

  const monthName = isShamsi
    ? SH_MONTHS[month - 1]?.name ?? ''
    : GREG_MONTH_NAMES[month - 1] ?? '';

  const weekdayIdx = isShamsi
    ? shDayOfWeek(shDate.year, shDate.month, shDate.day)
    : gregDayOfWeek(gregDate.year, gregDate.month, gregDate.day);
  const weekdayName = isShamsi
    ? SH_WEEKDAYS_FULL[weekdayIdx]
    : GREG_WEEKDAYS_FULL[weekdayIdx];

  function selectMonth(m: number) {
    const maxDay = isShamsi ? shDaysInMonth(year, m) : gregMonthDays(year, m);
    const clampedDay = Math.min(day, maxDay);
    if (isShamsi) onShDateChange({ year, month: m, day: clampedDay });
    else onGregDateChange({ year, month: m, day: clampedDay });
    setOpenMenu(null);
  }

  function selectDay(d: number) {
    if (isShamsi) onShDateChange({ year, month, day: d });
    else onGregDateChange({ year, month, day: d });
    setOpenMenu(null);
  }

  const monthList = isShamsi ? SH_MONTHS.map((m, i) => ({ value: i + 1, label: m.name })) : GREG_MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));
  const dayList = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const btnBase: React.CSSProperties = {
    background: colors.bgInput,
    border: `1px solid ${colors.borderLight}`,
    cursor: 'pointer',
    color: colors.textPrimary,
  };

  return (
    <div
      ref={barRef}
      className="flex flex-wrap items-center gap-2 mb-4 p-2 rounded-xl"
      style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: colors.shadow }}
      data-tour="tour-prev-next"
    >
      {/* Today button */}
      <button
        onClick={onToday}
        data-tour="tour-today"
        className="px-3 py-2 rounded-lg text-sm font-bold transition-opacity flex-shrink-0"
        style={{ background: colors.accent, color: '#fff', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        Today
      </button>

      {/* Previous arrow */}
      <button
        onClick={onPrevDay}
        aria-label="Previous"
        className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 transition-colors"
        style={btnBase}
        onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
        onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
      >
        <ChevronLeft size={18} color={colors.textPrimary} />
      </button>

      {/* Month dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setOpenMenu(openMenu === 'month' ? null : 'month')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={btnBase}
          onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
        >
          {monthName}
          <ChevronDown size={14} color={colors.textSecondary} />
        </button>
        {openMenu === 'month' && (
          <DropdownMenu colors={colors}>
            <div className="max-h-64 overflow-y-auto">
              {monthList.map(m => (
                <DropdownItem
                  key={m.value}
                  active={m.value === month}
                  colors={colors}
                  onClick={() => selectMonth(m.value)}
                >
                  {m.label}
                </DropdownItem>
              ))}
            </div>
          </DropdownMenu>
        )}
      </div>

      {/* Day dropdown */}
      <div className="relative flex-shrink-0">
        <button
          onClick={() => setOpenMenu(openMenu === 'day' ? null : 'day')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={btnBase}
          onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
        >
          {day}
          <ChevronDown size={14} color={colors.textSecondary} />
        </button>
        {openMenu === 'day' && (
          <DropdownMenu colors={colors}>
            <div className="grid grid-cols-7 gap-0.5 max-h-64 overflow-y-auto p-1">
              {dayList.map(d => (
                <button
                  key={d}
                  onClick={() => selectDay(d)}
                  className="flex items-center justify-center rounded-md text-xs font-semibold transition-colors"
                  style={{
                    width: 34, height: 34,
                    background: d === day ? colors.accent : 'transparent',
                    color: d === day ? '#fff' : colors.textPrimary,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (d !== day) e.currentTarget.style.background = colors.bgHover; }}
                  onMouseLeave={e => { if (d !== day) e.currentTarget.style.background = 'transparent'; }}
                >
                  {d}
                </button>
              ))}
            </div>
          </DropdownMenu>
        )}
      </div>

      {/* Next arrow */}
      <button
        onClick={onNextDay}
        aria-label="Next"
        className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 transition-colors"
        style={btnBase}
        onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
        onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
      >
        <ChevronRight size={18} color={colors.textPrimary} />
      </button>

      {/* Full selected date text — pushed to the right */}
      <div
        className="flex items-center gap-1.5 ml-auto text-sm md:text-base font-bold truncate"
        style={{ color: colors.textPrimary }}
      >
        {weekdayName}, {monthName} {day}, {year}
      </div>
    </div>
  );
}

function DropdownMenu({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <div
      className="absolute top-full mt-1 left-0 rounded-xl overflow-hidden"
      style={{
        background: colors.bgCard,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
        border: `1px solid ${colors.borderLight}`,
        minWidth: '160px',
        zIndex: 200,
      }}
    >
      {children}
    </div>
  );
}

function DropdownItem({ children, active, colors, onClick }: { children: React.ReactNode; active: boolean; colors: ReturnType<typeof useTheme>['colors']; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2 flex items-center justify-between text-sm font-semibold transition-colors"
      style={{
        background: active ? colors.accentLight : colors.bgCard,
        color: active ? colors.accent : colors.textPrimary,
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = colors.bgSubtle; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = colors.bgCard; }}
    >
      {children}
      {active && <Check size={14} color={colors.accent} />}
    </button>
  );
}
