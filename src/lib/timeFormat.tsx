import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type TimeFormat = '12h' | '24h';

// ─── Pure formatting helpers ──────────────────────────────────────────────────

export function formatTime(date: Date, fmt: TimeFormat = '12h'): string {
  return formatMinutes(date.getHours() * 60 + date.getMinutes(), fmt);
}

export function formatMinutes(min: number, fmt: TimeFormat = '12h'): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  if (fmt === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

// Storage format is always 24-hour HH:mm; this only converts for display and input.
export function formatTimeForInput(hhmm: string, fmt: TimeFormat = '12h'): string {
  if (!hhmm) return '';
  return formatMinutes(timeToMin(hhmm), fmt);
}

export function parseTime(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([aApP])?[mM]?$/);
  if (!match) return null;
  let h = Number(match[1]);
  const m = match[2] ? Number(match[2]) : 0;
  const period = match[3]?.toLowerCase();
  if (m > 59) return null;
  if (period) {
    if (h < 1 || h > 12) return null;
    if (period === 'a' && h === 12) h = 0;
    else if (period === 'p' && h !== 12) h += 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange(from: string, to: string, fmt: TimeFormat = '12h'): string {
  const fromMin = timeToMin(from);
  const toMin = timeToMin(to);
  return `${formatMinutes(fromMin, fmt)} – ${formatMinutes(toMin, fmt)}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface TimeFormatContextValue {
  timeFormat: TimeFormat;
  setTimeFormat: (fmt: TimeFormat) => void;
}

const TimeFormatContext = createContext<TimeFormatContextValue>({
  timeFormat: '12h',
  setTimeFormat: () => {},
});

export function TimeFormatProvider({ initial, children }: { initial: TimeFormat; children: ReactNode }) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(initial);
  useEffect(() => { setTimeFormat(initial); }, [initial]);
  return (
    <TimeFormatContext.Provider value={{ timeFormat, setTimeFormat }}>
      {children}
    </TimeFormatContext.Provider>
  );
}

export function useTimeFormat(): TimeFormat {
  return useContext(TimeFormatContext).timeFormat;
}

export function useTimeFormatSetter(): (fmt: TimeFormat) => void {
  return useContext(TimeFormatContext).setTimeFormat;
}

export function useTimeFormatValue(): { timeFormat: TimeFormat; setTimeFormat: (fmt: TimeFormat) => void } {
  return useContext(TimeFormatContext);
}
