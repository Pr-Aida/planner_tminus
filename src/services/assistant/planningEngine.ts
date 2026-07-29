import type { PlanBlock, PlannerContext, WeeklyAnalysis, GoalStep, ResolvedLang } from './types';
import { todayGreg, addDaysGreg, dateKey } from '../../lib/calendar';
import { timeDiffMin } from './priorityScoring';
import { uid } from './memory';

function minToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function daysUntilDate(ctx: PlannerContext, targetKey: string): number {
  const today = dateKey(todayGreg(ctx.profile.timezone));
  const [fy, fm, fd] = today.split('-').map(Number);
  const [ty, tm, td] = targetKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function generateDailyPlan(ctx: PlannerContext): { blocks: PlanBlock[]; totalMinutes: number } {
  const { profile, energy, lang } = ctx;
  const blocks: PlanBlock[] = [];
  const todayActivities = ctx.currentDayData.activities || [];

  let availableMin = profile.availableHoursPerDay * 60;
  if (energy === 'low') availableMin = Math.min(availableMin, 120);
  if (energy === 'high') availableMin = Math.min(availableMin + 30, profile.maxDailyStudy);

  const subjects = new Set<string>();
  todayActivities.forEach(a => subjects.add(a.name));
  profile.difficultSubjects.forEach(s => subjects.add(s));
  profile.upcomingExams.forEach(e => subjects.add(e.subject));
  if (subjects.size === 0) subjects.add(lang === 'fa' ? 'مطالعه' : 'Study');

  let sessionMin = profile.sessionDuration;
  if (energy === 'low') sessionMin = Math.min(sessionMin, 25);
  if (energy === 'high') sessionMin = Math.min(sessionMin + 15, 60);
  const breakMin = profile.breakDuration;

  const [wakeH, wakeM] = profile.wakeTime.split(':').map(Number);
  let currentMin = wakeH * 60 + wakeM;

  const subjectList = [...subjects];
  if (energy === 'low') {
    subjectList.sort((a, b) => {
      const aDiff = profile.difficultSubjects.includes(a) ? 1 : 0;
      const bDiff = profile.difficultSubjects.includes(b) ? 1 : 0;
      return aDiff - bDiff;
    });
  } else {
    subjectList.sort((a, b) => {
      const aExam = profile.upcomingExams.find(e => e.subject === a) ? 0 : 1;
      const bExam = profile.upcomingExams.find(e => e.subject === b) ? 0 : 1;
      return aExam - bExam;
    });
  }

  let scheduledMin = 0;
  let blockIndex = 0;
  const maxBlocks = energy === 'low' ? 3 : energy === 'high' ? 6 : 4;

  for (const subject of subjectList) {
    if (scheduledMin + sessionMin > availableMin) break;
    if (blockIndex >= maxBlocks) break;

    const start = minToTime(currentMin);
    currentMin += sessionMin;
    const end = minToTime(currentMin);
    scheduledMin += sessionMin;

    const exam = profile.upcomingExams.find(e => e.subject === subject);
    const isDifficult = profile.difficultSubjects.includes(subject);
    let reason = '';
    if (exam) {
      const d = daysUntilDate(ctx, exam.dateKey);
      reason = lang === 'fa' ? `امتحان ${exam.subject} در ${d} روز` : `Exam in ${d} days`;
    } else if (isDifficult) {
      reason = lang === 'fa' ? 'درس دشوار — زمان با انرژی بالا' : 'Difficult subject — high energy slot';
    } else {
      reason = lang === 'fa' ? 'مرور و تمرین' : 'Review and practice';
    }

    blocks.push({ id: uid(), subject, start, end, durationMin: sessionMin, priority: exam ? 'high' : isDifficult ? 'medium' : 'low', reason, type: 'study' });

    if (scheduledMin + breakMin <= availableMin && blockIndex < maxBlocks - 1) {
      const bStart = minToTime(currentMin);
      currentMin += breakMin;
      const bEnd = minToTime(currentMin);
      scheduledMin += breakMin;
      blocks.push({ id: uid(), subject: lang === 'fa' ? 'استراحت' : 'Break', start: bStart, end: bEnd, durationMin: breakMin, priority: 'low', reason: lang === 'fa' ? 'استراحت کوتاه' : 'Short break', type: 'break' });
    }
    blockIndex++;
  }

  if (energy !== 'low' && scheduledMin + 20 <= availableMin) {
    const rStart = minToTime(currentMin);
    currentMin += 20;
    const rEnd = minToTime(currentMin);
    blocks.push({ id: uid(), subject: lang === 'fa' ? 'مرور روز' : 'Daily review', start: rStart, end: rEnd, durationMin: 20, priority: 'low', reason: lang === 'fa' ? 'مرور مطالب روز' : 'Review what was studied', type: 'review' });
  }

  return { blocks, totalMinutes: scheduledMin };
}

export function generateWeeklyPlan(ctx: PlannerContext): { blocks: PlanBlock[]; totalMinutes: number } {
  const { profile, lang } = ctx;
  const blocks: PlanBlock[] = [];
  const subjects = new Set<string>();
  profile.difficultSubjects.forEach(s => subjects.add(s));
  profile.upcomingExams.forEach(e => subjects.add(e.subject));
  if (subjects.size === 0) subjects.add(lang === 'fa' ? 'مطالعه' : 'Study');

  const subjectList = [...subjects];
  const today = todayGreg(profile.timezone);
  let totalMin = 0;
  const sessionMin = profile.sessionDuration;
  const breakMin = profile.breakDuration;

  let dayCount = 0;
  for (let d = 0; d < 7 && dayCount < 5; d++) {
    const dayDate = addDaysGreg(today, d);
    const dayKey = dateKey(dayDate);
    if (profile.daysOff.includes(dayKey)) continue;
    if (!profile.weekendAvailable && (d === 5 || d === 6)) continue;

    const [wakeH, wakeM] = profile.wakeTime.split(':').map(Number);
    let currentMin = wakeH * 60 + wakeM + 120;

    const startIdx = (dayCount * 2) % subjectList.length;
    const subjectsForDay = subjectList.slice(startIdx, startIdx + 2);
    for (const subject of subjectsForDay) {
      if (totalMin + sessionMin > profile.maxDailyStudy * 5) break;
      const start = minToTime(currentMin);
      currentMin += sessionMin;
      const end = minToTime(currentMin);
      totalMin += sessionMin;

      const exam = profile.upcomingExams.find(e => e.subject === subject);
      blocks.push({ id: uid(), subject, start, end, durationMin: sessionMin, priority: exam ? 'high' : 'medium', reason: exam ? (lang === 'fa' ? 'امتحان نزدیک' : 'Exam approaching') : (lang === 'fa' ? 'جلسه مطالعه' : 'Study session'), type: 'study' });

      const bStart = minToTime(currentMin);
      currentMin += breakMin;
      const bEnd = minToTime(currentMin);
      blocks.push({ id: uid(), subject: lang === 'fa' ? 'استراحت' : 'Break', start: bStart, end: bEnd, durationMin: breakMin, priority: 'low', reason: '', type: 'break' });
    }
    dayCount++;
  }

  return { blocks, totalMinutes: totalMin };
}

export function analyzeWeekly(ctx: PlannerContext): WeeklyAnalysis {
  const { weeklyData, lang } = ctx;
  const totalMinutes = weeklyData.reduce((sum, d) => sum + d.activityHours * 60 + d.habitHours * 60, 0);
  const perSubject: Record<string, number> = {};
  for (const a of ctx.currentDayData.activities) {
    if (a.from && a.to) perSubject[a.name] = (perSubject[a.name] || 0) + timeDiffMin(a.from, a.to);
  }

  const activeDays = weeklyData.filter(d => d.activityHours > 0).length;
  const consistency = weeklyData.length > 0 ? activeDays / weeklyData.length : 0;
  const sessions = ctx.currentDayData.activities.filter(a => a.from && a.to);
  const avgSessionMin = sessions.length > 0 ? sessions.reduce((s, a) => s + timeDiffMin(a.from, a.to), 0) / sessions.length : 0;

  const subjectEntries = Object.entries(perSubject);
  const mostStudied = subjectEntries.length > 0 ? subjectEntries.sort((a, b) => b[1] - a[1])[0][0] : null;
  const leastStudied = subjectEntries.length > 1 ? subjectEntries.sort((a, b) => a[1] - b[1])[0][0] : null;

  const dayEntries = weeklyData.map(d => ({ label: d.label, hours: d.activityHours }));
  const strongestDay = dayEntries.length > 0 ? dayEntries.sort((a, b) => b.hours - a.hours)[0].label : null;
  const weakestDay = dayEntries.length > 0 ? dayEntries.sort((a, b) => a.hours - b.hours)[0].label : null;

  const overdueTasks = ctx.reminders.filter(r => r.status === 'pending' && r.date_key < dateKey(todayGreg(ctx.profile.timezone))).length;

  const observations: string[] = [];
  const recommendations: string[] = [];

  if (totalMinutes > 0) {
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    observations.push(lang === 'fa' ? `کل زمان مطالعه: ${hrs} ساعت و ${mins} دقیقه` : `Total study time: ${hrs}h ${mins}m`);
  }
  if (mostStudied) observations.push(lang === 'fa' ? `بیشترین زمان: ${mostStudied} (${Math.floor(perSubject[mostStudied] / 60)} ساعت)` : `Most studied: ${mostStudied} (${Math.floor(perSubject[mostStudied] / 60)}h)`);
  if (leastStudied && leastStudied !== mostStudied) observations.push(lang === 'fa' ? `کمترین زمان: ${leastStudied} (${Math.floor(perSubject[leastStudied] / 60)} ساعت)` : `Least studied: ${leastStudied} (${Math.floor(perSubject[leastStudied] / 60)}h)`);
  if (strongestDay) observations.push(lang === 'fa' ? `بهترین روز: ${strongestDay}` : `Most productive day: ${strongestDay}`);
  if (weakestDay) observations.push(lang === 'fa' ? `ضعیف‌ترین روز: ${weakestDay}` : `Least productive day: ${weakestDay}`);
  if (overdueTasks > 0) observations.push(lang === 'fa' ? `${overdueTasks} کار عقب‌افتاده` : `${overdueTasks} overdue task(s)`);
  observations.push(lang === 'fa' ? `نظم: ${Math.round(consistency * 100)}%` : `Consistency: ${Math.round(consistency * 100)}%`);

  if (leastStudied && mostStudied && perSubject[leastStudied] < perSubject[mostStudied] * 0.3) {
    recommendations.push(lang === 'fa' ? `به ${leastStudied} توجه بیشتری بده — یک جلسه ۳۰ دقیقه‌ای اضافه کن` : `Add more ${leastStudied} sessions — try one 30-min block`);
  }
  if (consistency < 0.5) recommendations.push(lang === 'fa' ? `سعی کن هر روز حداقل یک جلسه کوتاه داشته باشی` : `Aim for at least one short session every day`);
  if (avgSessionMin > 0 && avgSessionMin < 45) recommendations.push(lang === 'fa' ? `جلسات کوتاه برایت موثرتر بوده — ادامه بده` : `Shorter sessions work well for you — keep it up`);
  else if (avgSessionMin > 90) recommendations.push(lang === 'fa' ? `جلسات طولانی‌اند — استراحت‌های بیشتری بگذار` : `Sessions are long — add more breaks`);
  if (overdueTasks > 0) recommendations.push(lang === 'fa' ? `کارهای عقب‌افتاده را اولویت‌بندی کن` : `Prioritize your overdue tasks`);

  return { totalMinutes, perSubject, completionRate: consistency, missedSessions: weeklyData.filter(d => d.activityHours === 0).length, mostStudied, leastStudied, strongestDay, weakestDay, overdueTasks, consistency, avgSessionMin, observations, recommendations, lang };
}

export function breakDownGoal(_goal: string, lang: ResolvedLang): GoalStep[] {
  const isFa = lang === 'fa';
  const titles = isFa
    ? ['بررسی مباحث', 'مشخص کردن نقاط ضعف', 'مرور مطالب', 'تمرین و حل مسئله', 'آزمون آزمایشی', 'بررسی اشتباهات', 'مرور نهایی']
    : ['Review syllabus', 'Identify weak areas', 'Review notes', 'Practice questions', 'Mock exam', 'Review mistakes', 'Final revision'];
  return titles.map((title, i) => ({ id: uid(), title, estimatedMin: i === 3 || i === 4 ? 90 : 45, priority: i < 3 ? 'high' : i < 5 ? 'medium' : 'low' as const }));
}
