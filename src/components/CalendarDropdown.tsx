import { useState, useRef, useEffect } from 'react';
import { ChevronUp, ChevronDown, Check } from 'lucide-react';
import type { CalendarMode } from '../types';
import { todaySh } from '../lib/calendar';

interface Props {
  mode: CalendarMode;
  currentYear: number; // Gregorian year of currently selected date
  currentShYear?: number; // SH year to display (falls back to current SH year)
  onChange: (mode: CalendarMode) => void;
}

export function CalendarDropdown({ mode, currentYear, currentShYear, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const shYear = currentShYear ?? todaySh().year;
  const displayYear = mode === 'shamsi' ? shYear : currentYear;

  function select(m: CalendarMode) {
    onChange(m);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative select-none" data-tour="tour-calendar-switch">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 font-bold tracking-wide transition-opacity hover:opacity-80"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
          fontSize: '16px',
          padding: '4px 0',
        }}
      >
        <img src="/logo.svg" alt="PLAN1405 logo" className="h-7 w-7" style={{ flexShrink: 0 }} />
        <span>
          PLAN <span style={{ color: '#C8A0B0' }}>{displayYear}</span>
        </span>
        {open ? <ChevronUp size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full mt-2 rounded-xl overflow-hidden"
          style={{
            background: '#fff',
            boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
            minWidth: '240px',
            zIndex: 200,
            left: 0,
          }}
        >
          <DropOption
            title="Shamsi (Persian)"
            subtitle={`${shYear} — month names in Farsi-Latin`}
            selected={mode === 'shamsi'}
            onClick={() => select('shamsi')}
          />
          <div style={{ height: '1px', background: '#F2F2F2' }} />
          <DropOption
            title="Gregorian"
            subtitle="Standard month/day/year"
            selected={mode === 'gregorian'}
            onClick={() => select('gregorian')}
          />
        </div>
      )}
    </div>
  );
}

interface OptionProps {
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}

function DropOption({ title, subtitle, selected, onClick }: OptionProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-3.5 flex items-start justify-between gap-3 transition-colors"
      style={{
        background: selected ? '#F5E6EC' : '#fff',
        border: 'none',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#F8F9FC'; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
    >
      <div>
        <div
          className="text-sm font-bold mb-0.5"
          style={{ color: selected ? '#7B1C3E' : '#1B2A4A' }}
        >
          {title}
        </div>
        <div className="text-xs" style={{ color: selected ? '#A0274F' : '#6B6B6B' }}>
          {subtitle}
        </div>
      </div>
      {selected && <Check size={16} color="#7B1C3E" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />}
    </button>
  );
}
