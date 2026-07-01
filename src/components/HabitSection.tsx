import { useState, useRef, useMemo } from 'react';
import { Plus, Trash2, Check, Pencil, Save, EyeOff, CalendarDays, Layers } from 'lucide-react';
import type { Habit, HabitType, HabitOverride, TempHabit } from '../types';

type EffectiveHabit = (Habit | TempHabit) & { isExtra: boolean };

interface Props {
  habits: Habit[];
  habitValues: Record<string, boolean | number>;
  overrides: HabitOverride;
  onAddHabitToTemplate: (name: string, type: HabitType, unit: string | null) => Promise<void>;
  onAddHabitToDay: (name: string, type: HabitType, unit: string | null) => void;
  onDeleteHabit: (id: string) => Promise<void>;
  onRenameHabit: (id: string, newName: string) => Promise<void>;
  onToggleHabit: (id: string, value: boolean | number) => void;
  onHideHabitForDay: (id: string) => void;
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
  onAddHabitToTemplate, onAddHabitToDay, onDeleteHabit, onRenameHabit,
  onToggleHabit, onHideHabitForDay, onRemoveExtraHabit, onSaveTemplate,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>({ name: '', type: 'checkbox', unit: '' });
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<'day' | 'template'>('day');

  const hiddenSet = useMemo(() => new Set(overrides.hidden), [overrides.hidden]);

  const effectiveHabits: EffectiveHabit[] = useMemo(() => {
    const fromTemplate = habits
      .filter(h => !hiddenSet.has(h.id))
      .map(h => ({ ...h, isExtra: false }));
    const extras = overrides.extras.map(e => ({ ...e, isExtra: true }));
    return [...fromTemplate, ...extras];
  }, [habits, hiddenSet, overrides.extras]);

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

  return (
    <div
      className="rounded-xl p-6 mb-4"
      data-tour="tour-habits"
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
    >
      {/* Card title */}
      <div className="flex items-center mb-4">
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7B1C3E' }}>
          Daily Habits
        </span>
        <div className="flex-1 h-px ml-3" style={{ background: '#F5E6EC' }} />
        <button
          onClick={onSaveTemplate}
          data-tour="tour-habit-save"
          className="ml-2 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: '#F5E6EC', color: '#7B1C3E', border: 'none', cursor: 'pointer' }}
          title="Save current habits as your daily template"
        >
          <Save size={12} /> Save
        </button>
        <button
          onClick={() => { setShowForm(true); setScope('day'); }}
          data-tour="tour-habit-add"
          className="ml-2 flex items-center justify-center rounded-lg w-7 h-7 transition-opacity hover:opacity-80"
          style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}
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
            onRename={habit.isExtra ? undefined : (newName => onRenameHabit(habit.id, newName))}
            onHideForDay={habit.isExtra ? undefined : () => onHideHabitForDay(habit.id)}
            isExtra={habit.isExtra}
            isLast={idx === effectiveHabits.length - 1 && !showForm}
            tourAttr={idx === 0 ? (habit.habit_type === 'checkbox' ? 'tour-habit-checkbox' : 'tour-habit-time') : undefined}
          />
        ))}
        {effectiveHabits.length === 0 && !showForm && (
          <p className="text-xs py-2" style={{ color: '#C8C8C8' }}>
            No habits for this day — click + to add one.
          </p>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F2F2F2' }}>
          {/* Scope selector */}
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: '1.5px solid #E8EBF4' }}>
            <button
              onClick={() => setScope('day')}
              className="flex-1 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{ background: scope === 'day' ? '#1B2A4A' : '#fff', color: scope === 'day' ? '#fff' : '#6B6B6B', border: 'none', cursor: 'pointer' }}
            >
              <CalendarDays size={12} /> Only this day
            </button>
            <button
              onClick={() => setScope('template')}
              className="flex-1 py-2 text-xs font-semibold transition-all flex items-center justify-center gap-1"
              style={{ background: scope === 'template' ? '#1B2A4A' : '#fff', color: scope === 'template' ? '#fff' : '#6B6B6B', border: 'none', cursor: 'pointer' }}
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
            style={{ border: '1.5px solid #E8EBF4', background: '#F2F2F2', fontFamily: 'inherit', color: '#111' }}
            onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
            onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />

          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: '1.5px solid #E8EBF4' }}>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'checkbox' }))}
              className="flex-1 py-2 text-xs font-semibold transition-all"
              style={{ background: form.type === 'checkbox' ? '#1B2A4A' : '#fff', color: form.type === 'checkbox' ? '#fff' : '#6B6B6B', border: 'none', cursor: 'pointer' }}
            >
              Checkbox
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, type: 'value' }))}
              className="flex-1 py-2 text-xs font-semibold transition-all"
              style={{ background: form.type === 'value' ? '#1B2A4A' : '#fff', color: form.type === 'value' ? '#fff' : '#6B6B6B', border: 'none', cursor: 'pointer' }}
            >
              With Time (min)
            </button>
          </div>

          {/* Unit input for value type */}
          {form.type === 'value' && (
            <input
              type="text"
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              placeholder="Unit label (default: min)"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
              style={{ border: '1.5px solid #E8EBF4', background: '#F2F2F2', fontFamily: 'inherit', color: '#111' }}
              onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
              onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
            />
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={saving || !form.name.trim()}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{ background: '#1B2A4A', border: 'none', cursor: saving || !form.name.trim() ? 'not-allowed' : 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1 }}
            >
              {scope === 'template' ? 'Add to Template' : 'Add to This Day'}
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: '#F2F2F2', color: '#1B2A4A', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
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
  onRename?: (newName: string) => void;
  onHideForDay?: () => void;
  isExtra: boolean;
  isLast: boolean;
  tourAttr?: string;
}

