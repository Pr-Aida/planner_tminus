import type { AssistantResponse, AssistantAction, PlannerContext, PendingTask, PlanBlock, AssistantIntent, ChatMessage } from './types';
import { detectIntent } from './intentDetector';
import { parseAnyDate, parseTimeOfDay, parseDuration } from './dateParser';
import { uid, saveProfile } from './memory';
import { generateDailyPlan, generateWeeklyPlan, analyzeWeekly, breakDownGoal } from './planningEngine';
import { scorePriority } from './priorityScoring';
import * as R from './responses';
import { todayGreg, dateKey } from '../../lib/calendar';
import type { Activity, ReminderOffset } from '../../types';

export function confirmTask(task: PendingTask, lang: 'fa' | 'en'): { action: AssistantAction; label: string } {
  const activity: Activity = {
    id: uid(),
    name: task.title,
    from: task.time || '09:00',
    to: (() => {
      const [h, m] = (task.time || '09:00').split(':').map(Number);
      const endMin = h * 60 + m + (task.durationMin || 60);
      return `${String(Math.floor(endMin / 60) % 24).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    })(),
    note: task.notes || '',
  };
  return { action: { type: 'addActivity', activity }, label: lang === 'fa' ? 'به پلنر اضافه شد' : 'Added to planner' };
}

export function planBlocksToActivities(blocks: PlanBlock[]): Activity[] {
  return blocks.filter(b => b.type !== 'break').map(b => ({ id: uid(), name: b.subject, from: b.start, to: b.end, note: b.reason }));
}

export async function sendMessage(messages: ChatMessage[], ctx: PlannerContext): Promise<AssistantResponse> {
  await new Promise(resolve => setTimeout(resolve, 180 + Math.random() * 220));
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return { content: R.greeting(ctx.lang) };
  return executeIntent(detectIntent(lastUser.content), lastUser.content, ctx);
}

function executeIntent(intent: AssistantIntent, text: string, ctx: PlannerContext): AssistantResponse {
  const lang = ctx.lang;
  const profile = ctx.profile;
  const today = dateKey(todayGreg(profile.timezone));

  switch (intent) {
    case 'greet': return { content: R.greeting(lang) };
    case 'pageGuidance': return { content: R.pageGuidance(text, lang) };
    case 'lowEnergy': return { content: R.lowEnergyAdvice(lang) };
    case 'highEnergy': return { content: R.highEnergyAdvice(lang) };

    case 'dailyPlanning': {
      const { blocks, totalMinutes } = generateDailyPlan(ctx);
      if (blocks.length === 0) return { content: lang === 'fa' ? 'برای ساخت برنامه، زمان آزاد و موضوعات مطالعه‌ات را بگو.' : 'Tell me your available time and study subjects to create a plan.' };
      const hrs = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return { content: lang === 'fa' ? `برنامه پیشنهادی برای امروز (${hrs > 0 ? hrs + ' ساعت و ' : ''}${mins} دقیقه):` : `Here's your plan for today (${hrs > 0 ? hrs + 'h ' : ''}${mins}m):`, card: { kind: 'plan', blocks, totalMinutes, lang }, actionLabel: lang === 'fa' ? 'برنامه آماده شد' : 'Plan ready' };
    }

    case 'weeklyPlanning': {
      const { blocks, totalMinutes } = generateWeeklyPlan(ctx);
      return { content: lang === 'fa' ? `برنامه پیشنهادی هفتگی (${Math.round(totalMinutes / 60)} ساعت):` : `Here's your weekly plan (${Math.round(totalMinutes / 60)} hours total):`, card: { kind: 'plan', blocks, totalMinutes, lang }, actionLabel: lang === 'fa' ? 'برنامه هفتگی آماده شد' : 'Weekly plan ready' };
    }

    case 'examPlanning': {
      const examMatch = profile.upcomingExams[0];
      const steps = breakDownGoal(text, lang);
      const goal = examMatch?.subject || (lang === 'fa' ? 'آمادگی امتحان' : 'Exam preparation');
      return { content: lang === 'fa' ? `مراحل پیشنهادی برای آمادگی امتحان ${goal}:` : `Here's a breakdown for preparing your ${goal} exam:`, card: { kind: 'goalBreakdown', goal, steps, lang } };
    }

    case 'analyzeWeekly': {
      const analysis = analyzeWeekly(ctx);
      return { content: lang === 'fa' ? 'تحلیل هفته‌ات:' : "Here's your weekly analysis:", card: { kind: 'weeklyReport', report: analysis, lang } };
    }

    case 'analyzeSubjectBalance': {
      const analysis = analyzeWeekly(ctx);
      if (analysis.leastStudied) return { content: lang === 'fa' ? `این هفته کمترین زمان را به «${analysis.leastStudied}» اختصاص دادی. پیشنهاد می‌کنم ۲ جلسه ۳۰ دقیقه‌ای به برنامه اضافه کنی.` : `You spent the least time on "${analysis.leastStudied}" this week. I suggest adding 2 x 30-minute sessions.` };
      return { content: lang === 'fa' ? 'داده کافی برای تحلیل موضوعی وجود ندارد.' : 'Not enough data for subject analysis yet.' };
    }

    case 'goalBreakdown': {
      const goalMatch = text.replace(/break down|هدف|تقسیم|مراحل/gi, '').trim();
      const steps = breakDownGoal(goalMatch || text, lang);
      return { content: lang === 'fa' ? `مراحل پیشنهادی برای «${goalMatch || text}»:` : `Here's a breakdown for "${goalMatch || text}":`, card: { kind: 'goalBreakdown', goal: goalMatch || text, steps, lang } };
    }

    case 'createTask': {
      const date = parseAnyDate(text);
      const time = parseTimeOfDay(text);
      const durationMin = parseDuration(text) || 60;
      let title = text.replace(/(?:add|create|set|make|schedule)\s+(?:a\s+)?(?:task|activity|event|session|study|todo)\s+(?:to\s+)?/i, '').replace(/(?:from|at|on|for|until|برای|ساعت)\s+\d{1,2}(?::\d{2})?\s*[ap]m?.*$/i, '').replace(/(?:study|do|practice|مطالعه|درس)\s+/i, '').trim();
      if (!title || title.length < 2) title = lang === 'fa' ? 'مطالعه' : 'Study session';
      const task: PendingTask = { title, dateKey: date?.dateKey || today, dateDisplay: date?.display || (lang === 'fa' ? 'امروز' : 'Today'), time: time || undefined, durationMin, priority: 'medium' };
      return { content: lang === 'fa' ? 'آیا این فعالیت را تأیید می‌کنی؟' : 'Please confirm this task:', card: { kind: 'taskConfirmation', task, lang } };
    }

    case 'createReminder': {
      const date = parseAnyDate(text);
      let title = text.replace(/(?:set|add|create|make|schedule)\s+(?:a\s+)?remind(?:er)?\s+(?:for|to|on)?\s*/i, '').replace(/(?:remind\s+me\s+(?:to|about|on|for))\s*/i, '').replace(/یادآور\s*(برای|به|در)?\s*/g, '').replace(/یادم\s*باشه\s*(که|به|برای)?\s*/g, '').trim();
      if (date) title = title.replace(date.display, '').trim();
      title = title.replace(/\s+(?:on|at|for|tomorrow|today|next\s+\w+)\s*.*$/i, '').trim();
      if (!title) title = lang === 'fa' ? 'یادآور' : 'Reminder';
      if (!date) return { content: lang === 'fa' ? `برای «${title}» یادآور می‌سازم. تاریخش چه روزیه؟` : `I can set a reminder for "${title}". What date?` };
      return { content: lang === 'fa' ? `انجام شد. یادآور «${title}» برای ${date.display} ثبت شد.` : `Done. Reminder "${title}" set for ${date.display}.`, action: { type: 'addReminder', dateKey: date.dateKey, title, offset: profile.reminderPref as ReminderOffset }, actionLabel: lang === 'fa' ? 'یادآور ثبت شد' : 'Reminder set' };
    }

    case 'startFocusTimer': {
      const dur = parseDuration(text) || 25;
      const label = lang === 'fa' ? `${dur} دقیقه تمرکز` : `${dur}-minute focus`;
      return { content: lang === 'fa' ? `تایمر ${dur} دقیقه‌ای شروع شد. تمرکز کن!` : `${dur}-minute focus timer started. Stay focused!`, action: { type: 'startTimer', seconds: dur * 60, label }, actionLabel: lang === 'fa' ? 'تایمر شروع شد' : 'Timer started' };
    }

    case 'showToday': {
      const acts = ctx.currentDayData.activities;
      if (acts.length === 0) return { content: lang === 'fa' ? 'امروز هیچ فعالیتی ثبت نشده. می‌خوای برنامه‌ای بسازم؟' : 'No activities for today yet. Want me to create a plan?' };
      return { content: lang === 'fa' ? `فعالیت‌های امروز:\n${acts.map(a => `${a.from}–${a.to}  ${a.name}`).join('\n')}` : `Today's activities:\n${acts.map(a => `${a.from}–${a.to}  ${a.name}`).join('\n')}` };
    }

    case 'showTomorrow': return { content: lang === 'fa' ? 'برای فردا فعالیتی ثبت نشده. می‌خوای برنامه‌ای بسازم؟' : 'No activities for tomorrow. Want me to add some?' };

    case 'showOverdue': {
      const overdue = ctx.reminders.filter(r => r.status === 'pending' && r.date_key < today);
      if (overdue.length === 0) return { content: lang === 'fa' ? 'عالی! هیچ کاری عقب نیفتاده.' : 'Great! No overdue tasks.' };
      return { content: lang === 'fa' ? `${overdue.length} کار عقب‌افتاده:\n${overdue.map(r => `• ${r.title} (${r.date_key})`).join('\n')}` : `${overdue.length} overdue task(s):\n${overdue.map(r => `• ${r.title} (${r.date_key})`).join('\n')}` };
    }

    case 'studyRecommendation': {
      const subjects = [...profile.difficultSubjects, ...profile.upcomingExams.map(e => e.subject)];
      if (subjects.length === 0) return { content: lang === 'fa' ? 'درس دشوار یا امتحان نزدیکی ثبت نشده. موضوع مطالعه‌ات رو بگو تا اولویت‌بندی کنم.' : 'No difficult subjects or upcoming exams set. Tell me your subjects and I\'ll prioritize.' };
      const scored = subjects.map(s => scorePriority({ subject: s, examKey: profile.upcomingExams.find(e => e.subject === s)?.dateKey, difficulty: profile.difficultSubjects.includes(s) ? 4 : 2 }, ctx));
      scored.sort((a, b) => b.score - a.score);
      const top = scored[0];
      return { content: lang === 'fa' ? `توصیه: با «${top.subject}» شروع کن. دلایل:\n${top.reasons.map(r => `• ${r}`).join('\n')}` : `Recommendation: Start with "${top.subject}".\nReasons:\n${top.reasons.map(r => `• ${r}`).join('\n')}` };
    }

    case 'taskPrioritization': {
      const acts = ctx.currentDayData.activities;
      if (acts.length === 0) return { content: lang === 'fa' ? 'امروز فعالیتی ثبت نشده.' : 'No activities today to prioritize.' };
      return { content: lang === 'fa' ? `فعالیت‌های امروز:\n${acts.map((a, i) => `${i + 1}. ${a.name} (${a.from}–${a.to})`).join('\n')}` : `Today's activities:\n${acts.map((a, i) => `${i + 1}. ${a.name} (${a.from}–${a.to})`).join('\n')}` };
    }

    case 'changeLanguage': {
      const newLang = /فارسی|persian|fa/.test(text.toLowerCase()) ? 'fa' : 'en';
      saveProfile({ ...profile, lang: newLang as 'fa' | 'en' });
      return { content: newLang === 'fa' ? 'زبان دستیار به فارسی تغییر یافت.' : 'Assistant language set to English.' };
    }

    case 'changeWorkload': {
      const lighter = /lighter|سبک‌تر|کمتر/.test(text.toLowerCase());
      saveProfile({ ...profile, intensity: lighter ? 'light' : 'intensive' });
      return { content: lighter ? (lang === 'fa' ? 'برنامه‌ها سبک‌تر می‌شوند.' : 'Plans will be lighter.') : (lang === 'fa' ? 'برنامه‌ها فشرده‌تر می‌شوند.' : 'Plans will be more intensive.') };
    }

    default: return { content: R.fallback(lang) };
  }
}
