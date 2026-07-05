import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDropdown } from './CalendarDropdown';
import CountdownBar from './CountdownBar';
import { Sparkles, X, Plus, Clock, Check, Users, Menu } from 'lucide-react';
import type { CalendarMode, ViewMode } from '../types';
import { TIMEZONES } from '../types';
import type { CountdownConfig } from './CountdownBar';
import { useTheme } from '../lib/theme';

// ─── Clock settings shape passed from App ────────────────────────────────────
export interface ClockSettings {
  clock1_tz: string;       // 'auto' = use profile timezone_pref
  clock1_label: string;
  clock1_visible: boolean;
  clock2_tz: string;
  clock2_label: string;
  clock2_visible: boolean;
}

// ─── Timezone display labels: "City, Country" + searchable aliases ──────────────
// Keys are IANA timezone IDs (must exist in TIMEZONES or be Intl-valid).
// `country` powers the "City, Country" label; `aliases` covers common names
// (e.g. "Iran", "UK", "UAE", "GMT") so search works intuitively.
interface TZMeta { city: string; country: string; aliases?: string[] }
const TZ_LABELS: Record<string, TZMeta> = {
  'UTC': { city: 'UTC', country: 'GMT', aliases: ['gmt', 'utc', 'universal', 'coordinated'] },
  'Africa/Cairo': { city: 'Cairo', country: 'Egypt', aliases: ['egypt'] },
  'Africa/Lagos': { city: 'Lagos', country: 'Nigeria', aliases: ['nigeria'] },
  'Africa/Nairobi': { city: 'Nairobi', country: 'Kenya', aliases: ['kenya'] },
  'America/Anchorage': { city: 'Anchorage', country: 'United States', aliases: ['alaska'] },
  'America/Argentina/Buenos_Aires': { city: 'Buenos Aires', country: 'Argentina', aliases: ['argentina'] },
  'America/Bogota': { city: 'Bogotá', country: 'Colombia', aliases: ['colombia'] },
  'America/Chicago': { city: 'Chicago', country: 'United States' },
  'America/Denver': { city: 'Denver', country: 'United States' },
  'America/Halifax': { city: 'Halifax', country: 'Canada' },
  'America/Lima': { city: 'Lima', country: 'Peru', aliases: ['peru'] },
  'America/Los_Angeles': { city: 'Los Angeles', country: 'United States', aliases: ['la'] },
  'America/Mexico_City': { city: 'Mexico City', country: 'Mexico', aliases: ['mexico'] },
  'America/New_York': { city: 'New York', country: 'United States' },
  'America/Phoenix': { city: 'Phoenix', country: 'United States' },
  'America/Santiago': { city: 'Santiago', country: 'Chile', aliases: ['chile'] },
  'America/Sao_Paulo': { city: 'São Paulo', country: 'Brazil', aliases: ['brazil'] },
  'America/Toronto': { city: 'Toronto', country: 'Canada' },
  'America/Vancouver': { city: 'Vancouver', country: 'Canada' },
  'Asia/Almaty': { city: 'Almaty', country: 'Kazakhstan', aliases: ['kazakhstan'] },
  'Asia/Baghdad': { city: 'Baghdad', country: 'Iraq', aliases: ['iraq'] },
  'Asia/Baku': { city: 'Baku', country: 'Azerbaijan', aliases: ['azerbaijan'] },
  'Asia/Bangkok': { city: 'Bangkok', country: 'Thailand', aliases: ['thailand'] },
  'Asia/Colombo': { city: 'Colombo', country: 'Sri Lanka', aliases: ['sri lanka'] },
  'Asia/Dhaka': { city: 'Dhaka', country: 'Bangladesh', aliases: ['bangladesh'] },
  'Asia/Dubai': { city: 'Dubai', country: 'United Arab Emirates', aliases: ['uae', 'emirates'] },
  'Asia/Hong_Kong': { city: 'Hong Kong', country: 'China', aliases: ['hongkong'] },
  'Asia/Jakarta': { city: 'Jakarta', country: 'Indonesia', aliases: ['indonesia'] },
  'Asia/Jerusalem': { city: 'Jerusalem', country: 'Israel', aliases: ['israel'] },
  'Asia/Kabul': { city: 'Kabul', country: 'Afghanistan', aliases: ['afghanistan'] },
  'Asia/Karachi': { city: 'Karachi', country: 'Pakistan', aliases: ['pakistan'] },
  'Asia/Kathmandu': { city: 'Kathmandu', country: 'Nepal', aliases: ['nepal'] },
  'Asia/Kolkata': { city: 'Mumbai', country: 'India', aliases: ['mumbai', 'delhi', 'india', 'calcatta'] },
  'Asia/Kuala_Lumpur': { city: 'Kuala Lumpur', country: 'Malaysia', aliases: ['malaysia'] },
  'Asia/Manila': { city: 'Manila', country: 'Philippines', aliases: ['philippines'] },
  'Asia/Muscat': { city: 'Muscat', country: 'Oman', aliases: ['oman'] },
  'Asia/Riyadh': { city: 'Riyadh', country: 'Saudi Arabia', aliases: ['saudi', 'arabia', 'ksa'] },
  'Asia/Seoul': { city: 'Seoul', country: 'South Korea', aliases: ['korea'] },
  'Asia/Shanghai': { city: 'Shanghai', country: 'China', aliases: ['china', 'beijing'] },
  'Asia/Singapore': { city: 'Singapore', country: 'Singapore' },
  'Asia/Taipei': { city: 'Taipei', country: 'Taiwan', aliases: ['taiwan'] },
  'Asia/Tashkent': { city: 'Tashkent', country: 'Uzbekistan', aliases: ['uzbekistan'] },
  'Asia/Tehran': { city: 'Tehran', country: 'Iran', aliases: ['iran'] },
  'Asia/Tokyo': { city: 'Tokyo', country: 'Japan', aliases: ['japan'] },
  'Asia/Yerevan': { city: 'Yerevan', country: 'Armenia', aliases: ['armenia'] },
  'Atlantic/Azores': { city: 'Azores', country: 'Portugal' },
  'Australia/Adelaide': { city: 'Adelaide', country: 'Australia' },
  'Australia/Brisbane': { city: 'Brisbane', country: 'Australia' },
  'Australia/Melbourne': { city: 'Melbourne', country: 'Australia' },
  'Australia/Perth': { city: 'Perth', country: 'Australia' },
  'Australia/Sydney': { city: 'Sydney', country: 'Australia' },
  'Europe/Amsterdam': { city: 'Amsterdam', country: 'Netherlands', aliases: ['holland', 'netherlands'] },
  'Europe/Athens': { city: 'Athens', country: 'Greece', aliases: ['greece'] },
  'Europe/Berlin': { city: 'Berlin', country: 'Germany', aliases: ['germany'] },
  'Europe/Brussels': { city: 'Brussels', country: 'Belgium', aliases: ['belgium'] },
  'Europe/Budapest': { city: 'Budapest', country: 'Hungary', aliases: ['hungary'] },
  'Europe/Copenhagen': { city: 'Copenhagen', country: 'Denmark', aliases: ['denmark'] },
  'Europe/Dublin': { city: 'Dublin', country: 'Ireland', aliases: ['ireland'] },
  'Europe/Helsinki': { city: 'Helsinki', country: 'Finland', aliases: ['finland'] },
  'Europe/Istanbul': { city: 'Istanbul', country: 'Turkey', aliases: ['turkey'] },
  'Europe/Lisbon': { city: 'Lisbon', country: 'Portugal', aliases: ['portugal'] },
  'Europe/London': { city: 'London', country: 'United Kingdom', aliases: ['uk', 'britain', 'england', 'gmt'] },
  'Europe/Madrid': { city: 'Madrid', country: 'Spain', aliases: ['spain'] },
  'Europe/Moscow': { city: 'Moscow', country: 'Russia', aliases: ['russia'] },
  'Europe/Oslo': { city: 'Oslo', country: 'Norway', aliases: ['norway'] },
  'Europe/Paris': { city: 'Paris', country: 'France', aliases: ['france'] },
  'Europe/Prague': { city: 'Prague', country: 'Czechia', aliases: ['czech'] },
  'Europe/Rome': { city: 'Rome', country: 'Italy', aliases: ['italy'] },
  'Europe/Stockholm': { city: 'Stockholm', country: 'Sweden', aliases: ['sweden'] },
  'Europe/Vienna': { city: 'Vienna', country: 'Austria', aliases: ['austria'] },
  'Europe/Warsaw': { city: 'Warsaw', country: 'Poland', aliases: ['poland'] },
  'Europe/Zurich': { city: 'Zurich', country: 'Switzerland', aliases: ['switzerland'] },
  'Pacific/Auckland': { city: 'Auckland', country: 'New Zealand', aliases: ['new zealand'] },
  'Pacific/Fiji': { city: 'Fiji', country: 'Fiji' },
  'Pacific/Honolulu': { city: 'Honolulu', country: 'United States', aliases: ['hawaii'] },
  'Pacific/Midway': { city: 'Midway', country: 'United States' },
};

