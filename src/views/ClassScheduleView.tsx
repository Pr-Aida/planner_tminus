import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Pencil, Trash2, MapPin, User, Clock, ChevronDown, ChevronUp, MoreVertical, Bell, Check, Ban } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import {
  SH_WEEKDAYS_FULL, GREG_WEEKDAYS_FULL,
  SH_MONTHS, GREG_MONTH_NAMES,
  shToGregorian, gregorianToSh, dateKey, gregDateFromKey,
  shDayOfWeek, gregDayOfWeek,
  todaySh, todayGreg, addDaysGreg,
  shDaysInMonth, gregMonthDays, isJalaliLeap,
} from '../lib/calendar';
import type { CalendarMode, ReminderOffset, ShDate, GregDate } from '../types';

interface ClassEntry {
  id: string;
  user_id: string;
  course_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  instructor: string | null;
  notes: string | null;
  color: string | null;
  weekly_repeat: boolean;
  reminder_offset: ReminderOffset | null;
  created_at: string;
  updated_at: string;
}

interface LinkedReminder {
  id: string;
  date_key: string;
  title: string;
  note: string;
  remind_offset: ReminderOffset;
  status: string;
  class_id: string | null;
}

interface Props {
  userId: string;
  calMode: CalendarMode;
  timezone: string;
  onClose: () => void;
}

const COLOR_OPTIONS = ['#7B1C3E', '#1B2A4A', '#059669', '#B45309', '#2563EB', '#7C3AED', '#DC2626', '#0891B2'];

const OFFSET_LABELS: Record<ReminderOffset, string> = {
  7: '1 week before',
  3: '3 days before',
  1: '1 day before',
  0: 'On the day',
};