function HabitRow({ habit, value, onToggle, onDelete, onRename, onHideForDay, isExtra, isLast, tourAttr }: HabitRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(habit.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDone = habit.habit_type === 'checkbox' ? !!value : false;
  const numVal = habit.habit_type === 'value' ? (typeof value === 'number' ? value : 0) : 0;

  function startEdit() {
    setEditName(habit.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== habit.name && onRename) onRename(trimmed);
    setEditing(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') { setEditing(false); setEditName(habit.name); }
  }

  return (
    <div
      className="flex items-center gap-3 py-2.5 group"
      data-tour={tourAttr}
      style={{ borderBottom: isLast ? 'none' : '1px solid #F2F2F2' }}
    >
      {/* Checkbox or time input */}
      {habit.habit_type === 'checkbox' ? (
        <button
          onClick={() => onToggle(!isDone)}
          className="flex-shrink-0 flex items-center justify-center rounded-md transition-all"
          style={{ width: 24, height: 24, border: `2px solid ${isDone ? '#7B1C3E' : '#C8C8C8'}`, background: isDone ? '#7B1C3E' : '#fff', cursor: 'pointer' }}
        >
          {isDone && <Check size={13} color="#fff" strokeWidth={3} />}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="number" min={0} max={9999} value={numVal || ''} placeholder="0"
            onChange={e => onToggle(Number(e.target.value) || 0)}
            className="rounded-md text-center text-xs outline-none"
            style={{ width: 52, height: 28, border: '1.5px solid #C8C8C8', color: '#1B2A4A' }}
            onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
            onBlur={e => (e.target.style.borderColor = '#C8C8C8')}
          />
          <span className="text-xs" style={{ color: '#6B6B6B' }}>{habit.unit || 'min'}</span>
        </div>
      )}

      {/* Name (or edit input) */}
      {editing ? (
        <input
          ref={inputRef} type="text" value={editName}
          onChange={e => setEditName(e.target.value)}
          onBlur={commitEdit} onKeyDown={handleEditKeyDown}
          className="flex-1 text-sm font-medium rounded px-1 outline-none"
          style={{ border: '1.5px solid #1B2A4A', color: '#1B2A4A', fontFamily: 'inherit', background: '#F8F9FC', minWidth: 0 }}
          autoFocus
        />
      ) : (
        <span
          className="flex-1 text-sm font-medium min-w-0"
          style={{ color: '#1B2A4A', textDecoration: habit.habit_type === 'checkbox' && isDone ? 'line-through' : 'none', opacity: habit.habit_type === 'checkbox' && isDone ? 0.5 : 1 }}
        >
          {habit.name}
          {isExtra && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider" style={{ background: '#FEF3C7', color: '#B45309' }}>
              Today only
            </span>
          )}
        </span>
      )}

      {/* Action buttons (visible on hover) */}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onRename && (
            <button
              onClick={startEdit}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: '#C8C8C8' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1B2A4A')}
              onMouseLeave={e => (e.currentTarget.style.color = '#C8C8C8')}
              title="Rename habit"
            >
              <Pencil size={12} />
            </button>
          )}
          {!isExtra && onHideForDay && (
            <button
              onClick={onHideForDay}
              className="p-1 rounded transition-colors"
              style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: '#C8C8C8' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#B45309')}
              onMouseLeave={e => (e.currentTarget.style.color = '#C8C8C8')}
              title="Hide for this day only"
            >
              <EyeOff size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 rounded transition-colors"
            style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: '#C8C8C8' }}
            onMouseEnter={e => (e.currentTarget.style.color = isExtra ? '#B45309' : '#7B1C3E')}
            onMouseLeave={e => (e.currentTarget.style.color = '#C8C8C8')}
            title={isExtra ? 'Remove from this day' : 'Delete from template'}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
