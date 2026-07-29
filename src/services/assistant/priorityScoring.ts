import type { Activity } from '../../types';
import type { PlannerContext } from './types';
import { todayGreg, dateKey } from '../../lib/calendar';

export interface PriorityInput {
  subject: string;
  deadlineKey?: string;
  examKey?: string;
  userPriority?: 'high' | 'medium' | 'low';
  weeklyDeficitMin?: number;
  overdue?: boolean;
  difficulty?: number;
  lastStudiedDaysAgo?: number;
  estimatedMin?: number;
}

export interface ScoredItem {
  subject: string;
  score: number;
  reasons: string[];
}

export const WEIGHTS = {
  deadlineUrgency: 30,
  examProximity: 25,
  userPriority: 15,
  weeklyDeficit: 15,
  difficulty: 10,
  overdue: 20,
  timeCompatibility: 10,
  energyCompatibility: 10,
};

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function scorePriority(input: PriorityInput, ctx: PlannerContext): ScoredItem {
  const reasons: string[] = [];
  let score = 0;
  const today = dateKey(todayGreg(ctx.profile.timezone));

  if (input.deadlineKey) {
    const d = daysBetween(today, input.deadlineKey);
    if (d <= 0) { score += WEIGHTS.deadlineUrgency; reasons.push('deadline is today or past'); }
    else if (d <= 1) { score += WEIGHTS.deadlineUrgency * 0.9; reasons.push('deadline within 1 day'); }
    else if (d <= 3) { score += WEIGHTS.deadlineUrgency * 0.7; reasons.push(`deadline in ${d} days`); }
    else if (d <= 7) { score += WEIGHTS.deadlineUrgency * 0.4; reasons.push(`deadline in ${d} days`); }
  }

  if (input.examKey) {
    const d = daysBetween(today, input.examKey);
    if (d <= 0) { score += WEIGHTS.examProximity; reasons.push('exam is today'); }
    else if (d <= 3) { score += WEIGHTS.examProximity * 0.9; reasons.push(`exam in ${d} days`); }
    else if (d <= 7) { score += WEIGHTS.examProximity * 0.6; reasons.push(`exam in ${d} days`); }
    else if (d <= 14) { score += WEIGHTS.examProximity * 0.3; reasons.push(`exam in ${d} days`); }
  }

  if (input.userPriority === 'high') { score += WEIGHTS.userPriority; reasons.push('marked high priority'); }
  else if (input.userPriority === 'medium') { score += WEIGHTS.userPriority * 0.6; reasons.push('marked medium priority'); }

  if (input.weeklyDeficitMin && input.weeklyDeficitMin > 0) {
    const ratio = Math.min(1, input.weeklyDeficitMin / 120);
    score += WEIGHTS.weeklyDeficit * ratio;
    reasons.push(`${input.weeklyDeficitMin}min below weekly target`);
  }

  if (input.difficulty) {
    score += Math.min(1, input.difficulty / 5) * WEIGHTS.difficulty;
    if (input.difficulty >= 4) reasons.push('high difficulty');
  }

  if (input.overdue) { score += WEIGHTS.overdue; reasons.push('overdue'); }

  const availableMin = ctx.profile.availableHoursPerDay * 60;
  if (input.estimatedMin && input.estimatedMin <= availableMin) {
    score += WEIGHTS.timeCompatibility; reasons.push('fits available time');
  } else if (input.estimatedMin && input.estimatedMin <= availableMin * 1.5) {
    score += WEIGHTS.timeCompatibility * 0.5;
  }

  if (ctx.energy === 'high' && input.difficulty && input.difficulty >= 4) {
    score += WEIGHTS.energyCompatibility; reasons.push('high energy suits difficult task');
  } else if (ctx.energy === 'low' && (!input.difficulty || input.difficulty <= 2)) {
    score += WEIGHTS.energyCompatibility * 0.8; reasons.push('low energy suits easier task');
  } else if (ctx.energy === 'medium') {
    score += WEIGHTS.energyCompatibility * 0.5;
  }

  return { subject: input.subject, score: Math.round(score), reasons };
}

export function extractSubjects(activities: Activity[]): string[] {
  const subjects = new Set<string>();
  for (const a of activities) { if (a.name && a.name.trim()) subjects.add(a.name.trim()); }
  return [...subjects];
}

export function timeDiffMin(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  return (th * 60 + tm) - (fh * 60 + fm);
}
