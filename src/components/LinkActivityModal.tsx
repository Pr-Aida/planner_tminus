import { useEffect, useMemo, useState } from 'react';
import { X, Link2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { upsertContribution, calcDurationMinutes } from '../lib/progressSync';
import { formatDuration, formatProgressDate } from '../lib/progress';
import type { Activity, CalendarMode, ProgressContribution, ProgressProject, ProgressResource } from '../types';

interface DatedActivity {
  dateKey: string;
  activity: Activity;
}

interface Props {
  project: ProgressProject;
  resources: ProgressResource[];
  contributions: ProgressContribution[];
  calMode: CalendarMode;
  onLinked: () => void;
  onClose: () => void;
  colors: { textPrimary: string; textSecondary: string; textTertiary: string; bgCard: string; bgInput: string; bgHover: string; borderLight: string; accent: string; heroBg: string; overlay: string; shadow: string };
}

export default function LinkActivityModal({ project, resources, contributions, calMode, onLinked, onClose, colors }: Props) {
  const [activities, setActivities] = useState<DatedActivity[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<DatedActivity | null>(null);
  const [resourceId, setResourceId] = useState('');
  const [units, setUnits] = useState('');
  const [saving, setSaving] = useState(false);

  const linkedIds = useMemo(() => new Set(contributions.map(c => c.activity_id)), [contributions]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('planner_daily')
      .select('date_key, activities')
      .order('date_key', { ascending: false })
      .limit(120)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setLoadError(true); return; }
        const flat: DatedActivity[] = [];
        for (const row of (data || []) as { date_key: string; activities: Activity[] | null }[]) {
          for (const act of row.activities || []) flat.push({ dateKey: row.date_key, activity: act });
        }
        setActivities(flat);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    await upsertContribution({
      activityId: selected.activity.id,
      projectId: project.id,
      resourceId: resourceId || null,
      unitsAdded: parseInt(units) || 0,
      dateKey: selected.dateKey,
      durationMinutes: calcDurationMinutes(selected.activity.from, selected.activity.to),
    });
    setSaving(false);
    onLinked();
    onClose();
  }

  const inputStyle = { border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: colors.overlay }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl p-6 max-h-[85vh] flex flex-col" style={{ background: colors.bgCard, boxShadow: `0 12px 40px ${colors.shadow}` }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: colors.accent }}>
            <Link2 size={12} /> Link Existing Activity
          </span>
          <button onClick={onClose} className="p-1 rounded transition-opacity hover:opacity-70"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textTertiary }}>
            <X size={16} />
          </button>
        </div>

        {loadError && <p className="text-xs" style={{ color: colors.textSecondary }}>Couldn't load your activities. Try again later.</p>}
        {!loadError && activities === null && <p className="text-xs" style={{ color: colors.textTertiary }}>Loading activities...</p>}
        {activities && activities.length === 0 && <p className="text-xs" style={{ color: colors.textTertiary }}>No activities found yet.</p>}

        {activities && activities.length > 0 && !selected && (
          <div className="overflow-y-auto flex flex-col gap-1.5">
            {activities.map(item => {
              const isLinked = linkedIds.has(item.activity.id);
              return (
                <button key={`${item.dateKey}-${item.activity.id}`} disabled={isLinked}
                  onClick={() => setSelected(item)}
                  className="text-left rounded-lg px-3 py-2.5 transition-colors hover:opacity-80"
                  style={{ background: colors.bgInput, border: 'none', cursor: isLinked ? 'not-allowed' : 'pointer', opacity: isLinked ? 0.5 : 1 }}>
                  <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>{item.activity.name}</p>
                  <p className="text-[11px]" style={{ color: colors.textTertiary }}>
                    {formatProgressDate(item.dateKey, calMode)} · {formatDuration(calcDurationMinutes(item.activity.from, item.activity.to))}
                    {isLinked ? ' · Already linked' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium" style={{ color: colors.textPrimary }}>{selected.activity.name}</p>
            <label className="text-xs font-semibold block" style={{ color: colors.textSecondary }}>
              Resource (optional)
              <select value={resourceId} onChange={e => setResourceId(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mt-1.5" style={inputStyle}>
                <option value="">No resource</option>
                {resources.map(r => <option key={r.id} value={r.id}>{r.name} ({r.unit})</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold block" style={{ color: colors.textSecondary }}>
              Output added (optional)
              <input type="number" min="0" value={units} onChange={e => setUnits(e.target.value)} placeholder="0"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none mt-1.5" style={inputStyle} />
            </label>
            <div className="flex gap-3 mt-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white transition-opacity"
                style={{ background: colors.heroBg, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                Link Activity
              </button>
              <button onClick={() => setSelected(null)}
                className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                style={{ background: colors.bgHover, color: colors.textPrimary, border: 'none', cursor: 'pointer' }}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
