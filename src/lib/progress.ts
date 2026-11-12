import type { ProgressResource, ProgressContribution, CalendarMode } from '../types';
import { gregorianToSh, SH_MONTHS, GREG_MONTH_NAMES } from './calendar';

export interface ProjectStats {
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  overallPct: number;
  studiedMinutes: number;
  estimatedRemainingMinutes: number | null;
  pacePerHour: number | null;
  daysRemaining: number | null;
  dailyTarget: number | null;
  dailyTargetByUnit: { unit: string; target: number }[];
  status: 'on-track' | 'slightly-behind' | 'at-risk';
  remainingByUnit: { unit: string; remaining: number }[];
  dominantUnit: string | null;
  isMixedUnits: boolean;
}

function pickDominantUnit(resources: ProgressResource[]): string | null {
  const unitTotals = new Map<string, number>();
  for (const r of resources) {
    if (r.total <= 0) continue;
    unitTotals.set(r.unit, (unitTotals.get(r.unit) || 0) + r.total);
  }
  if (unitTotals.size === 0) return null;
  if (unitTotals.size === 1) return unitTotals.keys().next().value ?? null;
  let best: string | null = null;
  let bestTotal = 0;
  for (const [unit, total] of unitTotals) {
    if (total > bestTotal) { best = unit; bestTotal = total; }
  }
  return best;
}

// Legacy quick logs with no resource cannot be attributed and are excluded. Activity
// contributions with no specific resource are kept for Studied Time only.
export function attributableContributions(
  resources: ProgressResource[],
  contributions: ProgressContribution[]
): ProgressContribution[] {
  const resourceIds = new Set(resources.map(r => r.id));
  return contributions.filter(c =>
    c.resource_id ? resourceIds.has(c.resource_id) : !c.activity_id.startsWith('manual-')
  );
}

export function computeOverallPct(resources: ProgressResource[]): number | null {
  const withTarget = resources.filter(r => Number.isFinite(r.total) && r.total > 0);
  if (withTarget.length === 0) return null;
  const sum = withTarget.reduce((s, r) => {
    const pct = Math.min(1, Math.max(0, r.completed / r.total));
    return s + pct;
  }, 0);
  return Math.round((sum / withTarget.length) * 100);
}

export function dailyTargetFor(remaining: number, daysRemaining: number | null): number | null {
  if (daysRemaining === null || daysRemaining <= 0 || remaining <= 0) return null;
  return Math.ceil(remaining / daysRemaining);
}

export function computeProjectStats(
  resources: ProgressResource[],
  contributions: ProgressContribution[],
  deadlineDate: string | null,
  _targetStudyMinutes: number | null
): ProjectStats {
  // Guard against malformed data
  const safeResources = resources.map(r => ({
    ...r,
    total: Number.isFinite(r.total) ? r.total : 0,
    completed: Number.isFinite(r.completed) ? r.completed : 0,
  }));
  const safeContribs = attributableContributions(resources, contributions).map(c => ({
    ...c,
    units_added: Number.isFinite(c.units_added) ? c.units_added : 0,
    duration_minutes: Number.isFinite(c.duration_minutes) ? c.duration_minutes : 0,
  }));

  const targeted = safeResources.filter(r => r.total > 0);
  const totalUnits = targeted.reduce((s, r) => s + r.total, 0);
  const completedUnits = targeted.reduce((s, r) => s + Math.min(r.completed, r.total), 0);
  const remainingUnits = targeted.reduce((s, r) => s + Math.max(0, r.total - r.completed), 0);
  const overallPct = computeOverallPct(safeResources) ?? 0;

  // Studied Time = real study minutes. Time Quick Logs store minutes in
  // duration_minutes; count-unit Quick Logs store 0, so they add nothing.
  const studiedMinutes = safeContribs.reduce((s, c) => s + c.duration_minutes, 0);

  const remainingByUnitMap = new Map<string, number>();
  for (const r of safeResources) {
    if (r.total <= 0) continue;
    const rem = Math.max(0, r.total - r.completed);
    if (rem > 0) remainingByUnitMap.set(r.unit, (remainingByUnitMap.get(r.unit) || 0) + rem);
  }
  const remainingByUnit = [...remainingByUnitMap].map(([unit, remaining]) => ({ unit, remaining }));

  const isMixedUnits = remainingByUnitMap.size > 1;

  const contributedUnits = safeContribs.filter(c => !!c.resource_id).reduce((s, c) => s + c.units_added, 0);
  const studiedHours = studiedMinutes / 60;

  const pacePerHour =
    contributedUnits > 0 && studiedHours >= 0.5 && Number.isFinite(studiedHours)
      ? contributedUnits / studiedHours
      : null;

  const estimatedRemainingMinutes =
    pacePerHour !== null && remainingUnits > 0 && Number.isFinite(pacePerHour) && pacePerHour > 0
      ? (remainingUnits / pacePerHour) * 60
      : null;

  let daysRemaining: number | null = null;
  if (deadlineDate && /^\d{4}-\d{2}-\d{2}$/.test(deadlineDate)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineDate + 'T00:00:00');
    if (!isNaN(deadline.getTime())) {
      const diff = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
      daysRemaining = diff;
    }
  }

  const dailyTarget = dailyTargetFor(remainingUnits, daysRemaining);
  const dailyTargetByUnit = [...remainingByUnitMap].flatMap(([unit, remaining]) => {
    const target = dailyTargetFor(remaining, daysRemaining);
    return target === null ? [] : [{ unit, target }];
  });

  let status: ProjectStats['status'] = 'on-track';
  if (daysRemaining !== null && estimatedRemainingMinutes !== null) {
    const availableMinutes = daysRemaining * 120;
    if (estimatedRemainingMinutes > availableMinutes * 1.5) {
      status = 'at-risk';
    } else if (estimatedRemainingMinutes > availableMinutes) {
      status = 'slightly-behind';
    }
  } else if (daysRemaining !== null && daysRemaining <= 3 && remainingUnits > 0) {
    status = remainingUnits > (dailyTarget ?? 0) * 2 ? 'at-risk' : 'slightly-behind';
  }

  return {
    totalUnits,
    completedUnits,
    remainingUnits,
    overallPct,
    studiedMinutes,
    estimatedRemainingMinutes,
    pacePerHour,
    daysRemaining,
    dailyTarget,
    dailyTargetByUnit,
    status,
    remainingByUnit,
    dominantUnit: pickDominantUnit(safeResources),
    isMixedUnits,
  };
}

