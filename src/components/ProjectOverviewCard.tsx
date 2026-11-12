import type { useTheme } from '../lib/theme';
import {
  computeProjectStats, formatAmount, formatDuration, formatPair, formatProgressDate,
  isPlanningActive, projectStatusLabel, statusLabel,
} from '../lib/progress';
import type { CalendarMode, ProgressProject } from '../types';

type Colors = ReturnType<typeof useTheme>['colors'];

interface Props {
  project: ProgressProject;
  stats: ReturnType<typeof computeProjectStats>;
  calMode: CalendarMode;
  accentColor: string;
  colors: Colors;
}

function Metric({ label, value, sub, colors }: { label: string; value: string; sub?: string; colors: Colors }) {
  return (
    <div className="rounded-lg p-3" style={{ background: colors.bgInput }}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: colors.textTertiary }}>{label}</p>
      <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>{sub}</p>}
    </div>
  );
}

export default function ProjectOverviewCard({ project, stats, calMode, accentColor, colors }: Props) {
  const planningActive = isPlanningActive(project.status);
  const hasTargets = stats.totalUnits > 0;
  const unit = stats.dominantUnit;
  const remainingUnits = stats.totalUnits - stats.completedUnits;

  let summary = 'No targets set yet';
  if (hasTargets && stats.isMixedUnits) {
    summary = stats.remainingByUnit.map(r => `${formatAmount(r.remaining, r.unit)} left`).join(' · ');
  } else if (hasTargets && unit) {
    summary = remainingUnits > 0
      ? `${formatPair(stats.completedUnits, stats.totalUnits, unit)} · ${formatAmount(remainingUnits, unit)} left`
      : 'Completed';
  }

  const statusValue = planningActive && hasTargets ? statusLabel(stats.status) : projectStatusLabel(project.status);
  const remainingValue = planningActive && stats.estimatedRemainingMinutes !== null
    ? `~${formatDuration(stats.estimatedRemainingMinutes)}`
    : '—';
  const deadlineValue = stats.daysRemaining === null
    ? '—'
    : stats.daysRemaining >= 0 ? `${stats.daysRemaining} days` : planningActive ? 'Overdue' : 'Past';

  const barColor = !planningActive || !hasTargets ? accentColor
    : stats.status === 'on-track' ? colors.success
    : stats.status === 'slightly-behind' ? colors.warning
    : colors.error;

  return (
    <div className="rounded-xl p-6 mb-4" style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}`, boxShadow: `0 2px 12px ${colors.shadow}` }}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Progress" value={hasTargets ? `${stats.overallPct}%` : '—'} colors={colors} />
        <Metric label="Studied" value={formatDuration(stats.studiedMinutes)}
          sub={project.target_study_minutes ? `of ${formatDuration(project.target_study_minutes)}` : undefined} colors={colors} />
        <Metric label="Est. Remaining" value={remainingValue}
          sub={planningActive && stats.pacePerHour !== null && unit ? `${stats.pacePerHour.toFixed(1)} ${unit}/hr` : undefined} colors={colors} />
        <Metric label="Deadline" value={deadlineValue}
          sub={project.deadline_date ? formatProgressDate(project.deadline_date, calMode) : undefined} colors={colors} />
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
          style={{ background: `${barColor}18`, color: barColor }}>{statusValue}</span>
        {planningActive && hasTargets && stats.dailyTargetByUnit.map(t => (
          <span key={t.unit} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: colors.bgInput, color: colors.textSecondary }}>
            Daily target: {formatAmount(t.target, t.unit)}/day
          </span>
        ))}
      </div>

      {hasTargets && (
        <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
          <div className="flex items-end justify-between gap-4 mb-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: colors.textTertiary }}>Overall Progress</p>
              <p className="text-2xl font-bold leading-none" style={{ color: barColor }}>{stats.overallPct}%</p>
            </div>
            <p className="text-xs text-right" style={{ color: colors.textSecondary }}>{summary}</p>
          </div>
          <div className="rounded-full h-3 overflow-hidden" style={{ background: `${barColor}22` }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, stats.overallPct)}%`, background: barColor }} />
          </div>
        </div>
      )}
    </div>
  );
}
