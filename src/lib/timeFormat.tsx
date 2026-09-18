import { createContext, useContext, useState, type ReactNode } from 'react';

export type TimeFormat = '12h' | '24h';

// ─── Pure formatting helpers ──────────────────────────────────────────────────

export function formatTime(date: Date, fmt: TimeFormat = '12h'): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: fmt === '12h',
  });
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