export function formatProgressDate(isoDate: string, calMode: CalendarMode): string {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const parts = isoDate.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;
  try {
    if (calMode === 'gregorian') return `${GREG_MONTH_NAMES[month - 1]} ${day}, ${year}`;
    const sh = gregorianToSh({ year, month, day });
    return `${SH_MONTHS[sh.month - 1].name} ${sh.day}, ${sh.year}`;
  } catch {
    return isoDate;
  }
}

export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function statusLabel(status: ProjectStats['status']): string {
  switch (status) {
    case 'on-track': return 'On Track';
    case 'slightly-behind': return 'Slightly Behind';
    case 'at-risk': return 'At Risk';
  }
}

export function statusColor(status: ProjectStats['status']): string {
  switch (status) {
    case 'on-track': return 'success';
    case 'slightly-behind': return 'warning';
    case 'at-risk': return 'error';
  }
}

export const UNIT_OPTIONS = [
  'pages', 'slides', 'videos', 'chapters', 'questions',
  'exercises', 'lectures', 'past papers', 'flashcards', 'hours', 'custom',
];

const SINGLE_STEP_UNITS = ['videos', 'chapters', 'lectures', 'past papers'];

export function isTimeUnit(unit: string | null | undefined): boolean {
  return !!unit && unit.toLowerCase() === 'hours';
}

export function formatAmount(value: number, unit: string | null | undefined): string {
  return isTimeUnit(unit) ? formatDuration(value) : `${value} ${unit || 'units'}`;
}

export function formatPair(done: number, total: number, unit: string | null | undefined): string {
  return isTimeUnit(unit)
    ? `${formatDuration(done)} / ${formatDuration(total)}`
    : `${done} / ${total} ${unit || 'units'}`;
}

// Time-based resources are stored in whole minutes; add-resource targets accept hours.
export function normalizeDigits(input: string): string {
  return input.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
}

export function toStoredAmount(input: string, unit: string): number {
  const value = parseFloat(normalizeDigits(input)) || 0;
  if (isTimeUnit(unit)) return Math.max(0, Math.round(value * 60));
  return Math.max(0, Math.round(value));
}

export function parseTimeInput(input: string): number {
  const value = normalizeDigits(input).trim().toLowerCase();
  if (!value) return 0;
  const hours = value.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*m/);
  if (hours || minutes) {
    return Math.max(0, Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0)));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

export function toEditableAmount(stored: number, unit: string): string {
  return isTimeUnit(unit) ? formatDuration(stored) : String(stored);
}

export function getQuickAddButtons(unit: string): { label: string; amount: number }[] {
  if (isTimeUnit(unit)) return [{ label: '+15m', amount: 15 }, { label: '+30m', amount: 30 }, { label: '+1h', amount: 60 }];
  const u = (unit || '').toLowerCase();
  if (SINGLE_STEP_UNITS.includes(u)) return [{ label: '+1', amount: 1 }];
  return [1, 5, 10].map(n => ({ label: `+${n}`, amount: n }));
}

export const PROJECT_COLORS = [
  '#2563eb', '#0891b2', '#059669', '#7c3aed',
  '#db2777', '#ea580c', '#d97706', '#dc2626',
];

// ─── Manual Project Status ────────────────────────────────────────────────────

export const PROJECT_STATUS_OPTIONS = [
  'not_started', 'in_progress', 'completed', 'on_hold', 'archived',
] as const;

export function projectStatusLabel(status: string): string {
  switch (status) {
    case 'not_started': return 'Not Started';
    case 'in_progress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'on_hold': return 'On Hold';
    case 'archived': return 'Archived';
    default: return 'In Progress';
  }
}

export function projectStatusColorKey(status: string): 'success' | 'warning' | 'error' | 'accent' | 'textTertiary' {
  switch (status) {
    case 'completed': return 'success';
    case 'on_hold': return 'warning';
    case 'not_started': return 'textTertiary';
    case 'archived': return 'textTertiary';
    default: return 'accent';
  }
}

export function isPlanningActive(status: string): boolean {
  return status === 'in_progress';
}
