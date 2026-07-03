import { useState } from 'react';
import { Plus, Trash2, Clock } from 'lucide-react';
import type { Activity } from '../types';
import { useTheme } from '../lib/theme';

interface Props {
  activities: Activity[];
  onAdd: (act: Omit<Activity, 'id'>) => void;
  onDelete: (id: string) => void;
}

interface AddForm {
  name: string;
  from: string;
  to: string;
  note: string;
}

const emptyForm: AddForm = { name: '', from: '', to: '', note: '' };

export default function ActivitySection({ activities, onAdd, onDelete }: Props) {
  const { colors } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddForm>(emptyForm);

  function handleAdd() {
    if (!form.name.trim()) return;
    onAdd({ name: form.name.trim(), from: form.from, to: form.to, note: form.note.trim() });
    setForm(emptyForm);
    setShowForm(false);
  }

  return (
    <div
      className="rounded-xl p-6 mb-4"
      data-tour="tour-activities"
      style={{ background: colors.bgCard, boxShadow: `0 2px 12px ${colors.shadow}` }}
    >
      {/* Card title row */}
      <div className="flex items-center mb-4">
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: colors.accent }}
        >
          Activities
        </span>
        <div className="flex-1 h-px ml-3" style={{ background: colors.accentLight }} />
        <button
          onClick={() => { setShowForm(true); setForm(emptyForm); }}
          className="ml-3 flex items-center justify-center rounded-lg w-7 h-7 transition-opacity hover:opacity-80"
          style={{ background: colors.heroBg, border: 'none', cursor: 'pointer' }}
          title="Add activity"
        >
          <Plus size={14} color="#fff" />
        </button>
      </div>

      {/* Add form — matches the reference image */}
      {showForm && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
        >
          {/* Activity name */}
          <input
            autoFocus
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Activity name"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-3"
            style={{
              border: `1.5px solid ${colors.borderLight}`,
              background: colors.bgInput,
              fontFamily: 'inherit',
              color: colors.textPrimary,
            }}
            onFocus={e => (e.target.style.borderColor = colors.heroBg)}
            onBlur={e => (e.target.style.borderColor = colors.borderLight)}
          />

          {/* Time inputs */}
          <div className="flex gap-3 mb-3">
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
            >
              <input
                type="time"
                value={form.from}
                onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.from ? colors.textPrimary : colors.textTertiary, border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color={colors.textTertiary} />
            </div>
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput }}
            >
              <input
                type="time"
                value={form.to}
                onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.to ? colors.textPrimary : colors.textTertiary, border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color={colors.textTertiary} />
            </div>
          </div>

          {/* Note */}
          <input
            type="text"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Note (optional)"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none mb-4"
            style={{
              border: `1.5px solid ${colors.borderLight}`,
              background: colors.bgInput,
              fontFamily: 'inherit',
              color: colors.textPrimary,
            }}
            onFocus={e => (e.target.style.borderColor = colors.heroBg)}
            onBlur={e => (e.target.style.borderColor = colors.borderLight)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!form.name.trim()}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{
                background: colors.heroBg,
                border: 'none',
                cursor: form.name.trim() ? 'pointer' : 'not-allowed',
                opacity: form.name.trim() ? 1 : 0.6,
              }}
            >
              Add
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(emptyForm); }}
              className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Activity list */}
      <div className="space-y-2">
        {activities.map(act => (
          <ActivityCard
            key={act.id}
            activity={act}
            onDelete={() => onDelete(act.id)}
          />
        ))}
        {activities.length === 0 && !showForm && (
          <p className="text-xs py-2" style={{ color: colors.textTertiary }}>
            No activities yet — click + to add one.
          </p>
        )}
      </div>
    </div>
  );
}

interface CardProps {
  activity: Activity;
  onDelete: () => void;
}

function ActivityCard({ activity, onDelete }: CardProps) {
  const { colors } = useTheme();
  const duration = (() => {
    if (!activity.from || !activity.to) return null;
    const [fh, fm] = activity.from.split(':').map(Number);
    const [th, tm] = activity.to.split(':').map(Number);
    const diff = (th * 60 + tm) - (fh * 60 + fm);
    if (diff <= 0) return null;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3 group"
      style={{
        background: colors.bgSubtle,
        borderLeft: `3px solid ${colors.heroBg}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
            {activity.name}
          </span>
          {activity.from && activity.to && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: colors.bgHover, color: colors.textSecondary }}
            >
              {activity.from} → {activity.to}
              {duration && ` · ${duration}`}
            </span>
          )}
        </div>
        {activity.note && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>
            {activity.note}
          </p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
        style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: colors.textTertiary }}
        onMouseEnter={e => (e.currentTarget.style.color = colors.accent)}
        onMouseLeave={e => (e.currentTarget.style.color = colors.textTertiary)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