type ReminderMode = 'none' | 'preset' | 'custom';

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToLabel(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

function timeLabel(t: string): string {
  return minToLabel(timeToMin(t));
}

function durationLabel(start: string, end: string): string {
  const diff = timeToMin(end) - timeToMin(start);
  if (diff <= 0) return '';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function reminderLabel(offset: ReminderOffset | null): string {
  if (offset === null) return 'None';
  return OFFSET_LABELS[offset] || 'None';
}

function formatGregDate(g: GregDate): string {
  return `${GREG_MONTH_NAMES[g.month - 1]} ${g.day}, ${g.year}`;
}

function formatShDate(sh: ShDate): string {
  return `${SH_MONTHS[sh.month - 1].name} ${sh.day}, ${sh.year}`;
}

function gregToISODate(g: GregDate): string {
  return `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`;
}

function isoDateToGreg(iso: string): GregDate {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export default function ClassScheduleView({ userId, calMode, timezone, onClose }: Props) {
  const { colors } = useTheme();
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ cls: ClassEntry; reminders: LinkedReminder[] } | null>(null);
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Form state
  const [form, setForm] = useState({
    course_name: '',
    day_of_week: 0,
    start_time: '08:30',
    end_time: '10:00',
    location: '',
    instructor: '',
    notes: '',
    color: COLOR_OPTIONS[0],
    weekly_repeat: true,
  });
  const [reminderMode, setReminderMode] = useState<ReminderMode>('none');
  const [reminderPreset, setReminderPreset] = useState<ReminderOffset>(1);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderCustomDate, setReminderCustomDate] = useState('');
  const [reminderCustomTime, setReminderCustomTime] = useState('08:00');
  const [reminderRepeat, setReminderRepeat] = useState<'every' | 'once'>('every');
  const [linkedReminders, setLinkedReminders] = useState<LinkedReminder[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekdayNames = calMode === 'shamsi' ? SH_WEEKDAYS_FULL : GREG_WEEKDAYS_FULL;

  const loadClasses = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('planner_classes')
      .select('*')
      .eq('user_id', userId)
      .order('day_of_week')
      .order('start_time');
    if (error) {
      setError('Failed to load schedule.');
      setClasses([]);
    } else {
      setClasses((data || []) as ClassEntry[]);
      setError(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const openBtn = menuOpenId ? menuButtonRefs.current[menuOpenId] : null;
      if (openBtn && !openBtn.contains(target)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

  // Close menu when navigating away or collapsing
  useEffect(() => {
    if (expandedId && menuOpenId && expandedId !== menuOpenId) {
      // menu can stay open even if card is expanded, that's fine
    }
  }, [expandedId, menuOpenId]);

  function resetForm() {
    setForm({ course_name: '', day_of_week: 0, start_time: '08:30', end_time: '10:00', location: '', instructor: '', notes: '', color: COLOR_OPTIONS[0], weekly_repeat: true });
    setReminderMode('none');
    setReminderPreset(1);
    setReminderTitle('');
    setReminderNote('');
    setReminderCustomDate('');
    setReminderCustomTime('08:00');
    setReminderRepeat('every');
    setLinkedReminders([]);
    setEditingId(null);
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  async function openEdit(cls: ClassEntry) {
    setForm({
      course_name: cls.course_name,
      day_of_week: cls.day_of_week,
      start_time: cls.start_time,
      end_time: cls.end_time,
      location: cls.location || '',
      instructor: cls.instructor || '',
      notes: cls.notes || '',
      color: cls.color || COLOR_OPTIONS[0],
      weekly_repeat: cls.weekly_repeat,
    });
    setEditingId(cls.id);

    // Load linked reminders
    const { data: remData } = await supabase
      .from('planner_reminders')
      .select('*')
      .eq('class_id', cls.id);
    const rems = (remData || []) as unknown as LinkedReminder[];
    setLinkedReminders(rems);

    // Determine reminder mode from existing data
    if (cls.reminder_offset !== null && rems.length > 0) {
      // Check if it's a preset or custom
      // Preset reminders have date_key = class_date - offset, and remind_offset = offset
      // Custom reminders have remind_offset = 0 and a specific date_key
      const firstRem = rems[0];
      if (cls.reminder_offset === firstRem.remind_offset && firstRem.remind_offset !== 0) {
        setReminderMode('preset');
        setReminderPreset(firstRem.remind_offset);
      } else if (firstRem.remind_offset === 0) {
        // Could be "on the day" preset or custom
        if (cls.reminder_offset === 0) {
          setReminderMode('preset');
          setReminderPreset(0);
        } else {
          setReminderMode('custom');
          const g = gregDateFromKey(firstRem.date_key);
          setReminderCustomDate(gregToISODate(g));
        }
      } else {
        setReminderMode('preset');
        setReminderPreset(cls.reminder_offset);
      }
      setReminderTitle(firstRem.title);
      setReminderNote(firstRem.note || '');
      setReminderRepeat(cls.weekly_repeat ? 'every' : 'once');
    } else if (cls.reminder_offset !== null) {
      setReminderMode('preset');
      setReminderPreset(cls.reminder_offset);
      setReminderTitle(`${cls.course_name} — Class Reminder`);
      setReminderRepeat(cls.weekly_repeat ? 'every' : 'once');
    } else {
      setReminderMode('none');
    }

    setShowForm(true);
  }

  function openMenu(clsId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (menuOpenId === clsId) { setMenuOpenId(null); return; }
    setMenuOpenId(clsId);
    const btn = menuButtonRefs.current[clsId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ x: rect.right - 112, y: rect.bottom + 4 });
    }
  }

  function closeMenu() { setMenuOpenId(null); }

  function toggleExpand(clsId: string) {
    setExpandedId(prev => prev === clsId ? null : clsId);
  }

  // Compute the next occurrence of a class (as GregDate) given its day_of_week
  function nextClassOccurrence(dow: number): GregDate {
    const now = calMode === 'shamsi' ? todaySh(timezone) : todayGreg(timezone);
    const todayGregDate = calMode === 'shamsi' ? shToGregorian(now) : now;
    let todayDow: number;
    if (calMode === 'shamsi') {
      todayDow = shDayOfWeek(now.year, now.month, now.day);
    } else {
      todayDow = gregDayOfWeek(now.year, now.month, now.day);
    }
    const daysUntil = (dow - todayDow + 7) % 7;
    return addDaysGreg(todayGregDate, daysUntil);
  }

  // Sync reminders for a class based on current form settings
  async function syncRemindersForClass(cls: ClassEntry): Promise<void> {
    // First, delete all existing reminders linked to this class
    await supabase.from('planner_reminders').delete().eq('class_id', cls.id);

    if (reminderMode === 'none') {
      // Update class reminder_offset to null
      await supabase.from('planner_classes').update({ reminder_offset: null }).eq('id', cls.id);
      return;
    }

    const title = reminderTitle.trim() || `${cls.course_name} — Class Reminder`;
    const note = reminderNote.trim();

    if (reminderMode === 'preset') {
      const offset = reminderPreset;
      await supabase.from('planner_classes').update({ reminder_offset: offset }).eq('id', cls.id);

      const maxWeeks = reminderRepeat === 'every' && cls.weekly_repeat ? 16 : 1;
      const firstOccurrence = nextClassOccurrence(cls.day_of_week);
      const remindersToCreate: { date_key: string; title: string; note: string; remind_offset: ReminderOffset; class_id: string }[] = [];

      for (let w = 0; w < maxWeeks; w++) {
        const classDate = addDaysGreg(firstOccurrence, w * 7);
        const reminderDate = addDaysGreg(classDate, -offset);
        remindersToCreate.push({
          date_key: dateKey(reminderDate),
          title,
          note,
          remind_offset: offset,
          class_id: cls.id,
        });
      }

      if (remindersToCreate.length > 0) {
        await supabase.from('planner_reminders').insert(remindersToCreate);
      }
    } else if (reminderMode === 'custom') {
      // Custom: specific date and time, offset = 0 (on that day)
      await supabase.from('planner_classes').update({ reminder_offset: 0 }).eq('id', cls.id);

      if (!reminderCustomDate) return;
      const g = isoDateToGreg(reminderCustomDate);
      const remindersToCreate: { date_key: string; title: string; note: string; remind_offset: ReminderOffset; class_id: string }[] = [];

      if (reminderRepeat === 'every' && cls.weekly_repeat) {
        // Create weekly reminders for 16 weeks starting from custom date
        for (let w = 0; w < 16; w++) {
          const remDate = addDaysGreg(g, w * 7);
          remindersToCreate.push({
            date_key: dateKey(remDate),
            title: `${title} (${reminderCustomTime})`,
            note,
            remind_offset: 0,
            class_id: cls.id,
          });
        }
      } else {
        remindersToCreate.push({
          date_key: dateKey(g),
          title: `${title} (${reminderCustomTime})`,
          note,
          remind_offset: 0,
          class_id: cls.id,
        });
      }

      if (remindersToCreate.length > 0) {
        await supabase.from('planner_reminders').insert(remindersToCreate);
      }
    }
  }

  async function handleSave() {
    if (!form.course_name.trim()) { setError('Class name is required.'); return; }
    if (timeToMin(form.end_time) <= timeToMin(form.start_time)) { setError('End time must be after start time.'); return; }
    if (reminderMode === 'custom' && !reminderCustomDate) { setError('Please select a reminder date.'); return; }

    setSaving(true);
    setError(null);

    const payload = {
      course_name: form.course_name.trim(),
      day_of_week: form.day_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location.trim() || null,
      instructor: form.instructor.trim() || null,
      notes: form.notes.trim() || null,
      color: form.color,
      weekly_repeat: form.weekly_repeat,
    };

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from('planner_classes')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single();
      if (updateError) {
        setError('Failed to update class.');
        setSaving(false);
        return;
      }
      const updated = data as unknown as ClassEntry;
      await syncRemindersForClass(updated);
      setShowForm(false);
      resetForm();
      await loadClasses();
    } else {
      const { data, error: insertError } = await supabase
        .from('planner_classes')
        .insert({ ...payload, user_id: userId })
        .select()
        .single();
      if (insertError) {
        setError('Failed to add class.');
        setSaving(false);
        return;
      }
      const created = data as unknown as ClassEntry;
      await syncRemindersForClass(created);
      setShowForm(false);
      resetForm();
      await loadClasses();
    }
    setSaving(false);
  }

  async function handleDeleteClick(cls: ClassEntry) {
    closeMenu();
    // Fetch linked reminders
    const { data: remData } = await supabase
      .from('planner_reminders')
      .select('*')
      .eq('class_id', cls.id);
    const rems = (remData || []) as unknown as LinkedReminder[];
    setDeleteConfirm({ cls, reminders: rems });
  }

  async function handleDeleteConfirm(deleteReminders: boolean) {
    if (!deleteConfirm) return;
    const { cls } = deleteConfirm;

    if (deleteReminders) {
      await supabase.from('planner_reminders').delete().eq('class_id', cls.id);
    } else {
      // Unlink reminders so they survive the class deletion
      await supabase.from('planner_reminders').update({ class_id: null }).eq('class_id', cls.id);
    }

    const { error: deleteError } = await supabase.from('planner_classes').delete().eq('id', cls.id);
    if (deleteError) {
      setError('Failed to delete class.');
    } else {
      setExpandedId(null);
      setMenuOpenId(null);
      await loadClasses();
    }
    setDeleteConfirm(null);
  }

  // Group classes by day
  const classesByDay: Record<number, ClassEntry[]> = {};
  for (let i = 0; i < 7; i++) classesByDay[i] = [];
  for (const cls of classes) {
    if (classesByDay[cls.day_of_week]) classesByDay[cls.day_of_week].push(cls);
  }

  // Compute default custom date when switching to custom mode
  function ensureCustomDateDefault() {
    if (!reminderCustomDate) {
      const nextOcc = nextClassOccurrence(form.day_of_week);
      setReminderCustomDate(gregToISODate(nextOcc));
    }
  }

  // Update reminder title when class name changes (if title is auto-generated or empty)
  function updateReminderTitle(className: string) {
    if (!reminderTitle || reminderTitle.startsWith(form.course_name)) {
      setReminderTitle(`${className} — Class Reminder`);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: colors.bg }}>
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center justify-center rounded-lg p-2 transition-colors"
              style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, cursor: 'pointer', color: colors.textPrimary }}
              aria-label="Back"
            >
              <X size={18} />
            </button>
            <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Class Schedule</h1>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: colors.accent, border: 'none', cursor: 'pointer' }}
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Class</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg text-sm" style={{ background: colors.errorBg, color: colors.error }}>
            {error}
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: colors.overlay }}
          onClick={() => { setShowForm(false); resetForm(); }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{ background: colors.bgCard, boxShadow: `0 16px 48px ${colors.shadow}` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
              <h2 className="text-base font-bold" style={{ color: colors.textPrimary }}>
                {editingId ? 'Edit Class' : 'Add Class'}
              </h2>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textTertiary }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form body */}
            <div className="px-5 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              {/* Class Name */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Class Name</label>
                <input
                  type="text"
                  value={form.course_name}
                  onChange={e => {
                    setForm({ ...form, course_name: e.target.value });
                    updateReminderTitle(e.target.value);
                  }}
                  placeholder="e.g. Fluid Mechanics"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                />
              </div>

              {/* Day */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Day</label>
                <select
                  value={form.day_of_week}
                  onChange={e => setForm({ ...form, day_of_week: Number(e.target.value) })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                >
                  {weekdayNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
              </div>

              {/* Start / End Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Start Time</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={e => setForm({ ...form, start_time: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>End Time</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={e => setForm({ ...form, end_time: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Location / Room</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={e => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Room 204"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                />
              </div>

              {/* Instructor */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Instructor</label>
                <input
                  type="text"
                  value={form.instructor}
                  onChange={e => setForm({ ...form, instructor: e.target.value })}
                  placeholder="e.g. Dr. Smith"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: colors.textSecondary }}>Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className="rounded-full transition-all"
                      style={{
                        width: 28, height: 28, background: c, cursor: 'pointer',
                        border: form.color === c ? `2px solid ${colors.textPrimary}` : '2px solid transparent',
                        transform: form.color === c ? 'scale(1.1)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Weekly Repeat */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.weekly_repeat}
                  onChange={e => setForm({ ...form, weekly_repeat: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Repeats weekly</span>
              </label>

              {/* ─── REMINDER SECTION ─── */}
              <div style={{ borderTop: `1px solid ${colors.borderLight}`, paddingTop: 14, marginTop: 6 }}>
                {/* Section header matching DayModal style */}
                <div className="flex items-center gap-2 mb-3">
                  <Bell size={14} color={colors.accent} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
                    Reminder
                  </span>
                  <div className="flex-1 h-px" style={{ background: colors.accentLight }} />
                </div>

                {/* "Reminder for:" label */}
                <div className="mb-3">
                  <span className="text-[11px] font-medium" style={{ color: colors.textTertiary }}>Reminder for:</span>
                  <span className="text-xs font-bold ml-1.5" style={{ color: colors.textPrimary }}>
                    {form.course_name || 'Untitled Class'}
                  </span>
                </div>

                {/* Reminder mode selector */}
                <div className="flex gap-1.5 mb-3">
                  {(['none', 'preset', 'custom'] as ReminderMode[]).map(mode => (
                    <button
                      key={mode}
                      onClick={() => {
                        setReminderMode(mode);
                        if (mode === 'custom') ensureCustomDateDefault();
                        if (mode === 'preset' && !reminderTitle) {
                          setReminderTitle(`${form.course_name || 'Class'} — Class Reminder`);
                        }
                      }}
                      className="flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize transition-all"
                      style={{
                        background: reminderMode === mode ? colors.accent : colors.bgInput,
                        color: reminderMode === mode ? '#fff' : colors.textSecondary,
                        border: `1.5px solid ${reminderMode === mode ? colors.accent : colors.borderLight}`,
                        cursor: 'pointer',
                      }}
                    >
                      {mode === 'none' ? 'None' : mode === 'preset' ? 'Preset' : 'Custom'}
                    </button>
                  ))}
                </div>

                {/* Preset mode */}
                {reminderMode === 'preset' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Reminder title</label>
                      <input
                        type="text"
                        value={reminderTitle}
                        onChange={e => setReminderTitle(e.target.value)}
                        placeholder="Fluid Mechanics — Class Reminder"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Reminder timing</label>
                      <select
                        value={reminderPreset}
                        onChange={e => setReminderPreset(Number(e.target.value) as ReminderOffset)}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                      >
                        <option value={0}>At class time / On the day</option>
                        <option value={1}>1 day before</option>
                        <option value={3}>3 days before</option>
                        <option value={7}>1 week before</option>
                      </select>
                    </div>
                    {form.weekly_repeat && (
                      <div>
                        <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Repeat reminder</label>
                        <select
                          value={reminderRepeat}
                          onChange={e => setReminderRepeat(e.target.value as 'every' | 'once')}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                        >
                          <option value="every">Every weekly occurrence</option>
                          <option value="once">Next occurrence only</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Notes (optional)</label>
                      <textarea
                        value={reminderNote}
                        onChange={e => setReminderNote(e.target.value)}
                        placeholder="Reminder notes..."
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                      />
                    </div>
                  </div>
                )}

                {/* Custom mode */}
                {reminderMode === 'custom' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Reminder title</label>
                      <input
                        type="text"
                        value={reminderTitle}
                        onChange={e => setReminderTitle(e.target.value)}
                        placeholder="Fluid Mechanics — Class Reminder"
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>
                          Date {calMode === 'shamsi' ? '(Shamsi)' : '(Gregorian)'}
                        </label>
                        <input
                          type="date"
                          value={reminderCustomDate}
                          onChange={e => setReminderCustomDate(e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                        />
                        {reminderCustomDate && calMode === 'shamsi' && (
                          <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
                            {formatShDate(gregorianToSh(isoDateToGreg(reminderCustomDate)))}
                          </p>
                        )}
                        {reminderCustomDate && calMode === 'gregorian' && (
                          <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
                            {formatGregDate(isoDateToGreg(reminderCustomDate))}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Time</label>
                        <input
                          type="time"
                          value={reminderCustomTime}
                          onChange={e => setReminderCustomTime(e.target.value)}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                        />
                      </div>
                    </div>
                    {form.weekly_repeat && (
                      <div>
                        <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Repeat reminder</label>
                        <select
                          value={reminderRepeat}
                          onChange={e => setReminderRepeat(e.target.value as 'every' | 'once')}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                          style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                        >
                          <option value="every">Every weekly occurrence</option>
                          <option value="once">This date only</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Notes (optional)</label>
                      <textarea
                        value={reminderNote}
                        onChange={e => setReminderNote(e.target.value)}
                        placeholder="Reminder notes..."
                        rows={2}
                        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                        style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                      />
                    </div>
                  </div>
                )}

                {/* Show existing linked reminders when editing */}
                {editingId && linkedReminders.length > 0 && reminderMode !== 'none' && (
                  <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: colors.textTertiary }}>
                      Linked reminders ({linkedReminders.length})
                    </p>
                    <div className="space-y-1.5 max-h-24 overflow-y-auto">
                      {linkedReminders.slice(0, 5).map(r => (
                        <div key={r.id} className="flex items-center justify-between rounded px-2 py-1" style={{ background: colors.bgSubtle }}>
                          <span className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{r.title}</span>
                          <span className="text-[10px] ml-2 flex-shrink-0" style={{ color: colors.textTertiary }}>
                            {r.remind_offset === 0 ? 'On day' : `${r.remind_offset}d before`}
                          </span>
                        </div>
                      ))}
                      {linkedReminders.length > 5 && (
                        <p className="text-[10px] text-center" style={{ color: colors.textTertiary }}>
                          +{linkedReminders.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-2 px-5 py-3" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-lg py-2 text-sm font-bold text-white transition-all"
                style={{ background: colors.accent, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Class'}
              </button>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
                style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, cursor: 'pointer', color: colors.textSecondary }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-3 rounded-full animate-spin" style={{ borderColor: colors.border, borderTopColor: colors.accent, borderWidth: 3 }} />
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 md:px-6 pb-16">
          {/* Empty state */}
          {classes.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: colors.bgSubtle }}>
                <Clock size={28} style={{ color: colors.textTertiary }} />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: colors.textPrimary }}>No classes yet</p>
              <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>Add your first class to build your weekly schedule.</p>
              <button
                onClick={openAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                style={{ background: colors.accent, border: 'none', cursor: 'pointer' }}
              >
                <Plus size={16} /> Add Class
              </button>
            </div>
          )}

          {/* Weekly grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {weekdayNames.map((dayName, dayIdx) => {
              const dayClasses = classesByDay[dayIdx] || [];
              return (
                <div
                  key={dayIdx}
                  className="rounded-xl overflow-hidden flex flex-col"
                  style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 8px ${colors.shadow}` }}
                >
                  {/* Day header */}
                  <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                    <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>{dayName}</h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: colors.bgSubtle, color: colors.textTertiary }}>
                      {dayClasses.length}
                    </span>
                  </div>

                  {/* Classes */}
                  <div className="flex-1 p-2 space-y-2 min-h-[60px]">
                    {dayClasses.length === 0 ? (
                      <p className="text-[11px] text-center py-3" style={{ color: colors.textTertiary }}>No classes</p>
                    ) : (
                      dayClasses
                        .sort((a, b) => timeToMin(a.start_time) - timeToMin(b.start_time))
                        .map(cls => {
                          const isExpanded = expandedId === cls.id;
                          const accentColor = cls.color || colors.accent;
                          return (
                            <div
                              key={cls.id}
                              className="rounded-lg transition-all"
                              style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgSubtle }}
                            >
                              <div
                                className="px-2.5 py-2 cursor-pointer"
                                onClick={() => toggleExpand(cls.id)}
                                style={{ borderLeft: `3px solid ${accentColor}` }}
                              >
                                <div className="flex items-start justify-between gap-1.5">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{cls.course_name}</p>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      <Clock size={10} style={{ color: colors.textTertiary }} />
                                      <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                                        {timeLabel(cls.start_time)} – {timeLabel(cls.end_time)}
                                      </span>
                                      <span className="text-[10px] ml-0.5" style={{ color: colors.textTertiary }}>
                                        ({durationLabel(cls.start_time, cls.end_time)})
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-0.5 flex-shrink-0">
                                    {/* Three-dot menu button — completely separate from expand/collapse */}
                                    <button
                                      ref={(el) => { menuButtonRefs.current[cls.id] = el; }}
                                      onClick={(e) => openMenu(cls.id, e)}
                                      className="flex items-center justify-center rounded p-0.5 transition-colors"
                                      style={{
                                        background: menuOpenId === cls.id ? colors.bgInput : 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: colors.textTertiary,
                                      }}
                                      aria-label="Class actions"
                                    >
                                      <MoreVertical size={14} />
                                    </button>
                                    {/* Expand/collapse arrow — separate state */}
                                    {isExpanded
                                      ? <ChevronUp size={14} style={{ color: colors.textTertiary }} />
                                      : <ChevronDown size={14} style={{ color: colors.textTertiary }} />}
                                  </div>
                                </div>

                                {/* Expanded details */}
                                {isExpanded && (
                                  <div className="mt-2 pt-2 space-y-1.5" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                                    {cls.location && (
                                      <div className="flex items-center gap-1.5">
                                        <MapPin size={11} style={{ color: colors.textTertiary }} />
                                        <span className="text-[11px]" style={{ color: colors.textSecondary }}>{cls.location}</span>
                                      </div>
                                    )}
                                    {cls.instructor && (
                                      <div className="flex items-center gap-1.5">
                                        <User size={11} style={{ color: colors.textTertiary }} />
                                        <span className="text-[11px]" style={{ color: colors.textSecondary }}>{cls.instructor}</span>
                                      </div>
                                    )}
                                    {cls.notes && (
                                      <p className="text-[11px] pt-1" style={{ color: colors.textSecondary }}>{cls.notes}</p>
                                    )}
                                    {cls.reminder_offset !== null && (
                                      <div className="flex items-center gap-1.5 pt-1">
                                        <Bell size={11} style={{ color: colors.accent }} />
                                        <span className="text-[11px] font-medium" style={{ color: colors.textSecondary }}>
                                          Reminder: {reminderLabel(cls.reminder_offset)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Three-dot menu — rendered via portal to avoid clipping */}
      {menuOpenId && menuPos && createPortal(
        <div
          className="fixed z-[9999] w-28 rounded-lg py-1"
          style={{
            background: colors.bgCard,
            boxShadow: `0 4px 16px ${colors.shadow}`,
            border: `1px solid ${colors.borderLight}`,
            left: menuPos.x,
            top: menuPos.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              const cls = classes.find(c => c.id === menuOpenId);
              closeMenu();
              if (cls) openEdit(cls);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-left transition-colors"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textSecondary }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = colors.bgHover)}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
          >
            <Pencil size={11} /> Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const cls = classes.find(c => c.id === menuOpenId);
              if (cls) handleDeleteClick(cls);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-left transition-colors"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.error }}
            onMouseEnter={(ev) => (ev.currentTarget.style.background = colors.bgHover)}
            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>,
        document.body
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          style={{ background: colors.overlay }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ background: colors.bgCard, boxShadow: `0 16px 48px ${colors.shadow}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: colors.errorBg }}>
                  <Trash2 size={16} style={{ color: colors.error }} />
                </div>
                <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>Delete this class?</h3>
              </div>
              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                <span className="font-semibold">{deleteConfirm.cls.course_name}</span> — {weekdayNames[deleteConfirm.cls.day_of_week]} at {timeLabel(deleteConfirm.cls.start_time)}
              </p>
              {deleteConfirm.reminders.length > 0 ? (
                <p className="text-[11px] mt-2" style={{ color: colors.textTertiary }}>
                  This class has {deleteConfirm.reminders.length} linked reminder{deleteConfirm.reminders.length > 1 ? 's' : ''}. Choose what to delete:
                </p>
              ) : (
                <p className="text-[11px] mt-2" style={{ color: colors.textTertiary }}>
                  No linked reminders to worry about.
                </p>
              )}
            </div>

            <div className="px-5 py-3 space-y-2" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
              {deleteConfirm.reminders.length > 0 ? (
                <>
                  <button
                    onClick={() => handleDeleteConfirm(true)}
                    className="w-full rounded-lg py-2 text-xs font-bold text-white transition-all"
                    style={{ background: colors.error, border: 'none', cursor: 'pointer' }}
                  >
                    Delete class and {deleteConfirm.reminders.length} reminder{deleteConfirm.reminders.length > 1 ? 's' : ''}
                  </button>
                  <button
                    onClick={() => handleDeleteConfirm(false)}
                    className="w-full rounded-lg py-2 text-xs font-semibold transition-all"
                    style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, cursor: 'pointer', color: colors.textSecondary }}
                  >
                    Delete class only (keep reminders)
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleDeleteConfirm(true)}
                  className="w-full rounded-lg py-2 text-xs font-bold text-white transition-all"
                  style={{ background: colors.error, border: 'none', cursor: 'pointer' }}
                >
                  Delete class
                </button>
              )}
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full rounded-lg py-2 text-xs font-semibold transition-all"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
