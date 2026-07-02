import { useState, useRef, useEffect, useCallback } from 'react';
import { CalendarDropdown } from './CalendarDropdown';
import CountdownBar from './CountdownBar';
import { Sparkles, Edit2, X, Plus, Clock, Check, Users } from 'lucide-react';
import type { CalendarMode, ViewMode } from '../types';
import { TIMEZONES } from '../types';
import type { CountdownConfig } from './CountdownBar';

// ─── Clock settings shape passed from App ────────────────────────────────────
export interface ClockSettings {
  clock1_tz: string;       // 'auto' = use profile timezone_pref
  clock1_label: string;
  clock1_visible: boolean;
  clock2_tz: string;
  clock2_label: string;
  clock2_visible: boolean;
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
  onRemove: () => void;
}
function ClockWidget({ tz, label, onEdit, onRemove }: ClockWidgetProps) {
  const time = useClockTime(tz);
  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative flex flex-col items-center cursor-default select-none"
      style={{ minWidth: 80 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.92)', letterSpacing: '0.04em', lineHeight: 1.2 }}>
        {time}
      </span>
      <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px', lineHeight: 1.2 }}>
        {label || tz.split('/').pop()?.replace(/_/g, ' ') || tz}
      </span>
      {hover && (
        <div className="absolute -top-1 -right-1 flex gap-0.5 z-10">
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            className="flex items-center justify-center rounded-full"
            style={{ width: 16, height: 16, background: 'rgba(27,42,74,0.85)', border: 'none', cursor: 'pointer' }}
            title="Edit clock"
          >
            <Edit2 size={9} color="#fff" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="flex items-center justify-center rounded-full"
            style={{ width: 16, height: 16, background: 'rgba(185,28,28,0.85)', border: 'none', cursor: 'pointer' }}
            title="Remove clock"
          >
            <X size={9} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Clock editor popup ───────────────────────────────────────────────────────
interface ClockEditorProps {
  initial: { tz: string; label: string };
  profileTz: string;
  isFirst: boolean;
  onSave: (tz: string, label: string) => void;
  onClose: () => void;
}

function ClockEditor({ initial, profileTz, isFirst, onSave, onClose }: ClockEditorProps) {
  const [tz, setTz] = useState(initial.tz === 'auto' ? profileTz : initial.tz);
  const [label, setLabel] = useState(initial.label);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, [onClose]);

  // Auto-fill label from timezone if empty
  function autoLabel(val: string) {
    if (!label) {
      const city = val.split('/').pop()?.replace(/_/g, ' ') || val;
      setLabel(city);
    }
  }

  function handleSave() {
    const resolvedTz = (isFirst && tz === profileTz) ? 'auto' : tz;
    onSave(resolvedTz, label.trim());
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute z-[200] rounded-xl p-4"
      style={{
        top: '110%', left: '50%', transform: 'translateX(-50%)',
        width: 280, background: '#fff',
        boxShadow: '0 8px 32px rgba(0,0,0,0.22)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#1B2A4A' }}>
          {isFirst ? 'Clock 1' : 'Clock 2'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={14} color="#9CA3AF" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6B6B6B' }}>
            Timezone
          </label>
          <select
            value={tz}
            onChange={e => { setTz(e.target.value); autoLabel(e.target.value); }}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none"
            style={{ border: '1.5px solid #E8EBF4', background: '#F8F9FC', color: '#111', fontFamily: 'inherit' }}
          >
            {isFirst && <option value={profileTz}>Auto (from profile: {profileTz})</option>}
            {(TIMEZONES as readonly string[]).filter(t => t !== profileTz || !isFirst).map(t => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: '#6B6B6B' }}>
            Label <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={tz.split('/').pop()?.replace(/_/g, ' ') || 'My Clock'}
            maxLength={20}
            className="w-full rounded-lg px-3 py-2 text-xs outline-none"
            style={{ border: '1.5px solid #E8EBF4', background: '#F8F9FC', color: '#111', fontFamily: 'inherit' }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={onClose}
          className="flex-1 py-2 rounded-lg text-xs font-semibold"
          style={{ background: '#F2F2F2', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1"
          style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}
        >
          <Check size={12} /> Save
        </button>
      </div>
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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [editingClock, setEditingClock] = useState<1 | 2 | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current && buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
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

  return (
    <div className="sticky top-0 z-50" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.22)' }}>
      <nav
        className="flex items-center px-4 md:px-8 gap-2"
        style={{ background: '#1B2A4A', height: '56px' }}
      >
        {/* Left: Calendar toggle */}
        <div className="flex-shrink-0">
          <CalendarDropdown
            mode={calMode}
            currentYear={currentGregYear}
            currentShYear={currentShYear}
            onChange={onCalModeChange}
          />
        </div>

        {/* Center: Clock(s) */}
        <div
          className="flex-1 flex items-center justify-center"
          data-tour="tour-local-time"
        >
          {hasClocksArea && (
            <div className="hidden md:flex items-center gap-4 relative">
              {/* Clock 1 */}
              {showClock1 && (
                <div className="relative">
                  <ClockWidget
                    tz={eff1Tz}
                    label={clockSettings.clock1_label}
                    onEdit={() => setEditingClock(1)}
                    onRemove={() => onClockSettingsChange({ ...clockSettings, clock1_visible: false })}
                  />
                  {editingClock === 1 && (
                    <ClockEditor
                      initial={{ tz: clockSettings.clock1_tz, label: clockSettings.clock1_label }}
                      profileTz={timezone}
                      isFirst={true}
                      onSave={handleSaveClock1}
                      onClose={() => setEditingClock(null)}
                    />
                  )}
                </div>
              )}

              {/* Divider between clocks */}
              {showClock1 && (showClock2) && (
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.15)' }} />
              )}

              {/* Clock 2 */}
              {showClock2 && (
                <div className="relative">
                  <ClockWidget
                    tz={eff2Tz}
                    label={clockSettings.clock2_label}
                    onEdit={() => setEditingClock(2)}
                    onRemove={() => onClockSettingsChange({ ...clockSettings, clock2_visible: false, clock2_tz: '' })}
                  />
                  {editingClock === 2 && (
                    <ClockEditor
                      initial={{ tz: clockSettings.clock2_tz, label: clockSettings.clock2_label }}
                      profileTz={timezone}
                      isFirst={false}
                      onSave={handleSaveClock2}
                      onClose={() => setEditingClock(null)}
                    />
                  )}
                </div>
              )}

              {/* Add second clock button */}
              {showClock1 && showAddClock2 && (
                <div className="relative">
                  <button
                    onClick={() => setEditingClock(2)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 transition-all"
                    style={{
                      background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)',
                      color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '10px',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
                    title="Add second clock"
                  >
                    <Plus size={10} /> Clock
                  </button>
                  {editingClock === 2 && (
                    <ClockEditor
                      initial={{ tz: timezone, label: '' }}
                      profileTz={timezone}
                      isFirst={false}
                      onSave={handleSaveClock2}
                      onClose={() => setEditingClock(null)}
                    />
                  )}
                </div>
              )}

              {/* Show clock 1 restore button if hidden */}
              {!showClock1 && (
                <button
                  onClick={() => onClockSettingsChange({ ...clockSettings, clock1_visible: true })}
                  className="flex items-center gap-1 rounded-md px-2 py-1 transition-all"
                  style={{
                    background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)',
                    color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: '10px',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; }}
                  title="Show clock"
                >
                  <Clock size={10} /> Add Clock
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: View tabs + avatar */}
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {notificationsNode}

          <button
            data-tour="tour-study-rooms"
            onClick={onOpenStudyRooms}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-150"
            style={{
              background: studyRoomsActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: studyRoomsActive ? '#fff' : 'rgba(255,255,255,0.65)',
              border: 'none', cursor: 'pointer',
            }}
            title="Study Rooms"
          >
            <Users size={14} />
            <span className="hidden sm:inline">Rooms</span>
          </button>

          <div className="flex gap-1" data-tour="tour-view-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => onViewChange(tab.key)}
                data-tour={tab.tour}
                className="px-3 md:px-4 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all duration-150"
                style={{
                  background: viewMode === tab.key ? '#7B1C3E' : 'transparent',
                  color: viewMode === tab.key ? '#fff' : 'rgba(255,255,255,0.65)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            ref={buttonRef}
            onClick={() => setShowUserMenu(!showUserMenu)}
            data-tour="tour-profile"
            className="flex items-center gap-2 px-1.5 py-1 rounded-md transition-all"
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
                style={{ width: 28, height: 28, background: '#7B1C3E' }}
              >
                {userInitial}
              </div>
            )}
          </button>

          {showUserMenu && (
            <div
              ref={menuRef}
              data-tour="tour-settings-help"
              className="absolute top-12 right-4 md:right-8 w-60 rounded-lg py-2"
              style={{ background: '#fff', boxShadow: '0 4px 20px rgba(27,42,74,0.20)' }}
            >
              <MenuButton onClick={() => { setShowUserMenu(false); onOpenProfile(); }} color="#1B2A4A">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                Profile & Settings
              </MenuButton>

              <MenuButton onClick={() => { setShowUserMenu(false); onOpenWhatsNew(); }} color="#059669">
                <Sparkles size={16} />
                What's New
              </MenuButton>

              <MenuButton onClick={() => { setShowUserMenu(false); onRestartTour(); }} color="#1B2A4A">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
                Feature Tour
              </MenuButton>

              <div style={{ height: 1, background: '#E8EBF4', margin: '4px 0' }} />

              <MenuButton onClick={() => { setShowUserMenu(false); onSignOut(); }} color="#B91C1C">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 12l-3-3m0 0l3-3m-3 3h12.75" />
                </svg>
                Sign Out
              </MenuButton>
            </div>
          )}
        </div>
      </nav>

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
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors"
      style={{ color, border: 'none', background: 'transparent', cursor: 'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = '#F5F5F5'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {children}
    </button>
  );
}
