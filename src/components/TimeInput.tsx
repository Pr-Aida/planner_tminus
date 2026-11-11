import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Clock } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useTimeFormat, formatTimeForInput, type TimeFormat } from '../lib/timeFormat';

interface Props {
  value: string;
  onChange: (hhmm: string) => void;
  className?: string;
}

const ITEM_HEIGHT = 32;
const VISIBLE_ITEMS = 5;
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const pad = (n: number) => String(n).padStart(2, '0');

function splitHHmm(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { hour: h || 0, minute: m || 0 };
}

function nowHHmm(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hourOptions(fmt: TimeFormat): number[] {
  return fmt === '12h'
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : Array.from({ length: 24 }, (_, i) => i);
}

export default function TimeInput({ value, onChange, className = '', }: Props) {
  const { colors } = useTheme();
  const timeFormat = useTimeFormat();
  const [open, setOpen] = useState(false);
  const [openSeed, setOpenSeed] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const formatted = formatTimeForInput(value, timeFormat);
  const pickerValue = value || openSeed;
  const { hour: hour24, minute } = splitHHmm(pickerValue);
  const isPm = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent | TouchEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
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

  function clear() {
    onChange('');
    setOpen(false);
  }

  const columnStyle: CSSProperties = {
    border: `1px solid ${colors.borderLight}`,
    background: colors.bgInput,
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className="flex items-center rounded-lg px-3 gap-2"
        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
      >
        <span
          className="flex-1 min-w-0 text-sm py-2.5 truncate"
          style={{ color: value ? colors.textPrimary : colors.textTertiary }}
        >
          {formatted || (timeFormat === '24h' ? 'HH:mm' : 'h:mm AM')}
        </span>
        <button
          type="button"
          onClick={() => {
            setOpenSeed(value ? '' : nowHHmm());
            setOpen(o => !o);
          }}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="p-0.5 rounded transition-colors flex-shrink-0"
          style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: open ? colors.accent : colors.textTertiary }}
          title="Select time"
        >
          <Clock size={14} />
        </button>
        <Clock size={14} color={colors.textTertiary} className="flex-shrink-0" />
      </div>

      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-full mt-1 z-50 rounded-xl p-3 shadow-lg"
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
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={clear}
              className="flex-1 py-2 rounded-lg text-xs font-bold"
              style={{ background: colors.bgHover, color: colors.textPrimary, border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 py-2 rounded-lg text-xs font-bold text-white"
              style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
            >
              Done
            </button>
          </div>
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
    list.scrollTop = selectedIndex * ITEM_HEIGHT - ITEM_HEIGHT * 2;
  }, [selectedIndex]);

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: textColor, opacity: 0.6 }}>
        {label}
      </span>
      <div
        ref={listRef}
        className="w-14 overflow-y-auto rounded-lg"
        style={{ ...style, height: COLUMN_HEIGHT, scrollBehavior: 'smooth' }}
      >
        {options.map(o => {
          const active = o.value === selected;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSelect(o.value)}
              className="w-full flex items-center justify-center text-xs font-semibold rounded-md"
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
