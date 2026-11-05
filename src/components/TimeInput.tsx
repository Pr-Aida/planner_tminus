import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useTimeFormat, formatTimeForInput, type TimeFormat } from '../lib/timeFormat';

interface Props {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
  showIcon?: boolean;
}

const DEFAULT_TIME = '08:00';
const ITEM_HEIGHT = 36;
const COLUMN_HEIGHT = ITEM_HEIGHT * 5;

const pad = (n: number) => String(n).padStart(2, '0');

function splitHHmm(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h, minute: m };
}

function hourOptions(fmt: TimeFormat): number[] {
  return fmt === '12h'
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);
}

export default function TimeInput({ value, onChange, className = '', showIcon = true }: Props) {
  const { colors } = useTheme();
  const timeFormat = useTimeFormat();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const formatted = formatTimeForInput(value, timeFormat);
  const { hour: hour24, minute } = splitHHmm(value || DEFAULT_TIME);
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function setHour(h: number) {
    const h24 = timeFormat === '12h' ? (h % 12) + (isPm ? 12 : 0) : h;
    onChange(`${pad(h24)}:${pad(minute)}`);
  }

  function setMinute(m: number) {
    onChange(`${pad(hour24)}:${pad(m)}`);
  }

  function setPeriod(pm: boolean) {
    onChange(`${pad((hour12 % 12) + (pm ? 12 : 0))}:${pad(minute)}`);
  }

  const columnStyle = { border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left"
        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, cursor: 'pointer' }}
      >
        <span
          className="flex-1 min-w-0 text-sm truncate"
          style={{ color: value ? colors.textPrimary : colors.textTertiary }}
        >
          {formatted || (timeFormat === '24h' ? 'HH:mm' : 'h:mm AM')}
        </span>
        {showIcon && <Clock size={14} color={colors.textTertiary} />}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full mt-2 z-50 rounded-xl p-3 shadow-lg"
          style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, width: 'max-content' }}
        >
          <div className="flex gap-2">
            <ScrollColumn
              label="Hour"
              options={hourOptions(timeFormat).map(h => ({ value: h, label: pad(h) }))}
              selected={timeFormat === '12h' ? hour12 : hour24}
              onSelect={setHour}
              style={columnStyle}
              accent={colors.accent}
              textColor={colors.textPrimary}
            />
            <ScrollColumn
              label="Minute"
              options={Array.from({ length: 60 }, (_, m) => ({ value: m, label: pad(m) }))}
              selected={minute}
              onSelect={setMinute}
              style={columnStyle}
              accent={colors.accent}
              textColor={colors.textPrimary}
            />
            {timeFormat === '12h' && (
              <ScrollColumn
                label="AM / PM"
                options={[
                  { value: 0, label: 'AM' },
                  { value: 1, label: 'PM' },
                ]}
                selected={isPm ? 1 : 0}
                onSelect={v => setPeriod(v === 1)}
                style={columnStyle}
                accent={colors.accent}
                textColor={colors.textPrimary}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white"
            style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

interface ScrollColumnProps {
  label: string;
  options: { value: number; label: string }[];
  selected: number;
  onSelect: (value: number) => void;
  style: CSSProperties;
  accent: string;
  textColor: string;
}

function ScrollColumn({ label, options, selected, onSelect, style, accent, textColor }: ScrollColumnProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedIndex = options.findIndex(o => o.value === selected);

  useEffect(() => {
    const list = listRef.current;
    if (!list || selectedIndex < 0) return;
    list.scrollTop = selectedIndex * ITEM_HEIGHT - COLUMN_HEIGHT / 2 + ITEM_HEIGHT / 2;
  }, [selectedIndex]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textColor, opacity: 0.6 }}>
        {label}
      </span>
      <div
        ref={listRef}
        className="w-16 overflow-y-auto rounded-lg py-2"
        style={{ ...style, height: COLUMN_HEIGHT + 16 }}
      >
        {options.map(o => {
          const active = o.value === selected;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSelect(o.value)}
              className="w-full flex items-center justify-center text-sm font-semibold rounded-md"
              style={{
                height: ITEM_HEIGHT,
                background: active ? accent : 'transparent',
                color: active ? '#fff' : textColor,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
