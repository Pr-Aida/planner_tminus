import type { ProgressResource, ProgressContribution } from '../types';

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
  status: 'on-track' | 'slightly-behind' | 'at-risk';
  remainingByUnit: { unit: string; remaining: number }[];
}

export function computeProjectStats(
  resources: ProgressResource[],
  contributions: ProgressContribution[],
  deadlineDate: string | null,
  targetStudyMinutes: number | null
): ProjectStats {
  const totalUnits = resources.reduce((s, r) => s + r.total, 0);
  const completedUnits = resources.reduce((s, r) => s + r.completed, 0);
  const remainingUnits = Math.max(0, totalUnits - completedUnits);
  const overallPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

  const studiedMinutes = contributions.reduce((s, c) => s + c.duration_minutes, 0);

  const remainingByUnit = resources
    .filter(r => r.total > 0)
    .map(r => ({ unit: r.unit, remaining: Math.max(0, r.total - r.completed) }))
    .filter(r => r.remaining > 0);

  const contributedUnits = contributions.reduce((s, c) => s + c.units_added, 0);
  const studiedHours = studiedMinutes / 60;

  const pacePerHour =
    contributedUnits > 0 && studiedHours >= 0.5
      ? contributedUnits / studiedHours
      : null;

  const estimatedRemainingMinutes =
    pacePerHour !== null && remainingUnits > 0
      ? (remainingUnits / pacePerHour) * 60
      : null;

  let daysRemaining: number | null = null;
  if (deadlineDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(deadlineDate + 'T00:00:00');
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
    daysRemaining = diff;
  }

  let dailyTarget: number | null = null;
  if (daysRemaining !== null && daysRemaining > 0 && remainingUnits > 0) {
    dailyTarget = Math.ceil(remainingUnits / daysRemaining);
  }

  let status: ProjectStats['status'] = 'on-track';
  if (daysRemaining !== null && estimatedRemainingMinutes !== null) {
    const availableMinutes = daysRemaining * 120;
    if (estimatedRemainingMinutes > availableMinutes * 1.5) {
      status = 'at-risk';
    } else if (estimatedRemainingMinutes > availableMinutes) {
      status = 'slightly-behind';
    }
  } else if (daysRemaining !== null && daysRemaining <= 3 && remainingUnits > 0) {
    status = remainingUnits > dailyTarget * 2 ? 'at-risk' : 'slightly-behind';
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
    status,
    remainingByUnit,
  };
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
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
  'exercises', 'lectures', 'past papers', 'flashcards', 'hours',
];

export const PROJECT_COLORS = [
  '#2563eb', '#0891b2', '#059669', '#7c3aed',
  '#db2777', '#ea580c', '#d97706', '#dc2626',
];