// Friendly primary label, e.g. "Melbourne, Australia" or "Tehran, Iran".
function tzLabel(tz: string): string {
  const meta = TZ_LABELS[tz];
  if (meta) return `${meta.city}, ${meta.country}`;
  const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
  return city;
}

// Short label for the clock chip (city only, or custom label).
function tzShort(tz: string): string {
  const meta = TZ_LABELS[tz];
  if (meta) return meta.city;
  return tz.split('/').pop()?.replace(/_/g, ' ') || tz;
}

function isValidTz(t: string): boolean {
  try { new Date().toLocaleTimeString('en-US', { timeZone: t }); return true; }
  catch { return false; }
}

interface Props {
  calMode: CalendarMode;
  onCalModeChange: (m: CalendarMode) => void;
  viewMode: ViewMode;
  onViewChange: (v: ViewMode) => void;
  currentGregYear: number;
  currentShYear: number;
  currentShMonth: number;
  countdown: CountdownConfig | null;
  onCountdownSave: (cfg: CountdownConfig | null) => void;
  userAvatar?: string | null;
  userInitial: string;
  onSignOut: () => void;
  onOpenProfile: () => void;
  onRestartTour: () => void;
  onOpenWhatsNew: () => void;
  onOpenStudyRooms: () => void;
  studyRoomsActive: boolean;
  notificationsNode?: React.ReactNode;
  timezone?: string;          // profile timezone (used for clock1 'auto')
  clockSettings: ClockSettings;
  onClockSettingsChange: (s: ClockSettings) => void;
}

