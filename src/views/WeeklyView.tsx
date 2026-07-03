import React, { useState, useMemo } from 'react';
import WeeklyChart from '../components/WeeklyChart';
import { useTheme } from '../lib/theme';
import type { CalendarMode, DailyData, Habit, ShDate, GregDate } from '../types';
import {
  SH_MONTHS, SH_WEEKDAYS_SHORT, shDayOfWeek, shDateKey,
  GREG_MONTH_NAMES, GREG_WEEKDAYS_SHORT, gregDayOfWeek, gregMonthDays, dateKey,
} from '../lib/calendar';

interface Props {
  calMode: CalendarMode;
  shDate: ShDate;
  gregDate: GregDate;
  getDayData: (dateKeyStr: string) => DailyData;
  habits: Habit[];
  weeklyNote: string;
  onWeeklyNoteChange: (note: string) => void;
}

interface Week {
  label: string;
  days: { label: string; dateKeyStr: string }[];
}

function buildShWeeks(year: number, month: number): Week[] {
  const daysInMonth = SH_MONTHS[month - 1].days;
  const weeks: Week[] = [];
  let d = 1;
  let weekNum = 1;
  while (d <= daysInMonth) {
    const wd = shDayOfWeek(year, month, d);
    const end = Math.min(daysInMonth, d + (6 - wd));
    const days = [];
    for (let day = d; day <= end; day++) {
      days.push({
        label: SH_WEEKDAYS_SHORT[shDayOfWeek(year, month, day)] + ' ' + day,
        dateKeyStr: shDateKey(year, month, day),
      });
    }
    weeks.push({ label: `Week ${weekNum} (${d}–${end})`, days });
    d = end + 1;
    weekNum++;
  }
  return weeks;
}

function buildGregWeeks(year: number, month: number): Week[] {
  const daysInMonth = gregMonthDays(year, month);
  const weeks: Week[] = [];
  let d = 1;
  let weekNum = 1;
  while (d <= daysInMonth) {
    const wd = gregDayOfWeek(year, month, d);
    const end = Math.min(daysInMonth, d + (6 - wd));
    const days = [];
    for (let day = d; day <= end; day++) {
      days.push({
        label: GREG_WEEKDAYS_SHORT[gregDayOfWeek(year, month, day)] + ' ' + day,
        dateKeyStr: dateKey({ year, month, day }),
      });
    }
    weeks.push({ label: `Week ${weekNum} (${d}–${end})`, days });
    d = end + 1;
    weekNum++;
  }
  return weeks;
}

function currentWeekIdx(weeks: Week[], selectedKey: string): number {
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].days.some(d => d.dateKeyStr === selectedKey)) return i;
  }
  return 0;
}

