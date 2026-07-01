import { useState } from 'react';
import { Plus, Trash2, Clock } from 'lucide-react';
import type { Activity } from '../types';

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
      style={{ background: '#fff', boxShadow: '0 2px 12px rgba(27,42,74,0.10)' }}
    >
      {/* Card title row */}
      <div className="flex items-center mb-4">
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#7B1C3E' }}
        >
          Activities
        </span>
        <div className="flex-1 h-px ml-3" style={{ background: '#F5E6EC' }} />
        <button
          onClick={() => { setShowForm(true); setForm(emptyForm); }}
          className="ml-3 flex items-center justify-center rounded-lg w-7 h-7 transition-opacity hover:opacity-80"
          style={{ background: '#1B2A4A', border: 'none', cursor: 'pointer' }}
          title="Add activity"
        >
          <Plus size={14} color="#fff" />
        </button>
      </div>

      {/* Add form — matches the reference image */}
      {showForm && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ background: '#F8F9FC', border: '1px solid #E8EBF4' }}
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
              border: '1.5px solid #E8EBF4',
              background: '#fff',
              fontFamily: 'inherit',
              color: '#111',
            }}
            onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
            onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
          />

          {/* Time inputs */}
          <div className="flex gap-3 mb-3">
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: '1.5px solid #E8EBF4', background: '#fff' }}
            >
              <input
                type="time"
                value={form.from}
                onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.from ? '#1B2A4A' : '#C8C8C8', border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color="#C8C8C8" />
            </div>
            <div
              className="flex-1 flex items-center rounded-lg px-3 gap-2"
              style={{ border: '1.5px solid #E8EBF4', background: '#fff' }}
            >
              <input
                type="time"
                value={form.to}
                onChange={e => setForm(f => ({ ...f, to: e.target.value }))}
                className="flex-1 text-sm py-2.5 outline-none bg-transparent"
                style={{ color: form.to ? '#1B2A4A' : '#C8C8C8', border: 'none', fontFamily: 'inherit' }}
              />
              <Clock size={14} color="#C8C8C8" />
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
              border: '1.5px solid #E8EBF4',
              background: '#fff',
              fontFamily: 'inherit',
              color: '#111',
            }}
            onFocus={e => (e.target.style.borderColor = '#1B2A4A')}
            onBlur={e => (e.target.style.borderColor = '#E8EBF4')}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!form.name.trim()}
              className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
              style={{
                background: '#1B2A4A',
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
              style={{ background: '#E8EBF4', color: '#1B2A4A', border: 'none', cursor: 'pointer' }}
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
          <p className="text-xs py-2" style={{ color: '#C8C8C8' }}>
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
        background: '#F2F4F8',
        borderLeft: '3px solid #1B2A4A',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: '#1B2A4A' }}>
            {activity.name}
          </span>
          {activity.from && activity.to && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: '#E8EBF4', color: '#253660' }}
            >
              {activity.from} → {activity.to}
              {duration && ` · ${duration}`}
            </span>
          )}
        </div>
        {activity.note && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#6B6B6B' }}>
            {activity.note}
          </p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
        style={{ border: 'none', cursor: 'pointer', background: 'transparent', color: '#C8C8C8' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#7B1C3E')}
        onMouseLeave={e => (e.currentTarget.style.color = '#C8C8C8')}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
