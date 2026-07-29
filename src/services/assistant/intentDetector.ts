import type { AssistantIntent } from './types';
import { normalizePersianDigits } from './dateParser';

export function detectIntent(text: string): AssistantIntent {
  const t = normalizePersianDigits(text.toLowerCase());

  if (/\b(hi|hello|hey|greetings|howdy)\b|سلام|درود/.test(t) && text.length < 30) return 'greet';
  if (/\b(thank|thanks|appreciate)\b|ممنون|سپاس|تشکر/.test(t)) return 'greet';
  if (/\b(help|how do|how to|where|guide|explain|what is|show me|teach)\b|کمک|چطور|چجوری|کجا|راهنما|آموزش/.test(t)) return 'pageGuidance';
  if (/\blow energy\b|حوصله\s*ندارم|خسته|کم\s*انرژی/.test(t)) return 'lowEnergy';
  if (/\bhigh energy\b|انرژی\s*زیاد|پر\s*انرژی|حوصله\s*دارم/.test(t)) return 'highEnergy';
  if (/\btimer\b|تایمر|تمرکز/.test(t) && /\b(start|set|begin|run|شروع|تنظیم)\b/.test(t)) return 'startFocusTimer';
  if (/\b(remind|reminder|alert)\b|یادآور|یادآوری|یادم\s*باشه/.test(t)) return 'createReminder';
  if (/\b(week|weekly)\b|هفته|هفتگی/.test(t) && /\b(plan|schedule|organize|برنامه|زمان‌بندی)\b/.test(t)) return 'weeklyPlanning';
  if (/برنامه.*هفته|هفته.*برنامه/.test(t)) return 'weeklyPlanning';
  if (/\b(exam|midterm|final|test)\b|امتحان|ازمون/.test(t) && /\b(plan|prepare|study|ready|برنامه|آمادگی)\b/.test(t)) return 'examPlanning';
  if (/برنامه.*امتحان|امتحان.*برنامه|آمادگی.*امتحان/.test(t)) return 'examPlanning';
  if (/\b(today|day|daily)\b|امروز|روزانه/.test(t) && /\b(plan|schedule|do|work on|برنامه|کار|انجام)\b/.test(t)) return 'dailyPlanning';
  if (/برنامه.*امروز|امروز.*برنامه|امروز.*چی.*بخون|چی.*انجام/.test(t)) return 'dailyPlanning';
  if (/\bplan\s+(my\s+)?(day|today)\b/.test(t)) return 'dailyPlanning';
  if (/\b(analyz|review|how did|performance|stats|progress)\b|تحلیل|بررسی|چطور.*رفت|آمار|روند|عملکرد/.test(t)) return 'analyzeWeekly';
  if (/کم.*خوندم|کم.*خواندم|کدام.*درس.*کمتر/.test(t)) return 'analyzeSubjectBalance';
  if (/\b(break down|breakdown|goal|steps?|divide)\b|تقسیم|هدف|مراحل|خرده|کوچک/.test(t)) return 'goalBreakdown';
  if (/\b(reschedule|postpone|move|shift)\b|جابجا|منتقل|تأخیر|عقب.*انداختن/.test(t)) return 'rescheduleTask';
  if (/\boverdue|عقب\u200cافتاده|عقب.*افتاده|تأخیری/.test(t)) return 'showOverdue';
  if (/\b(show|what).*(today|today's)\b|کارای.*امروز|امروز.*چی/.test(t)) return 'showToday';
  if (/\b(show|what).*(tomorrow|tomorrow's)\b|کارای.*فردا|فردا.*چی/.test(t)) return 'showTomorrow';
  if (/\b(add|create|set|make|schedule|put)\b|اضافه|بساز|قرار|اضافه\s*کن/.test(t) && /\b(task|todo|activity|event|study|session)\b|تکلیف|کار|فعالیت|درس|مطالعه/.test(t)) return 'createTask';
  if (/\b(recommend|suggest|what should|which subject|prioriti)\b|پیشنهاد|توصیه|چی.*بخونم|کدام.*درس|اولویت/.test(t)) return 'studyRecommendation';
  if (/\b(language|lang|فارسی|english|persian)\b|زبان|فارسی|انگلیسی/.test(t) && /\b(change|switch|set)\b|تغییر|بذار/.test(t)) return 'changeLanguage';
  if (/\b(workload|lighter|heavier|intensity|too much|too little)\b|حجم|سبک‌تر|سنگین‌تر|بار|زیاد|کم/.test(t)) return 'changeWorkload';
  if (/\b(plan|schedule|organize)\b|برنامه|زمان‌بندی|برنامه‌ریزی/.test(t)) return 'dailyPlanning';
  return 'unknown';
}
