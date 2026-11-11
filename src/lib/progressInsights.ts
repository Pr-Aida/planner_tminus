import type { ProgressResource, ProgressContribution } from '../types';
import { isTimeUnit } from './progress';

export interface ProgressInsights {
  today: { amounts: { unit: string; amount: number }[]; studiedMinutes: number };
  goal: { unit: string; target: number; done: number; pct: number; complete: boolean } | null;
  forecast: { finishDate: string; deltaDays: number | null } | null;
  paceTrend: { unit: string; current: number; previous: number; direction: 'up' | 'down' | 'steady' } | null;
  momentum: { level: 'strong' | 'stable'; activeDays: number } | null;
  bestPace: { unit: string; unitsPerHour: number } | null;
  fastest: { unit: string; amount: number; minutes: number } | null;
}

const DAY_MS = 86400000;
const MIN_SESSIONS = 3;
const MIN_ACTIVE_DAYS = 3;

function parseKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function shiftDate(key: string, days: number): string {
  return new Date(parseKey(key) + days * DAY_MS).toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string): number {
  return Math.round((parseKey(to) - parseKey(from)) / DAY_MS);
}

function remainingOf(resources: ProgressResource[], unit: string): number {
  return resources
    .filter(r => r.unit === unit && r.total > 0)
    .reduce((s, r) => s + Math.max(0, r.total - r.completed), 0);
}

// Picks the unit with the most work left, preferring countable units over time.
function dominantUnit(resources: ProgressResource[]): string | null {
  const remaining = new Map<string, number>();
  for (const r of resources) {
    if (r.total <= 0) continue;
    const rem = Math.max(0, r.total - r.completed);
    if (rem > 0) remaining.set(r.unit, (remaining.get(r.unit) || 0) + rem);
  }
  let best: string | null = null;
  let bestVal = -1;
  for (const [unit, value] of remaining) {
    const bestIsTime = best !== null && isTimeUnit(best);
    const candidateIsTime = isTimeUnit(unit);
    const beats = best === null
      || (bestIsTime && !candidateIsTime)
      || (bestIsTime === candidateIsTime && value > bestVal);
    if (beats) { best = unit; bestVal = value; }
  }
  return best;
}

export function computeInsights(
  resources: ProgressResource[],
  contributions: ProgressContribution[],
  deadlineDate: string | null,
  todayKey: string,
): ProgressInsights {
  const unitById = new Map(resources.map(r => [r.id, r.unit]));
  const unitOf = (c: ProgressContribution) => (c.resource_id ? unitById.get(c.resource_id) ?? null : null);
  const countable = (c: ProgressContribution) => {
    const u = unitOf(c);
    return u !== null && !isTimeUnit(u);
  };
  const inRange = (c: ProgressContribution, from: string, to: string) => c.date_key >= from && c.date_key <= to;
  const weekStart = shiftDate(todayKey, -6);

  const todays = contributions.filter(c => c.date_key === todayKey);
  const amountByUnit = new Map<string, number>();
  for (const c of todays) {
    const u = unitOf(c);
    if (u && !isTimeUnit(u) && c.units_added > 0) amountByUnit.set(u, (amountByUnit.get(u) || 0) + c.units_added);
  }
  const today = {
    amounts: [...amountByUnit].map(([unit, amount]) => ({ unit, amount })),
    studiedMinutes: todays.reduce((s, c) => s + c.duration_minutes, 0),
  };

  const unit = dominantUnit(resources);
  const remaining = unit ? remainingOf(resources, unit) : 0;

  let goal: ProgressInsights['goal'] = null;
  const daysLeft = deadlineDate ? dayDiff(todayKey, deadlineDate) : null;
  if (unit && daysLeft !== null && daysLeft >= 0) {
    const done = todays.filter(c => unitOf(c) === unit).reduce((s, c) => s + c.units_added, 0);
    const dayTotal = remaining + done;
    if (dayTotal > 0) {
      const target = Math.ceil(dayTotal / Math.max(1, daysLeft));
      goal = {
        unit, target, done,
        pct: Math.min(100, Math.round((done / target) * 100)),
        complete: done >= target,
      };
    }
  }

  let forecast: ProgressInsights['forecast'] = null;
  if (unit && remaining > 0) {
    const windowStart = shiftDate(todayKey, -13);
    const recentLogs = contributions.filter(c => unitOf(c) === unit && c.units_added > 0 && inRange(c, windowStart, todayKey));
    const recent = recentLogs.reduce((s, c) => s + c.units_added, 0);
    const loggedDays = new Set(recentLogs.map(c => c.date_key)).size;
    const perDay = recent / 14;
    if (loggedDays >= MIN_ACTIVE_DAYS && perDay > 0) {
      const finishDate = shiftDate(todayKey, Math.ceil(remaining / perDay));
      forecast = {
        finishDate,
        deltaDays: deadlineDate ? dayDiff(finishDate, deadlineDate) : null,
      };
    }
  }

  const paceOf = (from: string, to: string): number | null => {
    if (!unit || isTimeUnit(unit)) return null;
    const timed = contributions.filter(c =>
      unitOf(c) === unit && c.units_added > 0 && c.duration_minutes > 0 && inRange(c, from, to));
    const minutes = timed.reduce((s, c) => s + c.duration_minutes, 0);
    if (minutes < 30) return null;
    return timed.reduce((s, c) => s + c.units_added, 0) / (minutes / 60);
  };
  const current = paceOf(weekStart, todayKey);
  const previous = paceOf(shiftDate(todayKey, -34), shiftDate(todayKey, -7));
  let paceTrend: ProgressInsights['paceTrend'] = null;
  if (unit && current !== null && previous !== null) {
    const ratio = current / previous;
    paceTrend = {
      unit, current, previous,
      direction: ratio > 1.05 ? 'up' : ratio < 0.95 ? 'down' : 'steady',
    };
  }

  const activeDays = new Set(
    contributions
      .filter(c => (c.units_added > 0 || c.duration_minutes > 0) && inRange(c, weekStart, todayKey))
      .map(c => c.date_key)
  ).size;
  const momentum: ProgressInsights['momentum'] = activeDays >= MIN_ACTIVE_DAYS
    ? { level: activeDays >= 5 ? 'strong' : 'stable', activeDays }
    : null;

  const sessions = contributions.filter(c => countable(c) && c.units_added > 0 && c.duration_minutes >= 10);
  let bestPace: ProgressInsights['bestPace'] = null;
  let fastest: ProgressInsights['fastest'] = null;
  const monthSessions = sessions.filter(c => inRange(c, shiftDate(todayKey, -29), todayKey));
  if (monthSessions.length >= MIN_SESSIONS) {
    const best = monthSessions.reduce((b, c) =>
      c.units_added / (c.duration_minutes / 60) > b.units_added / (b.duration_minutes / 60) ? c : b);
    bestPace = { unit: unitOf(best) as string, unitsPerHour: best.units_added / (best.duration_minutes / 60) };
  }
  if (sessions.length >= MIN_SESSIONS) {
    const top = sessions.reduce((b, c) => (c.units_added > b.units_added ? c : b));
    fastest = { unit: unitOf(top) as string, amount: top.units_added, minutes: top.duration_minutes };
  }

  return { today, goal, forecast, paceTrend, momentum, bestPace, fastest };
}
