import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  SH_MONTHS, GREG_MONTH_NAMES,
  shToGregorian, gregorianToSh, dateKey, todaySh, todayGreg,
  shDaysInMonth, shDayOfWeek, gregDayOfWeek,
  SH_WEEKDAYS_SHORT, GREG_WEEKDAYS_SHORT,
} from '../lib/calendar';
import type { CalendarMode } from '../types';
import { formatProgressDate } from '../lib/progress';

export default function DatePicker({ value, calMode, onChange, onClear, colors }: {
  value: string | null;
  calMode: CalendarMode;
  onChange: (iso: string | null) => void;
  onClear?: () => void;
  colors: ReturnType<typeof import('../lib/theme')['useTheme']>['colors'];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const todayShDate = todaySh();
  const todayGregDate = todayGreg();

  // View state — the month currently displayed in the calendar
  const parsed = value ? { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) } : null;
  const parsedSh = parsed ? gregorianToSh(parsed) : null;

  const [viewYear, setViewYear] = useState(parsedSh?.year || todayShDate.year);
  const [viewMonth, setViewMonth] = useState(parsedSh?.month || todayShDate.month);
  const [viewGYear, setViewGYear] = useState(parsed?.year || todayGregDate.year);
  const [viewGMonth, setViewGMonth] = useState(parsed?.month || todayGregDate.month);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function selectSh(day: number) {
    const g = shToGregorian({ year: viewYear, month: viewMonth, day });
    onChange(dateKey(g));
    setOpen(false);
  }

  function selectGreg(day: number) {
    onChange(dateKey({ year: viewGYear, month: viewGMonth, day }));
    setOpen(false);
  }

  function prevMonth() {
    if (calMode === 'shamsi') {
      if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
      else setViewMonth(m => m - 1);
    } else {
      if (viewGMonth === 1) { setViewGMonth(12); setViewGYear(y => y - 1); }
      else setViewGMonth(m => m - 1);
    }
  }

  function nextMonth() {
    if (calMode === 'shamsi') {
      if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
      else setViewMonth(m => m + 1);
    } else {
      if (viewGMonth === 12) { setViewGMonth(1); setViewGYear(y => y + 1); }
      else setViewGMonth(m => m + 1);
    }
  }

  function goToday() {
    if (calMode === 'shamsi') {
      setViewYear(todayShDate.year);
      setViewMonth(todayShDate.month);
      const g = shToGregorian(todayShDate);
      onChange(dateKey(g));
    } else {
      setViewGYear(todayGregDate.year);
      setViewGMonth(todayGregDate.month);
      onChange(dateKey(todayGregDate));
    }
    setOpen(false);
  }

  const weekdays = calMode === 'shamsi' ? SH_WEEKDAYS_SHORT : GREG_WEEKDAYS_SHORT;
  const headerLabel = calMode === 'shamsi'
    ? `${SH_MONTHS[viewMonth - 1].name} ${viewYear}`
    : `${GREG_MONTH_NAMES[viewGMonth - 1]} ${viewGYear}`;

  // Build calendar grid
  let cells: { day: number; current: boolean; isToday: boolean; isSelected: boolean }[] = [];
  let onSelectDay: (d: number) => void;

  if (calMode === 'shamsi') {
    const firstDow = shDayOfWeek(viewYear, viewMonth, 1); // 0=Sat
    const daysInMonth = shDaysInMonth(viewYear, viewMonth);
    const selectedSh = parsedSh && parsedSh.year === viewYear && parsedSh.month === viewMonth ? parsedSh.day : -1;
    const isTodaySh = todayShDate.year === viewYear && todayShDate.month === viewMonth;
    for (let i = 0; i < firstDow; i++) cells.push({ day: 0, current: false, isToday: false, isSelected: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, current: true, isToday: isTodaySh && todayShDate.day === d, isSelected: d === selectedSh });
    }
    onSelectDay = selectSh;
  } else {
    const firstDow = gregDayOfWeek(viewGYear, viewGMonth, 1); // 0=Mon
    const daysInMonth = new Date(viewGYear, viewGMonth, 0).getDate();
    const selectedG = parsed && parsed.year === viewGYear && parsed.month === viewGMonth ? parsed.day : -1;
    const isTodayG = todayGregDate.year === viewGYear && todayGregDate.month === viewGMonth;
    for (let i = 0; i < firstDow; i++) cells.push({ day: 0, current: false, isToday: false, isSelected: false });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, current: true, isToday: isTodayG && todayGregDate.day === d, isSelected: d === selectedG });
    }
    onSelectDay = selectGreg;
  }

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 text-left rounded-lg px-3 py-2.5 text-sm outline-none flex items-center justify-between"
          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: value ? colors.textPrimary : colors.textTertiary }}>
          {value ? formatProgressDate(value, calMode) : 'Select date…'}
          <ChevronRight size={14} style={{ transform: 'rotate(90deg)', opacity: 0.5 }} />
        </button>
        {value && onClear && (
          <button
            type="button"
            onClick={() => { onChange(null); onClear(); }}
            className="p-2 rounded-lg transition-colors"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textTertiary, cursor: 'pointer' }}
            title="Clear date">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 mt-1 rounded-xl p-3"
          style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 8px 24px ${colors.shadow}` }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded transition-colors" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textSecondary }}>
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{headerLabel}</span>
            <button type="button" onClick={nextMonth} className="p-1 rounded transition-colors" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textSecondary }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headings */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdays.map((wd, i) => (
              <div key={i} className="text-center text-[10px] font-bold py-1" style={{ color: colors.textTertiary }}>{wd}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                disabled={!c.current}
                onClick={() => c.current && onSelectDay(c.day)}
                className="aspect-square rounded-lg text-xs flex items-center justify-center transition-all"
                style={{
                  border: 'none',
                  cursor: c.current ? 'pointer' : 'default',
                  background: c.isSelected ? colors.accent : c.isToday ? `${colors.accent}22` : 'transparent',
                  color: c.isSelected ? '#fff' : c.current ? colors.textPrimary : 'transparent',
                  fontWeight: c.isToday || c.isSelected ? 700 : 400,
                }}>
                {c.current ? c.day : ''}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
            <button type="button" onClick={goToday} className="text-[11px] font-semibold px-2 py-1 rounded" style={{ border: 'none', background: 'transparent', color: colors.accent, cursor: 'pointer' }}>
              Today
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold px-2 py-1 rounded" style={{ border: 'none', background: 'transparent', color: colors.textTertiary, cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
