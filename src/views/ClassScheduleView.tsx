import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Pencil, Trash2, MapPin, User, Clock, ChevronDown, ChevronUp, MoreVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/theme';
import { SH_WEEKDAYS_FULL, GREG_WEEKDAYS_FULL } from '../lib/calendar';
import type { CalendarMode } from '../types';

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
  created_at: string;
  updated_at: string;
}

interface Props {
  userId: string;
  calMode: CalendarMode;
  onClose: () => void;
}

const COLOR_OPTIONS = ['#7B1C3E', '#1B2A4A', '#059669', '#B45309', '#2563EB', '#7C3AED', '#DC2626', '#0891B2'];

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

export default function ClassScheduleView({ userId, calMode, onClose }: Props) {
  const { colors } = useTheme();
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  function resetForm() {
    setForm({ course_name: '', day_of_week: 0, start_time: '08:30', end_time: '10:00', location: '', instructor: '', notes: '', color: COLOR_OPTIONS[0], weekly_repeat: true });
    setEditingId(null);
  }

  function openAdd() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(cls: ClassEntry) {
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
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.course_name.trim()) { setError('Class name is required.'); return; }
    if (timeToMin(form.end_time) <= timeToMin(form.start_time)) { setError('End time must be after start time.'); return; }
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
      const { error: updateError } = await supabase.from('planner_classes').update(payload).eq('id', editingId);
      if (updateError) setError('Failed to update class.');
      else { setShowForm(false); resetForm(); await loadClasses(); }
    } else {
      const { error: insertError } = await supabase.from('planner_classes').insert({ ...payload, user_id: userId });
      if (insertError) setError('Failed to add class.');
      else { setShowForm(false); resetForm(); await loadClasses(); }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error: deleteError } = await supabase.from('planner_classes').delete().eq('id', id);
    if (deleteError) setError('Failed to delete class.');
    else { setExpandedId(null); await loadClasses(); }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const classesByDay: Record<number, ClassEntry[]> = {};
  for (let i = 0; i < 7; i++) classesByDay[i] = [];
  for (const cls of classes) {
    if (classesByDay[cls.day_of_week]) classesByDay[cls.day_of_week].push(cls);
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
            <div>
              <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Class Schedule</h1>
            </div>
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: colors.overlay }} onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
            style={{ background: colors.bgCard, boxShadow: `0 16px 48px ${colors.shadow}` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
              <h2 className="text-base font-bold" style={{ color: colors.textPrimary }}>
                {editingId ? 'Edit Class' : 'Add Class'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textTertiary }}>
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: '70vh' }}>
              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Class Name</label>
                <input
                  type="text"
                  value={form.course_name}
                  onChange={e => setForm({ ...form, course_name: e.target.value })}
                  placeholder="e.g. Fluid Mechanics"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold mb-1 block" style={{ color: colors.textSecondary }}>Day</label>
                <select
                  value={form.day_of_week}
                  onChange={e => setForm({ ...form, day_of_week: Number(e.target.value) })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary }}
                >
                  {weekdayNames.map((name, i) => <option key={i} value={i}>{name}</option>)}
                </select>
              </div>

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
                        border: form.color === c ? '2px solid ' + colors.textPrimary : '2px solid transparent',
                        transform: form.color === c ? 'scale(1.1)' : 'scale(1)',
                      }}
                    />
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.weekly_repeat}
                  onChange={e => setForm({ ...form, weekly_repeat: e.target.checked })}
                  className="rounded"
                />
                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Repeats weekly</span>
              </label>
            </div>

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
                onClick={() => setShowForm(false)}
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
        <>
          {/* Day cards */}
          <div className="max-w-6xl mx-auto px-4 md:px-6 pb-16">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {weekdayNames.map((dayName, dayIdx) => {
                const dayClasses = classesByDay[dayIdx] || [];
                return (
                  <div
                    key={dayIdx}
                    className="rounded-xl overflow-hidden flex flex-col"
                    style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 8px ${colors.shadow}` }}
                  >
                    <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                      <h3 className="text-sm font-bold" style={{ color: colors.textPrimary }}>{dayName}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: colors.bgSubtle, color: colors.textTertiary }}>
                        {dayClasses.length}
                      </span>
                    </div>

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
                                className="rounded-lg overflow-hidden transition-all"
                                style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgSubtle }}
                              >
                                <div
                                  className="px-2.5 py-2 cursor-pointer"
                                  onClick={() => setExpandedId(isExpanded ? null : cls.id)}
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
                                    <div className="relative flex-shrink-0" ref={menuOpenId === cls.id ? menuRef : undefined}>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === cls.id ? null : cls.id); }}
                                        className="flex items-center justify-center rounded p-0.5 transition-colors"
                                        style={{ background: menuOpenId === cls.id ? colors.bgInput : 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}
                                        aria-label="Class actions"
                                      >
                                        <MoreVertical size={14} />
                                      </button>
                                      {menuOpenId === cls.id && (
                                        <div
                                          className="absolute right-0 top-6 z-20 w-28 rounded-lg py-1"
                                          style={{ background: colors.bgCard, boxShadow: `0 4px 16px ${colors.shadow}`, border: `1px solid ${colors.borderLight}` }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); openEdit(cls); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-left transition-colors"
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textSecondary }}
                                            onMouseEnter={(ev) => (ev.currentTarget.style.background = colors.bgHover)}
                                            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                                          >
                                            <Pencil size={11} /> Edit
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleDelete(cls.id); }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-left transition-colors"
                                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.error }}
                                            onMouseEnter={(ev) => (ev.currentTarget.style.background = colors.bgHover)}
                                            onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                                          >
                                            <Trash2 size={11} /> Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    {isExpanded ? <ChevronUp size={14} style={{ color: colors.textTertiary, flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: colors.textTertiary, flexShrink: 0 }} />}
                                  </div>

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
        </>
      )}
    </div>
  );
}
