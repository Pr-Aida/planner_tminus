import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import type { CalendarMode, ShDate, GregDate } from '../types';
import { SH_MONTHS, GREG_MONTH_NAMES, SH_WEEKDAYS_FULL, GREG_WEEKDAYS_FULL, shDayOfWeek, gregDayOfWeek } from '../lib/calendar';
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
  onToday, onPrevDay, onNextDay,
}: Props) {
  const { colors } = useTheme();
  const isShamsi = calMode === 'shamsi';

  const displayMonth = isShamsi
    ? SH_MONTHS[shDate.month - 1]?.name ?? ''
    : GREG_MONTH_NAMES[gregDate.month - 1] ?? '';

  const weekday = isShamsi
    ? SH_WEEKDAYS_FULL[shDayOfWeek(shDate.year, shDate.month, shDate.day)]
    : GREG_WEEKDAYS_FULL[gregDayOfWeek(gregDate.year, gregDate.month, gregDate.day)];

  const dayNum = isShamsi ? shDate.day : gregDate.day;
  const yearNum = isShamsi ? shDate.year : gregDate.year;

  return (
    <div
      className="flex items-center justify-between gap-2 mb-4"
      data-tour="tour-prev-next"
    >
      {/* Prev / Next */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrevDay}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 36, height: 36,
            background: colors.bgCard,
            border: `1px solid ${colors.borderLight}`,
            cursor: 'pointer',
            color: colors.textPrimary,
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = colors.bgCard}
          title="Previous day"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onNextDay}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 36, height: 36,
            background: colors.bgCard,
            border: `1px solid ${colors.borderLight}`,
            cursor: 'pointer',
            color: colors.textPrimary,
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
          onMouseLeave={e => e.currentTarget.style.background = colors.bgCard}
          title="Next day"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Date display */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
        <Calendar size={16} color={colors.textSecondary} style={{ flexShrink: 0 }} />
        <span
          className="text-sm md:text-base font-bold truncate"
          style={{ color: colors.textPrimary }}
        >
          {weekday}, {displayMonth} {dayNum} {yearNum}
        </span>
      </div>

      {/* Today button */}
      <button
        onClick={onToday}
        data-tour="tour-today"
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background: colors.accent,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        Today
      </button>
    </div>
  );
}
