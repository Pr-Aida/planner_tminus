import type { PlannerContext, ReminderSuggestion } from './types';
import { analyzeMemory } from './memory';

// ─── Reminder suggestions ────────────────────────────────────────────────────

export function suggestReminders(ctx: PlannerContext): ReminderSuggestion[] {
  const suggestions: ReminderSuggestion[] = [];
  const lang = ctx.lang;

  // Check reminders that have no alert set (offset 0)
  for (const r of ctx.reminders) {
    if (r.status === 'pending') {
      suggestions.push({
        title: r.title,
        dateKey: r.date_key,
        dateDisplay: r.date_key,
        reason: lang === 'fa' ? 'این یادآور هنوز بدون هشدار است.' : 'This reminder has no alert set.',
        offsetOptions: [0, 1, 3, 7],
      });
    }
  }

  // Suggest study session reminders from memory
  const analysis = analyzeMemory();
  if (analysis.topHours.length > 0 && analysis.consistency < 0.7) {
    const topHour = analysis.topHours[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateKeyStr = tomorrow.toISOString().slice(0, 10);
    suggestions.push({
      title: lang === 'fa' ? 'جلسه مطالعه' : 'Study session',
      dateKey: dateKeyStr,
      dateDisplay: dateKeyStr,
      reason: lang === 'fa'
        ? `معمولاً ساعت ${topHour} فعال هستی. یک یادآور مطالعه برای فردا تنظیم کن.`
        : `You're usually active at ${topHour}:00. Set a study reminder for tomorrow.`,
      offsetOptions: [1, 3],
    });
  }

  return suggestions.slice(0, 5);
}

// ─── Recommendations ────────────────────────────────────────────────────────

export interface Recommendation {
  text: string;
  action?: string;
}

export function generateRecommendations(ctx: PlannerContext): Recommendation[] {
  const recs: Recommendation[] = [];
  const analysis = analyzeMemory();
  const lang = ctx.lang;

  // Subject deficit
  const subjects = Object.keys(analysis.perSubject);
  if (subjects.length >= 2) {
    const sorted = subjects.sort((a, b) => (analysis.perSubject[a] || 0) - (analysis.perSubject[b] || 0));
    const least = sorted[0];
    const most = sorted[sorted.length - 1];
    const leastMin = analysis.perSubject[least] || 0;
    const mostMin = analysis.perSubject[most] || 0;
    if (mostMin > leastMin * 2) {
      recs.push({
        text: lang === 'fa'
          ? `${least} این هفته کمتر از بقیه خوانده شده (${Math.floor(leastMin / 60)}س ${leastMin % 60}د). دو جلسه ۴۵ دقیقه‌ای اضافه کن.`
          : `${least} received less attention this week (${Math.floor(leastMin / 60)}h ${leastMin % 60}m). Add two 45-minute sessions.`,
      });
    }
  }

  // Consistency
  if (analysis.consistency < 0.4) {
    recs.push({
      text: lang === 'fa'
        ? 'نظم مطالعه پایین است. سعی کن هر روز حداقل ۳۰ دقیقه کار کنی.'
        : 'Study consistency is low. Aim for at least 30 minutes each day.',
    });
  }

  // Completion rate
  if (analysis.completionRate > 0 && analysis.completionRate < 0.5) {
    recs.push({
      text: lang === 'fa'
        ? 'نرخ تکمیل پایین است. جلسات کوتاه‌تر (۲۵ دقیقه) را امتحان کن.'
        : 'Completion rate is low. Try shorter 25-minute sessions.',
    });
  }

  // Overdue reminders
  const pending = ctx.reminders.filter((r: { status: string }) => r.status === 'pending');
  if (pending.length >= 3) {
    recs.push({
      text: lang === 'fa'
        ? `${pending.length} یادآور معلق داری. اولویت‌بندی کن.`
        : `You have ${pending.length} pending reminders. Consider prioritizing them.`,
    });
  }

  if (recs.length === 0) {
    recs.push({
      text: lang === 'fa'
        ? 'وضعیت مطالعه‌ات متعادل به نظر می‌رسد. ادامه بده.'
        : 'Your study balance looks good. Keep it up.',
    });
  }

  return recs;
}
