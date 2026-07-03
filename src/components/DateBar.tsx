import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarMode, ShDate, GregDate } from '../types';
import {
  SH_MONTHS, GREG_MONTH_NAMES, gregMonthDays,
  SH_WEEKDAYS_FULL, GREG_WEEKDAYS_FULL,
  shDayOfWeek, gregDayOfWeek,
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
  if (calMode === 'shamsi') {
    const daysInMonth = SH_MONTHS[shDate.month - 1].days;
    const weekday = SH_WEEKDAYS_FULL[shDayOfWeek(shDate.year, shDate.month, shDate.day)];

    return (
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl px-5 py-3 mb-5"
        data-tour="tour-datebar"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
      <div className="flex items-center gap-2" data-tour="tour-prev-next">
        <button
          onClick={onPrevDay}
          data-tour="tour-prev-day"
          className="flex items-center justify-center rounded-lg w-8 h-8 transition-colors"
          style={{ background: colors.bgHover, border: 'none', cursor: 'pointer', color: colors.textPrimary }}
          title="Previous day"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={onToday}
          data-tour="tour-today"
          className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide text-white transition-colors"
          style={{ background: '#7B1C3E' }}
        >
          Today
        </button>

        <button
          onClick={onNextDay}
          data-tour="tour-next-day"
          className="flex items-center justify-center rounded-lg w-8 h-8 transition-colors"
          style={{ background: colors.bgHover, border: 'none', cursor: 'pointer', color: colors.textPrimary }}
          title="Next day"
        >
          <ChevronRight size={16} />
        </button>
      </div>

        <select
          value={shDate.month}
          onChange={e => {
            const m = Number(e.target.value);
            const d = Math.min(shDate.day, SH_MONTHS[m - 1].days);
            onShDateChange({ ...shDate, month: m, day: d });
          }}
          className="border rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
        >
          {SH_MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m.name}</option>
          ))}
        </select>

        <select
          value={shDate.day}
          onChange={e => onShDateChange({ ...shDate, day: Number(e.target.value) })}
          className="border rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
          style={{ borderColor: colors.border, color: colors.textPrimary }}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <div className="ml-auto text-sm font-semibold" style={{ color: colors.textPrimary }}>
          <span style={{ color: colors.accent }}>{weekday}</span>
          {`, ${SH_MONTHS[shDate.month - 1].name} ${shDate.day}, ${shDate.year}`}
        </div>
      </div>
    );
  }

  // Gregorian mode
  const daysInMonth = gregMonthDays(gregDate.year, gregDate.month);
  const weekday = GREG_WEEKDAYS_FULL[gregDayOfWeek(gregDate.year, gregDate.month, gregDate.day)];

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-xl px-5 py-3 mb-5"
      data-tour="tour-datebar"
      style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
    >
      <div className="flex items-center gap-2" data-tour="tour-prev-next">
        <button
          onClick={onPrevDay}
          data-tour="tour-prev-day"
          className="flex items-center justify-center rounded-lg w-8 h-8 transition-colors"
          style={{ background: colors.bgHover, border: 'none', cursor: 'pointer', color: colors.textPrimary }}
          title="Previous day"
        >
          <ChevronLeft size={16} />
        </button>

        <button
          onClick={onToday}
          data-tour="tour-today"
          className="px-4 py-1.5 rounded-lg text-xs font-bold tracking-wide text-white transition-colors"
          style={{ background: '#7B1C3E' }}
        >
          Today
        </button>

        <button
          onClick={onNextDay}
          data-tour="tour-next-day"
          className="flex items-center justify-center rounded-lg w-8 h-8 transition-colors"
          style={{ background: colors.bgHover, border: 'none', cursor: 'pointer', color: colors.textPrimary }}
          title="Next day"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <select
        value={gregDate.year}
        onChange={e => {
          const y = Number(e.target.value);
          const d = Math.min(gregDate.day, gregMonthDays(y, gregDate.month));
          onGregDateChange({ year: y, month: gregDate.month, day: d });
        }}
        className="border rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
        style={{ borderColor: colors.border, color: colors.textPrimary }}
      >
        <option value={2026}>2026</option>
        <option value={2027}>2027</option>
      </select>

      <select
        value={gregDate.month}
        onChange={e => {
          const m = Number(e.target.value);
          const d = Math.min(gregDate.day, gregMonthDays(gregDate.year, m));
          onGregDateChange({ ...gregDate, month: m, day: d });
        }}
        className="border rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
        style={{ borderColor: colors.border, color: colors.textPrimary }}
      >
        {GREG_MONTH_NAMES.map((name, i) => (
          <option key={i} value={i + 1}>{name}</option>
        ))}
      </select>

      <select
        value={gregDate.day}
        onChange={e => onGregDateChange({ ...gregDate, day: Number(e.target.value) })}
        className="border rounded-lg px-3 py-1.5 text-xs outline-none cursor-pointer"
        style={{ borderColor: colors.border, color: colors.textPrimary }}
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      <div className="ml-auto text-sm font-semibold" style={{ color: colors.textPrimary }}>
        <span style={{ color: colors.accent }}>{weekday}</span>
        {`, ${GREG_MONTH_NAMES[gregDate.month - 1]} ${gregDate.day}, ${gregDate.year}`}
      </div>
    </div>
  );
}
