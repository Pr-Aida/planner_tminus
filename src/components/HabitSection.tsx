import { useState, useRef, useMemo, useEffect } from 'react';
import { Plus, Trash2, Check, Pencil, Save, EyeOff, Eye, CalendarDays, Layers, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { Habit, HabitType, HabitOverride, TempHabit } from '../types';
import { evalMinuteExpr } from '../lib/expr';
import { useTheme } from '../lib/theme';

type EffectiveHabit = (Habit | TempHabit) & { isExtra: boolean };

interface Props {
  habits: Habit[];
  habitValues: Record<string, boolean | number>;
  overrides: HabitOverride;
  onAddHabitToTemplate: (name: string, type: HabitType, unit: string | null) => Promise<void>;
  onAddHabitToDay: (name: string, type: HabitType, unit: string | null) => void;
  onDeleteHabit: (id: string) => Promise<void>;
  onUpdateHabitUnit: (id: string, unit: string | null) => Promise<void>;
  onEditHabit: (id: string, name: string, type: HabitType, unit: string | null) => Promise<void>;
  onEditExtraHabit: (id: string, name: string, type: HabitType, unit: string | null) => void;
  onToggleHabit: (id: string, value: boolean | number) => void;
  onHideHabitForDay: (id: string) => void;
  onUnhideHabitForDay: (id: string) => void;
  onRemoveExtraHabit: (id: string) => void;
  onSaveTemplate: () => void;
}

interface AddForm {
  name: string;
  type: HabitType;
  unit: string;
}

export default function HabitSection({
  habits, habitValues, overrides,
  onAddHabitToTemplate, onAddHabitToDay, onDeleteHabit, onUpdateHabitUnit, onEditHabit, onEditExtraHabit,
  onToggleHabit, onHideHabitForDay, onUnhideHabitForDay, onRemoveExtraHabit, onSaveTemplate,
}: Props) {
  const { colors } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ name: '', type: 'checkbox', unit: '' });
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'day' | 'template'>('day');
  const [showHidden, setShowHidden] = useState(false);
  const [editTarget, setEditTarget] = useState<EffectiveHabit | null>(null);
  const [editForm, setEditForm] = useState<AddForm>({ name: '', type: 'checkbox', unit: '' });
  const [editSaving, setEditSaving] = useState(false);

  const dayHiddenSet = useMemo(() => new Set(overrides.hidden), [overrides.hidden]);

  // Habits hidden only for this day.
  const hiddenHabits: EffectiveHabit[] = useMemo(() => [
    ...habits.filter(h => dayHiddenSet.has(h.id)).map(h => ({ ...h, isExtra: false })),
    ...overrides.extras.filter(e => dayHiddenSet.has(e.id)).map(e => ({ ...e, isExtra: true })),
  ], [habits, overrides.extras, dayHiddenSet]);

  const effectiveHabits: EffectiveHabit[] = useMemo(() => {
    const fromTemplate = habits
      .filter(h => !dayHiddenSet.has(h.id))
      .map(h => ({ ...h, isExtra: false }));
    const extras = overrides.extras
      .filter(e => !dayHiddenSet.has(e.id))
      .map(e => ({ ...e, isExtra: true }));
    return [...fromTemplate, ...extras];
  }, [habits, dayHiddenSet, overrides.extras]);

  async function handleAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (scope === 'template') {
      await onAddHabitToTemplate(form.name.trim(), form.type, form.type === 'value' ? form.unit.trim() || 'min' : null);
    } else {
      onAddHabitToDay(form.name.trim(), form.type, form.type === 'value' ? form.unit.trim() || 'min' : null);
    }
    setForm({ name: '', type: 'checkbox', unit: '' });
    setShowForm(false);
    setSaving(false);
  }

  function handleCancel() {
    setShowForm(false);
    setForm({ name: '', type: 'checkbox', unit: '' });
  }

  function openEdit(habit: EffectiveHabit) {
    setEditTarget(habit);
    setEditForm({
      name: habit.name,
      type: habit.habit_type,
      unit: habit.unit || '',
    });
  }

  function handleCancelEdit() {
    setEditTarget(null);
  }

  async function handleSaveEdit() {
    if (!editTarget || !editForm.name.trim()) return;
    setEditSaving(true);
    const name = editForm.name.trim();
    const type = editForm.type;
    const unit = type === 'value' ? (editForm.unit.trim() || 'min') : null;
    if (editTarget.isExtra) {
      onEditExtraHabit(editTarget.id, name, type, unit);
    } else {
      await onEditHabit(editTarget.id, name, type, unit);
    }
    setEditTarget(null);
    setEditSaving(false);
  }

  return (
    <div
      className="rounded-xl p-6 mb-4"
      data-tour="tour-habits"
      style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
    >
      {/* Card title */}
      <div className="flex items-center mb-4">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
          Daily Habits
        </span>
        <div className="flex-1 h-px ml-3" style={{ background: colors.accentLight }} />
        <button
          onClick={onSaveTemplate}
          data-tour="tour-habit-save"
          className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: colors.accentLight, color: colors.accent, border: 'none', cursor: 'pointer' }}
          title="Save current habits as your daily template"
        >
          <Save size={12} /> Save
        </button>
        <button
          onClick={() => { setShowForm(true); setScope('day'); }}
          data-tour="tour-habit-add"
          className="ml-2 flex items-center justify-center rounded-lg w-7 h-7 transition-opacity hover:opacity-80"
          style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
          title="Add habit"
        >
          <Plus size={14} color="#fff" />
        </button>
      </div>

      {/* Existing habits */}
      <div>
        {effectiveHabits.map((habit, idx) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            value={habitValues[habit.id]}
            onToggle={v => onToggleHabit(habit.id, v)}
            onDelete={habit.isExtra ? () => onRemoveExtraHabit(habit.id) : () => onDeleteHabit(habit.id)}
            onUpdateUnit={habit.isExtra ? undefined : (unit => onUpdateHabitUnit(habit.id, unit))}
            onEdit={() => openEdit(habit)}
            onHideForDay={() => onHideHabitForDay(habit.id)}
            isExtra={habit.isExtra}
            isHidden={false}
            isLast={idx === effectiveHabits.length - 1 && !showForm && hiddenHabits.length === 0}
            tourAttr={idx === 0 ? (habit.habit_type === 'checkbox' ? 'tour-habit-checkbox' : 'tour-habit-time') : undefined}
          />
        ))}
        {effectiveHabits.length === 0 && !showForm && (
          <p className="text-xs py-2" style={{ color: colors.textTertiary }}>
            No habits for this day — click + to add one.
          </p>
        )}
      </div>

      {/* Hidden for today management */}
      {hiddenHabits.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowHidden(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-80 py-1.5"
            style={{ color: colors.textTertiary, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            {showHidden ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <EyeOff size={12} />
            Hidden for today ({hiddenHabits.length})
          </button>
          {showHidden && (
            <div className="mt-1" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
              {hiddenHabits.map((habit, idx) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  value={undefined}
                  onToggle={() => {}}
                  onDelete={habit.isExtra ? () => onRemoveExtraHabit(habit.id) : () => onDeleteHabit(habit.id)}
                  onEdit={() => openEdit(habit)}
                  onUnhideForDay={() => onUnhideHabitForDay(habit.id)}
                  isExtra={habit.isExtra}
                  isHidden
                  isLast={idx === hiddenHabits.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
          {/* Scope selector */}
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1.5px solid ${colors.borderLight}` }}>
            <button
              onClick={() => setScope('day')}
              className="flex-1 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{ background: scope === 'day' ? colors.heroBg : colors.bgInput, color: scope === 'day' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
            >
              <CalendarDays size={12} /> Only this day
            </button>
            <button
              onClick={() => setScope('template')}
              className="flex-1 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{ background: scope === 'template' ? colors.heroBg : colors.bgInput, color: scope === 'template' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
            >
              <Layers size={12} /> Daily template
            </button>
          </div>

          {/* Habit name */}
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Habit name (e.g. Violin Practice)"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
            style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, fontFamily: 'inherit', color: colors.textPrimary }}
            onFocus={e => (e.target.style.borderColor = colors.heroBg)}
            onBlur={e => (e.target.style.borderColor = colors.borderLight)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />

          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1.5px solid ${colors.borderLight}` }}>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'checkbox' }))}
              className="flex-1 py-2 text-xs font-semibold transition-all"
              style={{ background: form.type === 'checkbox' ? colors.heroBg : colors.bgInput, color: form.type === 'checkbox' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
            >
              Checkbox
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'value' }))}
              className="flex-1 py-2 text-xs font-semibold transition-all"
              style={{ background: form.type === 'value' ? colors.heroBg : colors.bgInput, color: form.type === 'value' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
            >
              With Time (min)
            </button>
          </div>

          {/* Unit input for value type */}
          {form.type === 'value' && (
            <>
              <div className="flex gap-2 mb-2">
                {['min', 'pages'].map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, unit: u }))}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: form.unit === u ? colors.heroBg : colors.bgInput,
                      color: form.unit === u ? '#fff' : colors.textSecondary,
                      border: `1.5px solid ${form.unit === u ? colors.heroBg : colors.borderLight}`,
                      cursor: 'pointer',
                    }}
                  >
                    {u === 'min' ? 'Minutes' : 'Pages'}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="Unit label (default: min)"
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
                style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, fontFamily: 'inherit', color: colors.textPrimary }}
                onFocus={e => (e.target.style.borderColor = colors.heroBg)}
                onBlur={e => (e.target.style.borderColor = colors.borderLight)}
              />
            </>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{ background: colors.heroBg, border: 'none', cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1 }}
            >
              {scope === 'template' ? 'Add to Template' : 'Add to This Day'}
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit habit modal */}
      {editTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: colors.overlay }}
          onMouseDown={e => { if (e.target === e.currentTarget) handleCancelEdit(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: colors.bgCard, boxShadow: `0 12px 40px ${colors.shadow}` }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.accent }}>
                {editTarget.isExtra ? 'Edit habit (this day only)' : 'Edit habit'}
              </span>
              <button
                onClick={handleCancelEdit}
                className="p-1 rounded transition-opacity hover:opacity-70"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <input
              autoFocus
              type="text"
              value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Habit name"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, fontFamily: 'inherit', color: colors.textPrimary }}
              onFocus={e => (e.target.style.borderColor = colors.heroBg)}
              onBlur={e => (e.target.style.borderColor = colors.borderLight)}
              onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
            />

            <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1.5px solid ${colors.borderLight}` }}>
              <button
                onClick={() => setEditForm(f => ({ ...f, type: 'checkbox' }))}
                className="flex-1 py-2 text-xs font-semibold transition-all"
                style={{ background: editForm.type === 'checkbox' ? colors.heroBg : colors.bgInput, color: editForm.type === 'checkbox' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
              >
                Checkbox
              </button>
              <button
                onClick={() => setEditForm(f => ({ ...f, type: 'value' }))}
                className="flex-1 py-2 text-xs font-semibold transition-all"
                style={{ background: editForm.type === 'value' ? colors.heroBg : colors.bgInput, color: editForm.type === 'value' ? '#fff' : colors.textSecondary, border: 'none', cursor: 'pointer' }}
              >
                With Time (min)
              </button>
            </div>

            {editForm.type === 'value' && (
              <>
                <div className="flex gap-2 mb-2">
                  {['min', 'pages'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, unit: u }))}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        background: editForm.unit === u ? colors.heroBg : colors.bgInput,
                        color: editForm.unit === u ? '#fff' : colors.textSecondary,
                        border: `1.5px solid ${editForm.unit === u ? colors.heroBg : colors.borderLight}`,
                        cursor: 'pointer',
                      }}
                    >
                      {u === 'min' ? 'Minutes' : 'Pages'}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editForm.unit}
                  onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="Unit label (default: min)"
                  className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
                  style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, fontFamily: 'inherit', color: colors.textPrimary }}
                  onFocus={e => (e.target.style.borderColor = colors.heroBg)}
                  onBlur={e => (e.target.style.borderColor = colors.borderLight)}
                />
              </>
            )}

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleSaveEdit}
                disabled={editSaving || !editForm.name.trim()}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
                style={{ background: colors.heroBg, border: 'none', cursor: editSaving || !editForm.name.trim() ? 'not-allowed' : 'pointer', opacity: editSaving || !editForm.name.trim() ? 0.6 : 1 }}
              >
                Save Changes
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
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

// ─── Habit Row ────────────────────────────────────────────────────────────────

interface HabitRowProps {
  habit: EffectiveHabit;
  value: boolean | number | undefined;
  onToggle: (v: boolean | number) => void;
  onDelete: () => void;
  onUpdateUnit?: (unit: string | null) => void;
  onEdit?: () => void;
  onHideForDay?: () => void;
  onUnhideForDay?: () => void;
  isExtra: boolean;
  isHidden: boolean;
  isLast: boolean;
  tourAttr?: string;
}

function HabitRow({ habit, value, onToggle, onDelete, onUpdateUnit, onEdit, onHideForDay, onUnhideForDay, isExtra, isHidden, isLast, tourAttr }: HabitRowProps) {
  const { colors } = useTheme();

  const isDone = habit.habit_type === 'checkbox' ? !!value : false;
  const numVal = habit.habit_type === 'value' ? (typeof value === 'number' ? value : 0) : 0;

  // Time-input local state: lets the user type expressions like "15+10"
  // before committing the calculated result on blur / Enter.
  const [timeDraft, setTimeDraft] = useState<string>(numVal ? String(numVal) : '');
  const [timeError, setTimeError] = useState<string>('');
  const timeRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync when the saved value changes externally
  // (e.g. navigating to another day, or a sync from another device).
  useEffect(() => {
    setTimeDraft(numVal ? String(numVal) : '');
    setTimeError('');
  }, [numVal]);

  function commitTime() {
    const draft = timeDraft.trim();
    if (draft === '') {
      setTimeError('');
      onToggle(0);
      return;
    }
    const result = evalMinuteExpr(draft);
    if (result === null || result < 0) {
      setTimeError('Please enter a valid time, for example 15 or 15+10.');
      return;
    }
    setTimeError('');
    const clamped = Math.min(result, 9999);
    setTimeDraft(String(clamped));
    onToggle(clamped);
  }

  function handleTimeKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTime();
      timeRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setTimeError('');
      setTimeDraft(numVal ? String(numVal) : '');
      timeRef.current?.blur();
    }
  }

  return (
    <div
      className="flex items-center gap-3 py-2.5 group"
      data-tour={tourAttr}
      style={{ borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}`, opacity: isHidden ? 0.6 : 1 }}
    >
      {/* Checkbox or time input */}
      {!isHidden && habit.habit_type === 'checkbox' ? (
        <button
          onClick={() => onToggle(!isDone)}
          className="flex-shrink-0 flex items-center justify-center rounded-md transition-all"
          style={{ width: 24, height: 24, border: `2px solid ${isDone ? colors.accent : colors.border}`, background: isDone ? colors.accent : colors.bgInput, cursor: 'pointer' }}
        >
          {isDone && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>
      ) : !isHidden && habit.habit_type === 'value' ? (
        <div className="flex flex-col flex-shrink-0" style={{ gap: 2 }}>
          <div className="flex items-center gap-1.5">
            <input
              ref={timeRef}
              type="text"
              inputMode="numeric"
              value={timeDraft}
              placeholder="0"
              onChange={e => { setTimeDraft(e.target.value); setTimeError(''); }}
              onFocus={e => { e.target.style.borderColor = colors.heroBg; e.target.select(); }}
              onBlur={e => { e.target.style.borderColor = timeError ? colors.warning : colors.border; commitTime(); }}
              onKeyDown={handleTimeKeyDown}
              className="rounded-md text-center text-xs outline-none"
              style={{ width: 64, height: 28, border: `1.5px solid ${colors.border}`, color: colors.textPrimary, fontFamily: 'inherit', background: colors.bgInput }}
            />
            {onUpdateUnit ? (
              <button
                type="button"
                onClick={() => {
                  const current = (habit.unit || 'min').toLowerCase();
                  const next = current === 'pages' ? 'min' : 'pages';
                  onUpdateUnit(next);
                }}
                className="text-xs rounded px-1.5 py-0.5 transition-colors"
                style={{ color: colors.textSecondary, background: 'transparent', border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}
                title="Click to switch unit (min / pages)"
              >
                {habit.unit || 'min'}
              </button>
            ) : (
              <span className="text-xs" style={{ color: colors.textSecondary }}>{habit.unit || 'min'}</span>
            )}
          </div>
          {timeError && (
            <span className="text-[9px] leading-tight" style={{ color: colors.warning, maxWidth: 120 }}>
              {timeError}
            </span>
          )}
        </div>
      ) : (
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: 24, height: 24 }}>
          <EyeOff size={14} color={colors.textTertiary} />
        </div>
      )}

      {/* Name (or edit input) */}
      <span
        className="flex-1 text-sm font-medium min-w-0"
        style={{ color: colors.textPrimary, textDecoration: !isHidden && habit.habit_type === 'checkbox' && isDone ? 'line-through' : 'none', opacity: !isHidden && habit.habit_type === 'checkbox' && isDone ? 0.5 : 1 }}
      >
        {habit.name}
        {isExtra && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: colors.warningBg, color: colors.warning }}>
            Today only
          </span>
        )}
        {isHidden && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: colors.accentLight, color: colors.accent }}>
            Hidden today
          </span>
        )}
      </span>

      {/* Action buttons (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.textPrimary)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
              title="Edit habit"
            >
              <Pencil size={12} />
            </button>
          )}
          {isHidden && onUnhideForDay && (
            <button
              onClick={onUnhideForDay}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.accent)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
              title="Unhide for today"
            >
              <Eye size={12} />
            </button>
          )}
          {!isHidden && onHideForDay && (
            <button
              onClick={onHideForDay}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
              onMouseEnter={e => (e.currentTarget.style.color = colors.warning)}
              onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
              title="Hide for this day only"
            >
              <EyeOff size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 rounded transition-colors"
            style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
            onMouseEnter={e => (e.currentTarget.style.color = isExtra ? colors.warning : colors.accent)}
            onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
            title={isExtra ? 'Remove from this day' : 'Delete habit'}
          >
            <Trash2 size={12} />
          </button>
        </div>
    </div>
  );
}