// ─── Live clock hook ──────────────────────────────────────────────────────────
function useClockTime(tz: string): string {
  const [time, setTime] = useState('');
  useEffect(() => {
    function tick() {
      try {
        setTime(new Date().toLocaleTimeString('en-US', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }));
      } catch { setTime('--:--'); }
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [tz]);
  return time;
}

// ─── Clock widget ─────────────────────────────────────────────────────────────
interface ClockWidgetProps {
  tz: string;
  label: string;
  onEdit: () => void;
}
function ClockWidget({ tz, label, onEdit }: ClockWidgetProps) {
  const time = useClockTime(tz);
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Click to change timezone"
      aria-haspopup="dialog"
      className="relative flex flex-col items-center cursor-pointer select-none transition-colors rounded-md px-1.5 py-0.5 border-0 bg-transparent"
      style={{ minWidth: 60, background: hover ? 'rgba(255,255,255,0.08)' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-[10px] md:text-xs font-bold" style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '0.04em', lineHeight: 1.2 }}>
        {time}
      </span>
      <span className="hidden sm:block text-xs" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px', lineHeight: 1.2 }}>
        {label || tzShort(tz)}
      </span>
    </button>
  );
}

// ─── Clock editor popup ───────────────────────────────────────────────────────
interface ClockEditorProps {
  initial: { tz: string; label: string };
  profileTz: string;
  isFirst: boolean;
  onSave: (tz: string, label: string) => void;
  onClose: () => void;
  onRemove?: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

function ClockEditor({ initial, profileTz, isFirst, onSave, onClose, onRemove, triggerRef }: ClockEditorProps) {
  const [tz, setTz] = useState(() => {
    const v = initial.tz === 'auto' ? profileTz : initial.tz;
    return isValidTz(v) ? v : 'UTC';
  });
  const [label, setLabel] = useState(initial.label);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { colors } = useTheme();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position the portal panel below the trigger, clamped to the viewport.
  useEffect(() => {
    function place() {
      const el = triggerRef?.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const pw = Math.min(300, vw - 16);
      let left = r.left + r.width / 2 - pw / 2;
      left = Math.max(8, Math.min(left, vw - pw - 8));
      let top = r.bottom + 8;
      // If not enough room below, open above.
      const roomBelow = window.innerHeight - r.bottom;
      if (roomBelow < 340 && r.top > 340) top = r.top - 8;
      setPos({ top, left });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [triggerRef]);

  // Focus search on open.
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Outside click + Escape close.
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef?.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onClickOut);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOut);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, triggerRef]);

  const allTzs = useMemo(() => {
    const list: string[] = [];
    for (const t of TIMEZONES) { if (!list.includes(t) && isValidTz(t)) list.push(t); }
    if (tz && !list.includes(tz) && isValidTz(tz)) list.unshift(tz);
    return list;
  }, [tz]);

  const filteredTzs = useMemo(() => {
    let list = allTzs;
    if (isFirst && isValidTz(profileTz)) list = list.filter(t => t !== profileTz);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t => {
      if (t.toLowerCase().includes(q)) return true;
      if (t.replace(/_/g, ' ').toLowerCase().includes(q)) return true;
      const meta = TZ_LABELS[t];
      if (!meta) return false;
      if (meta.city.toLowerCase().includes(q)) return true;
      if (meta.country.toLowerCase().includes(q)) return true;
      if (meta.aliases?.some(a => a.includes(q))) return true;
      return false;
    });
  }, [allTzs, search, isFirst, profileTz]);

  const isAuto = isFirst && isValidTz(profileTz) && tz === profileTz;

  function autoLabel(val: string) {
    if (!label) {
      const meta = TZ_LABELS[val];
      setLabel(meta ? meta.city : (val.split('/').pop()?.replace(/_/g, ' ') || val));
    }
  }

  function handleSave() {
    const resolvedTz = (isFirst && tz === profileTz) ? 'auto' : tz;
    onSave(resolvedTz, label.trim());
    onClose();
  }

  const panel = (
    <div
      ref={panelRef}
      className="fixed z-[9999] rounded-xl p-4"
      style={{
        top: pos?.top ?? -9999, left: pos?.left ?? -9999,
        width: 'min(300px, calc(100vw - 16px))', background: colors.bgCard,
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)', border: `1px solid ${colors.borderLight}`,
      }}
      role="dialog"
      aria-label={isFirst ? 'Clock 1 timezone' : 'Clock 2 timezone'}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.textPrimary }}>
          {isFirst ? 'Clock 1' : 'Clock 2'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Close">
          <X size={14} color={colors.textTertiary} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: colors.textSecondary }}>
            Timezone
          </label>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search city, country, or timezone..."
            className="w-full rounded-lg px-3 py-2 text-xs outline-none mb-2"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgSubtle, color: colors.textPrimary, fontFamily: 'inherit' }}
            onKeyDown={e => { if (e.key === 'Enter' && filteredTzs[0]) { setTz(filteredTzs[0]); autoLabel(filteredTzs[0]); } }}
          />
          {isFirst && isValidTz(profileTz) && (
            <button
              onClick={() => { setTz(profileTz); autoLabel(profileTz); setSearch(''); }}
              className="w-full text-left px-3 py-2 rounded-md text-xs transition-colors mb-0.5"
              style={{
                background: isAuto ? colors.accent : 'transparent',
                color: isAuto ? '#fff' : colors.textPrimary,
                border: 'none', cursor: 'pointer', fontWeight: isAuto ? 600 : 400, fontFamily: 'inherit',
              }}
              onMouseEnter={e => { if (!isAuto) e.currentTarget.style.background = colors.bgHover; }}
              onMouseLeave={e => { if (!isAuto) e.currentTarget.style.background = 'transparent'; }}
            >
              Auto (profile: {tzShort(profileTz)})
            </button>
          )}
          <div className="rounded-lg overflow-y-auto" style={{ maxHeight: 200, border: `1.5px solid ${colors.borderLight}`, background: colors.bgSubtle }}>
            {filteredTzs.length === 0 ? (
              <div className="px-3 py-4 text-xs text-center" style={{ color: colors.textTertiary }}>
                No results found
              </div>
            ) : (
              filteredTzs.map(t => {
                const selected = t === tz;
                const meta = TZ_LABELS[t];
                return (
                  <button
                    key={t}
                    onClick={() => { setTz(t); autoLabel(t); }}
                    className="w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2"
                    style={{
                      background: selected ? colors.accent : 'transparent',
                      color: selected ? '#fff' : colors.textPrimary,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = colors.bgHover; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ fontWeight: 600 }}>{meta ? `${meta.city}, ${meta.country}` : t.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{t}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: colors.textSecondary }}>
            Label <span style={{ color: colors.textTertiary, fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={tzShort(tz) || 'My Clock'}
            maxLength={20}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgSubtle, color: colors.textPrimary, fontFamily: 'inherit' }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {onRemove && (
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="py-2 px-3 rounded-lg text-xs font-semibold"
            style={{ background: colors.errorBg, color: colors.error, border: 'none', cursor: 'pointer' }}
          >
            Remove
          </button>
        )}
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg text-xs font-semibold"
          style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
          style={{ background: colors.textPrimary, border: 'none', cursor: 'pointer' }}
        >
          <Check size={12} /> Save
        </button>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

// ─── Clocks area: own state/refs per render site (desktop & mobile) ───────────
interface ClocksAreaProps {
  clockSettings: ClockSettings;
  timezone: string;
  eff1Tz: string;
  eff2Tz: string;
  showClock1: boolean;
  showClock2: boolean;
  showAddClock2: boolean;
  onSaveClock1: (tz: string, label: string) => void;
  onSaveClock2: (tz: string, label: string) => void;
  onClockSettingsChange: (s: ClockSettings) => void;
}

function ClocksArea({
  clockSettings, timezone, eff1Tz, eff2Tz,
  showClock1, showClock2, showAddClock2,
  onSaveClock1, onSaveClock2, onClockSettingsChange,
}: ClocksAreaProps) {
  const [editing, setEditing] = useState<1 | 2 | null>(null);
  const clock1Ref = useRef<HTMLDivElement>(null);
  const clock2Ref = useRef<HTMLDivElement>(null);

  return (
    <div className="flex items-center gap-2 md:gap-4 relative">
      {/* Clock 1 */}
      {showClock1 && (
        <div className="relative" ref={clock1Ref}>
          <ClockWidget
            tz={eff1Tz}
            label={clockSettings.clock1_label}
            onEdit={() => setEditing(prev => prev === 1 ? null : 1)}
          />
          {editing === 1 && (
            <ClockEditor
              initial={{ tz: clockSettings.clock1_tz, label: clockSettings.clock1_label }}
              profileTz={timezone}
              isFirst={true}
              onSave={onSaveClock1}
              onClose={() => setEditing(null)}
              triggerRef={clock1Ref}
            />
          )}
        </div>
      )}

      {/* Divider between clocks */}
      {showClock1 && showClock2 && (
        <div className="h-5 md:h-6" style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
      )}

      {/* Clock 2 */}
      {showClock2 && (
        <div className="relative" ref={clock2Ref}>
          <ClockWidget
            tz={eff2Tz}
            label={clockSettings.clock2_label}
            onEdit={() => setEditing(prev => prev === 2 ? null : 2)}
          />
          {editing === 2 && (
            <ClockEditor
              initial={{ tz: clockSettings.clock2_tz, label: clockSettings.clock2_label }}
              profileTz={timezone}
              isFirst={false}
              onSave={onSaveClock2}
              onClose={() => setEditing(null)}
              onRemove={() => onClockSettingsChange({ ...clockSettings, clock2_visible: false, clock2_tz: '' })}
              triggerRef={clock2Ref}
            />
          )}
        </div>
      )}

      {/* Add second clock button */}
      {showClock1 && showAddClock2 && (
        <div className="relative" ref={clock2Ref}>
          <button
            onClick={() => setEditing(2)}
            className="flex items-center gap-1 rounded-md px-1.5 md:px-2 py-1 transition-all"
            style={{
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '10px',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
            title="Add second clock"
          >
            <Plus size={10} /> <span className="hidden sm:inline">Clock</span>
          </button>
          {editing === 2 && (
            <ClockEditor
              initial={{ tz: timezone, label: '' }}
              profileTz={timezone}
              isFirst={false}
              onSave={onSaveClock2}
              onClose={() => setEditing(null)}
              triggerRef={clock2Ref}
            />
          )}
        </div>
      )}

      {/* Show clock 1 restore button if hidden */}
      {!showClock1 && (
        <button
          onClick={() => onClockSettingsChange({ ...clockSettings, clock1_visible: true })}
          className="flex items-center gap-1 rounded-md px-1.5 md:px-2 py-1 transition-all"
          style={{
            background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '10px',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
          title="Show clock"
        >
          <Clock size={10} /> <span className="hidden sm:inline">Add Clock</span>
        </button>
      )}
    </div>
  );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────
export default function TopNav({
  calMode, onCalModeChange, viewMode, onViewChange,
  currentGregYear, currentShYear, currentShMonth, countdown, onCountdownSave,
  userAvatar, userInitial, onSignOut, onOpenProfile, onRestartTour, onOpenWhatsNew,
  onOpenStudyRooms, studyRoomsActive, notificationsNode,
  timezone = 'UTC',
  clockSettings, onClockSettingsChange,
}: Props) {
  const { colors } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current && buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setShowMobileMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const tabs: { key: ViewMode; label: string; tour: string }[] = [
    { key: 'daily', label: 'Daily', tour: 'tour-view-daily' },
    { key: 'weekly', label: 'Weekly', tour: 'tour-view-weekly' },
    { key: 'monthly', label: 'Monthly', tour: 'tour-view-monthly' },
    { key: 'yearly', label: 'Yearly', tour: 'tour-view-yearly' },
  ];

  const eff1Tz = clockSettings.clock1_tz === 'auto' ? timezone : (clockSettings.clock1_tz || timezone);
  const eff2Tz = clockSettings.clock2_tz || 'UTC';

  const handleSaveClock1 = useCallback((tz: string, label: string) => {
    onClockSettingsChange({ ...clockSettings, clock1_tz: tz, clock1_label: label, clock1_visible: true });
  }, [clockSettings, onClockSettingsChange]);

  const handleSaveClock2 = useCallback((tz: string, label: string) => {
    onClockSettingsChange({ ...clockSettings, clock2_tz: tz, clock2_label: label, clock2_visible: true });
  }, [clockSettings, onClockSettingsChange]);

  const showClock1 = clockSettings.clock1_visible;
  const showClock2 = clockSettings.clock2_visible && !!clockSettings.clock2_tz;
  const showAddClock2 = !showClock2;

  const hasClocksArea = showClock1 || showClock2 || showAddClock2;

  const clocksGroup = hasClocksArea && (
    <ClocksArea
      clockSettings={clockSettings}
      timezone={timezone}
      eff1Tz={eff1Tz}
      eff2Tz={eff2Tz}
      showClock1={showClock1}
      showClock2={showClock2}
      showAddClock2={showAddClock2}
      onSaveClock1={handleSaveClock1}
      onSaveClock2={handleSaveClock2}
      onClockSettingsChange={onClockSettingsChange}
    />
  );

  return (
    <div className="sticky top-0 z-50" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.22)' }}>
      <nav
        className="flex items-center px-4 md:px-8 gap-2"
        style={{ background: colors.navBgGradient || colors.navBg, height: '56px' }}
      >
        {/* Left: Calendar toggle */}
        <div className="flex-shrink-0 md:flex-1 flex items-center justify-start">
          <CalendarDropdown
            mode={calMode}
            currentYear={currentGregYear}
            currentShYear={currentShYear}
            onChange={onCalModeChange}
          />
        </div>

        {/* Center: Clock(s) — desktop only, centered between left and right columns */}
        <div
          className="hidden md:flex flex-1 items-center justify-center"
          data-tour="tour-local-time"
        >
          {clocksGroup}
        </div>

        {/* Right: View tabs + Rooms + avatar (desktop) */}
        <div className="flex-1 md:flex-1 flex items-center justify-end gap-2 md:gap-3">
          {notificationsNode}

          <div className="hidden sm:flex gap-1" data-tour="tour-view-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => onViewChange(tab.key)}
                data-tour={tab.tour}
                className="px-3 md:px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-150"
                style={{
                  background: !studyRoomsActive && viewMode === tab.key ? colors.navAccent : 'transparent',
                  color: !studyRoomsActive && viewMode === tab.key ? '#fff' : colors.navText,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
            <button
              data-tour="tour-study-rooms"
              onClick={onOpenStudyRooms}
              aria-label="Rooms"
              className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-150"
              style={{
                background: studyRoomsActive ? colors.navAccent : 'transparent',
                color: studyRoomsActive ? '#fff' : colors.navText,
                border: 'none', cursor: 'pointer',
              }}
              title="Rooms"
            >
              <Users size={14} />
            </button>
          </div>

          {/* Mobile hamburger menu button */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="sm:hidden flex items-center justify-center rounded-md p-1.5 transition-all flex-shrink-0"
            style={{ background: showMobileMenu ? 'rgba(255,255,255,0.1)' : 'transparent', color: colors.navTextActive, border: 'none', cursor: 'pointer' }}
          >
            <Menu size={20} />
          </button>

          <button
            ref={buttonRef}
            onClick={() => setShowUserMenu(!showUserMenu)}
            data-tour="tour-profile"
            aria-label="Profile"
            title="Profile"
            className="flex items-center gap-2 px-1.5 py-1 rounded-md transition-all flex-shrink-0"
            style={{ background: showUserMenu ? 'rgba(255,255,255,0.1)' : 'transparent', cursor: 'pointer' }}
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt="Profile"
                className="rounded-full object-cover"
                style={{ width: 28, height: 28, border: '1.5px solid rgba(255,255,255,0.3)' }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ width: 28, height: 28, background: colors.navAccent }}
              >
                {userInitial}
              </div>
            )}
          </button>

          {showUserMenu && (
            <div
              ref={menuRef}
              data-tour="tour-settings-help"
              className="absolute top-12 right-4 md:right-8 w-56 max-w-[calc(100vw-2rem)] rounded-lg py-2"
              style={{ background: colors.bgCard, boxShadow: '0 4px 20px rgba(0,0,0,0.25)' }}
            >
              <MenuButton onClick={() => { setShowUserMenu(false); onOpenProfile(); }} color={colors.textPrimary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Profile & Settings
              </MenuButton>

              <MenuButton onClick={() => { setShowUserMenu(false); onOpenWhatsNew(); }} color={colors.success}>
                <Sparkles size={16} />
                What's New
              </MenuButton>

              <MenuButton onClick={() => { setShowUserMenu(false); onRestartTour(); }} color={colors.textPrimary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                Feature Tour
              </MenuButton>

              <div style={{ height: 1, background: colors.borderLight, margin: '4px 0' }} />

              <MenuButton onClick={() => { setShowUserMenu(false); onSignOut(); }} color={colors.error}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 12l-3-3m0 0l3-3m-3 3h12.75" />
                </svg>
                Sign Out
              </MenuButton>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile clock row — centered second row under the main header */}
      {hasClocksArea && (
        <div
          className="md:hidden flex items-center justify-center px-4 py-1.5"
          style={{ background: colors.navBg, borderTop: '1px solid rgba(255,255,255,0.06)' }}
          data-tour="tour-local-time"
        >
          {clocksGroup}
        </div>
      )}

      {/* Mobile dropdown menu */}
      {showMobileMenu && (
        <div
          ref={mobileMenuRef}
          className="sm:hidden absolute left-0 right-0 z-50 py-2 px-4"
          style={{ background: colors.navBg, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="flex flex-col gap-1">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => { onViewChange(tab.key); setShowMobileMenu(false); }}
                className="px-3 py-2 rounded-md text-sm font-semibold text-left transition-all"
                style={{
                  background: !studyRoomsActive && viewMode === tab.key ? colors.navAccent : 'transparent',
                  color: !studyRoomsActive && viewMode === tab.key ? '#fff' : colors.navText,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
            <button
              onClick={() => { onOpenStudyRooms(); setShowMobileMenu(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-left transition-all"
              style={{
                background: studyRoomsActive ? colors.navAccent : 'transparent',
                color: studyRoomsActive ? '#fff' : colors.navText,
                border: 'none', cursor: 'pointer',
              }}
            >
              <Users size={16} /> Rooms
            </button>
          </div>
        </div>
      )}

      <CountdownBar
        countdown={countdown}
        calMode={calMode}
        currentShMonth={currentShMonth}
        onSave={onCountdownSave}
      />
    </div>
  );
}

function MenuButton({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
      style={{ color, border: 'none', background: 'transparent', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}