export default function WeeklyView({
  calMode, shDate, gregDate, getDayData, habits, weeklyNote, onWeeklyNoteChange,
}: Props) {
  const { colors } = useTheme();
  const weeks = useMemo(() => {
    return calMode === 'shamsi'
      ? buildShWeeks(shDate.year, shDate.month)
      : buildGregWeeks(gregDate.year, gregDate.month);
  }, [calMode, shDate.year, shDate.month, gregDate.year, gregDate.month]);

  const selectedKey = calMode === 'shamsi'
    ? shDateKey(shDate.year, shDate.month, shDate.day)
    : dateKey(gregDate);

  const [activeWeek, setActiveWeek] = useState(() => currentWeekIdx(weeks, selectedKey));

  // Recompute active week when mode/date changes
  React.useEffect(() => {
    setActiveWeek(currentWeekIdx(weeks, selectedKey));
  }, [weeks, selectedKey]);

  const chartData = useMemo(() => {
    if (!weeks[activeWeek]) return [];
    return weeks[activeWeek].days.map(({ label, dateKeyStr }) => {
      const d = getDayData(dateKeyStr);
      let actMin = 0;
      for (const act of d.activities) {
        if (act.from && act.to) {
          const [fh, fm] = act.from.split(':').map(Number);
          const [th, tm] = act.to.split(':').map(Number);
          const diff = (th * 60 + tm) - (fh * 60 + fm);
          if (diff > 0) actMin += diff;
        }
      }
      let habitMin = 0;
      for (const h of habits) {
        if (h.habit_type === 'value') {
          const val = d.habit_values[h.id];
          if (typeof val === 'number') habitMin += val;
        }
      }
      return {
        label,
        activityHours: +(actMin / 60).toFixed(2),
        habitHours: +(habitMin / 60).toFixed(2),
      };
    });
  }, [weeks, activeWeek, getDayData, habits]);

  // Keyword cloud
  const keywords = useMemo(() => {
    if (!weeks[activeWeek]) return [];
    const freq: Record<string, number> = {};
    for (const { dateKeyStr } of weeks[activeWeek].days) {
      const d = getDayData(dateKeyStr);
      const text = [
        ...d.activities.map(a => `${a.name} ${a.note}`),
        d.top_note,
      ].join(' ');
      text.toLowerCase().split(/\s+/).forEach(w => {
        const clean = w.replace(/[^a-z0-9]/gi, '');
        if (clean.length > 2) freq[clean] = (freq[clean] || 0) + 1;
      });
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
  }, [weeks, activeWeek, getDayData]);

  const monthLabel = calMode === 'shamsi'
    ? `${SH_MONTHS[shDate.month - 1].name} ${shDate.year}`
    : `${GREG_MONTH_NAMES[gregDate.month - 1]} ${gregDate.year}`;

  return (
    <div>
      {/* Weekly Notes */}
      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
        <CardTitle>Weekly Notes</CardTitle>
        <textarea
          value={weeklyNote}
          onChange={e => onWeeklyNoteChange(e.target.value)}
          placeholder="Goals, reminders, anything for this week..."
          className="w-full rounded-lg p-3 text-sm outline-none resize-y"
          style={{
            minHeight: '60px',
            border: `1.5px solid ${colors.border}`,
            background: colors.bgInput,
            fontFamily: 'inherit',
            color: colors.textPrimary,
          }}
          onFocus={e => { e.target.style.borderColor = colors.accent; e.target.style.background = colors.bgCard; }}
          onBlur={e => { e.target.style.borderColor = colors.border; e.target.style.background = colors.bgInput; }}
        />
      </div>

      {/* Week Selector */}
      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
        <CardTitle>Select Week — {monthLabel}</CardTitle>
        <div className="flex flex-wrap gap-2">
          {weeks.map((w, i) => (
            <button
              key={i}
              onClick={() => setActiveWeek(i)}
              className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: activeWeek === i ? colors.accent : colors.bgHover,
                color: activeWeek === i ? colors.bgCard : colors.textPrimary,
                border: `1.5px solid ${activeWeek === i ? colors.accent : 'transparent'}`,
                cursor: 'pointer',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
        <CardTitle>This Week's Keywords</CardTitle>
        <div
          className="flex flex-wrap gap-2 rounded-lg p-3 min-h-10"
          style={{ background: colors.bgHover }}
        >
          {keywords.length === 0 ? (
            <span className="text-xs" style={{ color: colors.textSecondary }}>
              Add activities to see keywords…
            </span>
          ) : keywords.map(([word, count], i) => {
            const max = keywords[0][1];
            const cls = count >= max * 0.7 ? colors.accent : count >= max * 0.4 ? '#B8860B' : colors.textPrimary;
            return (
              <span
                key={i}
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ background: cls }}
              >
                {word}{count > 1 ? ` ×${count}` : ''}
              </span>
            );
          })}
        </div>
      </div>

      {/* Chart */}
      <div
        className="rounded-xl p-6 mb-4"
        style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
      >
        <CardTitle>Weekly Overview</CardTitle>
        {chartData.length > 0 ? (
          <WeeklyChart data={chartData} />
        ) : (
          <p className="text-xs" style={{ color: colors.textSecondary }}>No data for this week.</p>
        )}
      </div>
    </div>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <div className="flex items-center mb-4 gap-2">
      <span className="text-xs font-bold uppercase tracking-widest min-w-0 truncate" style={{ color: colors.accent }}>
        {children}
      </span>
      <div className="flex-1 h-px flex-shrink-0" style={{ background: colors.accentLight }} />
    </div>
  );
}
