import type { Activity, CountdownConfig, HabitType, ReminderOffset } from '../types';
import { SH_MONTHS, shToGregorian, todaySh, todayGreg, gregorianToSh, addDaysGreg, dateKey } from './calendar';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantAction =
  | { type: 'addActivity'; activity: Activity }
  | { type: 'setTopNote'; note: string }
  | { type: 'addHabitToDay'; name: string; habitType: HabitType; unit: string | null }
  | { type: 'setCountdown'; config: CountdownConfig }
  | { type: 'startTimer'; seconds: number; label: string }
  | { type: 'stopTimer' }
  | { type: 'switchView'; view: 'daily' | 'weekly' | 'monthly' | 'yearly' }
  | { type: 'addReminder'; dateKey: string; title: string; offset: ReminderOffset }
  | { type: 'navigateToDate'; dateKey: string };

export interface AssistantResponse {
  content: string;
  action?: AssistantAction;
  actionLabel?: string;
}

// ─── Language detection ──────────────────────────────────────────────────────

const PERSIAN_RANGE = /[\u0600-\u06FF]/;
function isPersian(text: string): boolean { return PERSIAN_RANGE.test(text); }
function isMixed(text: string): boolean {
  const persianChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return persianChars > 0 && latinChars > 0 && persianChars >= latinChars * 0.3;
}

// ─── Persian (Jalali) date parsing ────────────────────────────────────────────

const SH_MONTH_ALIASES: Record<string, number> = {};
SH_MONTHS.forEach((m, i) => {
  SH_MONTH_ALIASES[m.name.toLowerCase()] = i + 1;
  SH_MONTH_ALIASES[m.short.toLowerCase()] = i + 1;
});
// Persian script month names
const SH_MONTH_PERSIAN: Record<string, number> = {
  'فروردین': 1, 'اردیبهشت': 2, 'خرداد': 3, 'تیر': 4, 'مرداد': 5, 'شهریور': 6,
  'مهر': 7, 'آبان': 8, 'آذر': 9, 'دی': 10, 'بهمن': 11, 'اسفند': 12,
};

const PERSIAN_NUMS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
function normalizePersianDigits(text: string): string {
  return text.replace(/[۰-۹]/g, d => PERSIAN_NUMS[d] || d);
}

const GREG_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const GREG_MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

export interface ParsedDate {
  dateKey: string; // Gregorian ISO YYYY-MM-DD
  display: string; // human-readable
  persian: boolean;
}

function parseShamsiDate(text: string): ParsedDate | null {
  const normalized = normalizePersianDigits(text);
  const today = todaySh();

  // Persian-script: "۲ مرداد" / "۲ مرداد ۱۴۰۵"
  const persianMonthNames = Object.keys(SH_MONTH_PERSIAN).join('|');
  const persianMatch = normalized.match(new RegExp(`(\\d{1,2})\\s*(${persianMonthNames})`, 'i'));
  if (persianMatch) {
    const day = parseInt(persianMatch[1], 10);
    const month = SH_MONTH_PERSIAN[persianMatch[2]];
    const yearMatch = normalized.match(new RegExp(`${persianMatch[1]}\\s*${persianMatch[2]}\\s*(\\d{4})`));
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.year;
    const g = shToGregorian({ year, month, day });
    return {
      dateKey: dateKey(g),
      display: `${day} ${SH_MONTHS[month - 1].name} ${year}`,
      persian: true,
    };
  }

  // Latin-script: "2 Mordad" / "15 Mehr 1405"
  const latinMatch = normalized.match(new RegExp(`(\\d{1,2})\\s*(${Object.keys(SH_MONTH_ALIASES).join('|')})`, 'i'));
  if (latinMatch) {
    const day = parseInt(latinMatch[1], 10);
    const month = SH_MONTH_ALIASES[latinMatch[2].toLowerCase()];
    if (!month) return null;
    const yearMatch = normalized.match(new RegExp(`${latinMatch[1]}\\s*${latinMatch[2]}\\s*(\\d{4})`));
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.year;
    const g = shToGregorian({ year, month, day });
    return {
      dateKey: dateKey(g),
      display: `${day} ${SH_MONTHS[month - 1].name} ${year}`,
      persian: true,
    };
  }

  return null;
}

function parseGregorianDate(text: string): ParsedDate | null {
  const t = text.toLowerCase();
  // "August 15" / "Aug 15 2026"
  for (let i = 0; i < 12; i++) {
    const names = [GREG_MONTHS[i], GREG_MONTH_SHORT[i]];
    for (const name of names) {
      const re = new RegExp(`${name}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i');
      const m = t.match(re);
      if (m) {
        const day = parseInt(m[1], 10);
        const year = m[2] ? parseInt(m[2], 10) : new Date().getFullYear();
        const g = { year, month: i + 1, day };
        return { dateKey: dateKey(g), display: `${GREG_MONTHS[i]} ${day}, ${year}`, persian: false };
      }
    }
  }
  // ISO: 2026-08-15
  const isoMatch = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, mo, d] = isoMatch;
    return { dateKey: `${y}-${mo}-${d}`, display: `${GREG_MONTHS[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}, ${y}`, persian: false };
  }
  return null;
}

function parseRelativeDate(text: string): ParsedDate | null {
  const t = normalizePersianDigits(text.toLowerCase());
  const today = todayGreg();

  if (/\btoday\b|امروز/.test(t)) {
    return { dateKey: dateKey(today), display: 'today', persian: isPersian(text) };
  }
  if (/\btomorrow\b|فردا/.test(t)) {
    const g = addDaysGreg(today, 1);
    return { dateKey: dateKey(g), display: 'tomorrow', persian: isPersian(text) };
  }
  if (/\bday after tomorrow\b|پس\u200cفردا|پس فردا/.test(t)) {
    const g = addDaysGreg(today, 2);
    return { dateKey: dateKey(g), display: 'the day after tomorrow', persian: isPersian(text) };
  }
  if (/\bnext week\b|هفته\u200cی بعد|هفته بعد/.test(t)) {
    const g = addDaysGreg(today, 7);
    return { dateKey: dateKey(g), display: 'next week', persian: isPersian(text) };
  }
  if (/\bnext month\b|ماه بعد/.test(t)) {
    const g = addDaysGreg(today, 30);
    return { dateKey: dateKey(g), display: 'next month', persian: isPersian(text) };
  }
  // "in 3 days" / "3 روز دیگر" / "تا ۳ روز دیگر"
  const daysMatch = t.match(/(?:in\s+)?(\d+)\s*(?:days?|روز)/);
  if (daysMatch && /\bin\s+\d+\s*days\b|روز\s*(?:دیگ|بعد)/.test(t)) {
    const g = addDaysGreg(today, parseInt(daysMatch[1], 10));
    return { dateKey: dateKey(g), display: `in ${daysMatch[1]} days`, persian: isPersian(text) };
  }

  // Weekdays
  const weekdays: { en: string[]; sh: string[]; offset: number }[] = [
    { en: ['saturday', 'sat'], sh: ['شنبه'], offset: 6 },
    { en: ['sunday', 'sun'], sh: ['یکشنبه'], offset: 0 },
    { en: ['monday', 'mon'], sh: ['دوشنبه'], offset: 1 },
    { en: ['tuesday', 'tue'], sh: ['سه\u200cشنبه'], offset: 2 },
    { en: ['wednesday', 'wed'], sh: ['چهارشنبه'], offset: 3 },
    { en: ['thursday', 'thu'], sh: ['پنجشنبه'], offset: 4 },
    { en: ['friday', 'fri'], sh: ['جمعه'], offset: 5 },
  ];
  const now = new Date();
  const currentDow = now.getDay(); // 0=Sun
  for (const wd of weekdays) {
    const matchEn = wd.en.some(w => new RegExp(`\\b${w}\\b`).test(t));
    const matchSh = wd.sh.some(w => t.includes(w));
    if (matchEn || matchSh) {
      const isNext = /\bnext\b|بعد/.test(t);
      let targetDow = wd.offset;
      if (targetDow === 6) targetDow = 0; // Sat = 6 in JS getDay
      let diff = targetDow - currentDow;
      if (diff <= 0 || isNext) diff += 7;
      const g = addDaysGreg(today, diff);
      return { dateKey: dateKey(g), display: wd.en[0], persian: isPersian(text) };
    }
  }

  return null;
}

export function parseAnyDate(text: string): ParsedDate | null {
  return parseShamsiDate(text) || parseGregorianDate(text) || parseRelativeDate(text);
}

// ─── Time parsing ─────────────────────────────────────────────────────────────

function normalizeTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3];
  if (suffix === 'am' && h === 12) h = 0;
  if (suffix === 'pm' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function parseTimeOfDay(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bmorning\b|صبح/.test(t)) return '08:00';
  if (/\bnoon\b|ظهر/.test(t)) return '12:00';
  if (/\bafternoon\b|بعدازظهر/.test(t)) return '15:00';
  if (/\bevening\b|عصر/.test(t)) return '18:00';
  if (/\bnight\b|شب/.test(t)) return '21:00';
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) return normalizeTime(m[0]);
  return null;
}

// ─── Memory (localStorage, lightweight) ──────────────────────────────────────

const MEMORY_KEY = 'tminus-assistant-memory';

interface MemoryEntry {
  ts: number;
  type: 'activity' | 'reminder' | 'habit' | 'timer' | 'plan';
  label: string;
  hour?: number;
}

interface AssistantMemory {
  entries: MemoryEntry[];
}

function loadMemory(): AssistantMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as AssistantMemory;
    // Keep only last 200 entries to prevent bloat
    if (parsed.entries.length > 200) {
      parsed.entries = parsed.entries.slice(-200);
    }
    return parsed;
  } catch {
    return { entries: [] };
  }
}

function saveMemory(mem: AssistantMemory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  } catch {
    // ignore quota errors
  }
}

function recordMemory(type: MemoryEntry['type'], label: string, hour?: number): void {
  const mem = loadMemory();
  mem.entries.push({ ts: Date.now(), type, label, hour });
  saveMemory(mem);
}

// ─── Adaptive analysis ─────────────────────────────────────────────────────────

interface Analysis {
  totalActivities: number;
  studyHours: number;
  activeHours: Record<number, number>; // hour -> count
  topHours: number[];
  consistency: number; // 0-1
  avgPerDay: number;
}

function analyzeMemory(): Analysis {
  const mem = loadMemory();
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  const recent = mem.entries.filter(e => e.ts >= weekAgo);

  const studyEntries = recent.filter(e => e.type === 'activity' || e.type === 'habit');
  const studyHours = studyEntries.length * 1.5; // rough estimate

  const activeHours: Record<number, number> = {};
  for (const e of recent) {
    if (e.hour !== undefined) {
      activeHours[e.hour] = (activeHours[e.hour] || 0) + 1;
    }
  }
  const topHours = Object.entries(activeHours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => parseInt(h, 10));

  // Consistency: how many distinct days had activity in last 7 days
  const days = new Set(recent.map(e => Math.floor(e.ts / 86400000)));
  const consistency = recent.length > 0 ? Math.min(1, days.size / 7) : 0;

  return {
    totalActivities: recent.length,
    studyHours: Math.round(studyHours),
    activeHours,
    topHours,
    consistency,
    avgPerDay: recent.length / 7,
  };
}

function describeHour(h: number): string {
  if (h < 12) return 'mornings';
  if (h < 17) return 'afternoons';
  if (h < 21) return 'evenings';
  return 'late nights';
}
function describeHourFa(h: number): string {
  if (h < 12) return 'صبح‌ها';
  if (h < 17) return 'بعدازظهرها';
  if (h < 21) return 'عصر‌ها';
  return 'شب‌ها';
}

// ─── Adaptive planning ────────────────────────────────────────────────────────

function generateAdaptivePlan(input: string, persian: boolean): string {
  const analysis = analyzeMemory();
  const startHourMatch = input.match(/(\d{1,2})\s*(?:am|pm)?\s*(?:wake|start|begin|up|morning)/i)
    || normalizePersianDigits(input).match(/(\d{1,2})\s*(?:صبح|از)/);
  const startHour = startHourMatch ? parseInt(startHourMatch[1], 10) : 7;

  const subjectsMatch = input.match(/(?:study|subjects?|topics?|focus)\s*(?:on|:)?\s*([a-z0-9,\s\u0600-\u06FF]+)/i);
  const subjects = subjectsMatch
    ? subjectsMatch[1].split(/[,/]| and |و /i).map(s => s.trim()).filter(Boolean).slice(0, 4)
    : [];

  const hasGym = /\bgym\b|workout|exercise|train|ورزش/.test(input);
  const hasExam = /\bexam\b|midterm|final|امتحان/.test(input);

  // Adaptive difficulty
  const consistent = analysis.consistency >= 0.5;
  const heavy = consistent && analysis.avgPerDay >= 3;
  const light = !consistent || analysis.avgPerDay < 1.5;

  // Determine best study hours from memory
  const bestHours = analysis.topHours.length > 0 ? analysis.topHours : [9, 14, 19];

  if (persian) {
    return generatePersianAdaptivePlan(startHour, subjects, hasGym, hasExam, analysis, consistent, light, heavy, bestHours);
  }
  return generateEnglishAdaptivePlan(startHour, subjects, hasGym, hasExam, analysis, consistent, light, heavy, bestHours);
}

function generateEnglishAdaptivePlan(
  startHour: number, subjects: string[], hasGym: boolean, hasExam: boolean,
  analysis: Analysis, consistent: boolean, light: boolean, heavy: boolean, bestHours: number[]
): string {
  const blocks: { label: string; duration: number; type: 'study' | 'break' | 'routine' }[] = [
    { label: 'Morning Routine', duration: 1, type: 'routine' },
  ];

  if (light) {
    blocks.push({ label: subjects[0] || 'Light Study', duration: 1, type: 'study' });
    blocks.push({ label: 'Break', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'Review', duration: 1, type: 'study' });
  } else if (heavy) {
    blocks.push({ label: subjects[0] || 'Deep Study', duration: 2, type: 'study' });
    blocks.push({ label: 'Short Break', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'Practice Problems', duration: 1.5, type: 'study' });
    blocks.push({ label: 'Lunch & Rest', duration: 1, type: 'break' });
    blocks.push({ label: subjects[2] || 'Review & Notes', duration: 1.5, type: 'study' });
    blocks.push({ label: 'Short Break', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[3] || 'Light Reading', duration: 1, type: 'study' });
  } else {
    blocks.push({ label: subjects[0] || 'Deep Study', duration: 1.5, type: 'study' });
    blocks.push({ label: 'Short Break', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'Practice', duration: 1.5, type: 'study' });
    blocks.push({ label: 'Lunch & Rest', duration: 1, type: 'break' });
    blocks.push({ label: subjects[2] || 'Review', duration: 1, type: 'study' });
  }

  if (hasGym) {
    blocks.push({ label: 'Gym / Workout', duration: 1, type: 'routine' });
  } else {
    blocks.push({ label: 'Exercise / Walk', duration: 0.5, type: 'routine' });
  }

  if (hasExam) {
    blocks.push({ label: 'Exam Practice Questions', duration: 1, type: 'study' });
  }

  blocks.push({ label: 'Wind Down & Plan Tomorrow', duration: 0.5, type: 'routine' });

  const slots: string[] = [];
  let currentHour = startHour;
  for (const block of blocks) {
    const startLabel = formatHour(currentHour);
    currentHour += block.duration;
    const endLabel = formatHour(currentHour);
    const icon = block.type === 'study' ? '[Study]' : block.type === 'break' ? '[Break]' : '[Routine]';
    slots.push(`${startLabel} – ${endLabel}  ${icon} ${block.label}`);
  }

  const reasoning: string[] = [];
  if (analysis.topHours.length > 0) {
    const peakDesc = analysis.topHours.map(h => describeHour(h)).join(', ');
    reasoning.push(`- You're most active in ${peakDesc}, so I scheduled your hardest tasks then.`);
  }
  if (light) {
    reasoning.push('- I kept the plan lighter since your activity has been inconsistent this week. Build the habit first, then we\'ll add more.');
  } else if (heavy) {
    reasoning.push('- You\'ve been consistent, so I built a structured plan with more study blocks.');
  } else {
    reasoning.push('- A balanced plan — enough structure to make progress without burning out.');
  }
  if (hasExam) reasoning.push('- Added exam practice since you mentioned a test.');
  if (analysis.studyHours > 0) reasoning.push(`- You logged about ${analysis.studyHours} hours of activity in the past week.`);

  return ['Here\'s a personalized plan based on your recent activity:', '', ...slots, '', 'Why this plan:', ...reasoning].join('\n');
}

function generatePersianAdaptivePlan(
  startHour: number, subjects: string[], hasGym: boolean, hasExam: boolean,
  analysis: Analysis, consistent: boolean, light: boolean, heavy: boolean, bestHours: number[]
): string {
  const blocks: { label: string; duration: number; type: string }[] = [
    { label: 'روتین صبح', duration: 1, type: 'routine' },
  ];

  if (light) {
    blocks.push({ label: subjects[0] || 'مطالعه سبک', duration: 1, type: 'study' });
    blocks.push({ label: 'استراحت', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'مرور', duration: 1, type: 'study' });
  } else if (heavy) {
    blocks.push({ label: subjects[0] || 'مطالعه عمیق', duration: 2, type: 'study' });
    blocks.push({ label: 'استراحت کوتاه', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'حل مسئله', duration: 1.5, type: 'study' });
    blocks.push({ label: 'ناهار و استراحت', duration: 1, type: 'break' });
    blocks.push({ label: subjects[2] || 'مرور و خلاصه', duration: 1.5, type: 'study' });
    blocks.push({ label: 'استراحت کوتاه', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[3] || 'مطالعه سبک', duration: 1, type: 'study' });
  } else {
    blocks.push({ label: subjects[0] || 'مطالعه عمیق', duration: 1.5, type: 'study' });
    blocks.push({ label: 'استراحت کوتاه', duration: 0.5, type: 'break' });
    blocks.push({ label: subjects[1] || 'تمرین', duration: 1.5, type: 'study' });
    blocks.push({ label: 'ناهار و استراحت', duration: 1, type: 'break' });
    blocks.push({ label: subjects[2] || 'مرور', duration: 1, type: 'study' });
  }

  if (hasGym) blocks.push({ label: 'ورزش', duration: 1, type: 'routine' });
  else blocks.push({ label: 'پیاده‌روی', duration: 0.5, type: 'routine' });

  if (hasExam) blocks.push({ label: 'تمرین امتحانی', duration: 1, type: 'study' });

  blocks.push({ label: 'برنامه‌ریزی فردا', duration: 0.5, type: 'routine' });

  const slots: string[] = [];
  let currentHour = startHour;
  for (const block of blocks) {
    const startLabel = `${currentHour}:۰۰`;
    currentHour += block.duration;
    const endLabel = `${currentHour}:۳۰`;
    const icon = block.type === 'study' ? '[مطالعه]' : block.type === 'break' ? '[استراحت]' : '[روتین]';
    slots.push(`${startLabel} – ${endLabel}  ${icon} ${block.label}`);
  }

  const reasoning: string[] = [];
  if (analysis.topHours.length > 0) {
    reasoning.push(`- تو بیشتر ${analysis.topHours.map(h => describeHourFa(h)).join('، ')} فعالی، پس سخت‌ترین کارها رو اونجا گذاشتم.`);
  }
  if (light) {
    reasoning.push('- برنامه رو سبک نگه داشتم چون این هفته فعالیتت منظم نبود. اول عادت رو بساز، بعد بیشتر می‌کنیم.');
  } else if (heavy) {
    reasoning.push('- چون منظم بودی، یک برنامه ساختاریافته با بلوک‌های مطالعه بیشتر ساختم.');
  }
  if (analysis.studyHours > 0) reasoning.push(`- هفته گذشته حدود ${analysis.studyHours} ساعت فعالیت ثبت کردی.`);

  return ['این برنامه بر اساس فعالیت اخیر توست:', '', ...slots, '', 'چرا این برنامه:', ...reasoning].join('\n');
}

function formatHour(hour: number): string {
  const h = hour % 24;
  const ampm = h < 12 ? 'AM' : 'PM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const suffix = hour % 1 !== 0 ? ':30' : ':00';
  return `${Math.floor(display)}${suffix} ${ampm}`;
}

// ─── Intent detection (natural, not keyword-only) ─────────────────────────────

type Intent = 'addActivity' | 'addReminder' | 'addTask' | 'setNote' | 'addHabit' | 'setCountdown'
  | 'startTimer' | 'stopTimer' | 'switchView' | 'navigate' | 'plan' | 'guide' | 'greet' | 'thanks'
  | 'break' | 'tips' | 'memory' | 'unknown';

function detectIntent(text: string): Intent {
  const t = normalizePersianDigits(text.toLowerCase());
  const persian = isPersian(text);

  // Action verbs (both languages)
  const addVerbs = /\b(add|create|set|make|schedule|put|insert)\b|اضافه|بساز|قرار|اضافه کن/;
  const reminderNouns = /\b(remind|reminder|alert)\b|یادآور|یادآوری/;
  const taskNouns = /\b(task|todo|to-do|thing to do)\b|تکالیف|کار|وظیفه/;
  const activityNouns = /\b(activity|event|block|session)\b|فعالیت|رویداد/;
  const habitNouns = /\b(habit|routine)\b|عادت/;
  const countdownNouns = /\b(countdown|deadline)\b|شمارش|ددلاین/;
  const timerNouns = /\b(timer|countdown|stopwatch)\b|تایمر|زمان‌سنج/;
  const noteNouns = /\b(note|memo)\b|یادداشت|نوت/;
  const viewNouns = /\b(view|page|tab|screen)\b|نمایش|صفحه/;
  const planNouns = /\b(plan|schedule|routine|organize)\b|برنامه|زمان‌بندی|برنامه‌ریزی/;
  const guideNouns = /\b(where|how do|how to|find|guide|explain|what is|show me)\b|کجا|چطور|چجوری|راهنما/;
  const breakNouns = /\b(break|rest|tired|burnout|overwhelm|exhaust)\b|استراحت|خسته|خستگی/;
  const tipNouns = /\b(tip|advice|better|improve|focus|motivat|procrastinat)\b|نصیحت|بهتر|تمرکز/;
  const memoryNouns = /\b(memory|history|stats|pattern|my activity|what have i)\b|حافظه|تاریخچه|آمار/;

  // Timer-specific (high priority — "set timer" not "set reminder")
  if (/\btimer\b|تایمر/.test(t) && /\b(start|set|begin|run)\b|شروع|تنظیم/.test(t)) return 'startTimer';
  if (/\b(stop|cancel|clear|pause)\s+(the\s+)?timer\b|تایمر\s*(?:رو|روی)\s*(?:بسپار|کنسل|متوقف)/.test(t)) return 'stopTimer';

  // Reminder
  if (addVerbs.test(t) && (reminderNouns.test(t) || /\bremind\s+me\b|یادم\s*باشه|یادآوری\s*کن/.test(t))) return 'addReminder';

  // Activity
  if (addVerbs.test(t) && activityNouns.test(t)) return 'addActivity';

  // Task (treat like activity if no explicit activity word but "task" present)
  if (addVerbs.test(t) && taskNouns.test(t)) return 'addTask';

  // Habit
  if (addVerbs.test(t) && habitNouns.test(t)) return 'addHabit';

  // Countdown
  if (addVerbs.test(t) && countdownNouns.test(t)) return 'setCountdown';

  // Note
  if (addVerbs.test(t) && noteNouns.test(t)) return 'setNote';

  // View switch
  if (/\b(open|show|go to|switch to|view)\s+(?:the\s+)?(daily|weekly|monthly|yearly)\b|نمایش\s*(روزانه|هفتگی|ماهانه|سالانه)/.test(t)) return 'switchView';

  // Navigate to date
  if (/\b(go to|jump to|navigate|open)\s+(?:date|day)?\b|برو\s*به|باز\s*کن/.test(t) && parseAnyDate(text)) return 'navigate';

  // Plan
  if (planNouns.test(t) && !addVerbs.test(t)) return 'plan';
  if (planNouns.test(t) && /\bplan\s+(my|the|a)?\s*(week|day|schedule)/.test(t)) return 'plan';

  // Memory / stats
  if (memoryNouns.test(t)) return 'memory';

  // Guide
  if (guideNouns.test(t)) return 'guide';

  // Break
  if (breakNouns.test(t)) return 'break';

  // Tips
  if (tipNouns.test(t)) return 'tips';

  // Greeting
  if (/\b(hi|hello|hey|greetings|howdy)\b|سلام|درود/.test(t) && text.length < 25) return 'greet';

  // Thanks
  if (/\b(thank|thanks|appreciate)\b|ممنون|سپاس|تشکر/.test(t)) return 'thanks';

  // Fallback: if there's a date and an action verb, treat as reminder
  if (addVerbs.test(t) && parseAnyDate(text)) return 'addReminder';

  return 'unknown';
}

// ─── Action execution ─────────────────────────────────────────────────────────

function executeIntent(intent: Intent, text: string): { response: string; action?: AssistantAction; actionLabel?: string } {
  const persian = isPersian(text) || isMixed(text);

  switch (intent) {
    case 'addReminder': {
      const date = parseAnyDate(text);
      // Extract title: "remind me to study" / "set reminder for exam"
      let title = text
        .replace(/(?:set|add|create|make|schedule)\s+(?:a\s+)?remind(?:er)?\s+(?:for|to|on)?\s*/i, '')
        .replace(/(?:remind\s+me\s+(?:to|about|on|for))\s*/i, '')
        .replace(/یادآور\s*(برای|به|در)?\s*/g, '')
        .replace(/یادم\s*باشه\s*(که|به|برای)?\s*/g, '')
        .trim();
      // Remove date words from title
      if (date) {
        title = title.replace(new RegExp(date.display, 'gi'), '').trim();
      }
      title = title.replace(/\s+(?:on|at|for|tomorrow|today|next week)\s*.*$/i, '').trim();
      if (!title) title = persian ? 'یادآور' : 'Reminder';

      if (!date) {
        return { response: persian ? `متوجه شدم «${title}». اما تاریخ رو پیدا نکردم. مثلا بگو: «یادآور برای ۲ مرداد»` : `I caught "${title}", but I couldn't find a date. Try: "remind me to ${title} on 2 Mordad" or "tomorrow evening".` };
      }
      const offset: ReminderOffset = 0;
      recordMemory('reminder', title);
      const confirm = persian
        ? `انجام شد. یادآور «${title}» برای ${date.display} ثبت شد.`
        : `Done. I added your reminder "${title}" for ${date.display}.`;
      return { response: confirm, action: { type: 'addReminder', dateKey: date.dateKey, title, offset }, actionLabel: 'Reminder added' };
    }

    case 'addActivity':
    case 'addTask': {
      const date = parseAnyDate(text);
      // "add activity study from 9am to 11am" / "add task to study math at 6pm"
      const timeMatch = text.match(/(?:from\s+)?(\d{1,2}(?::\d{2})?\s*[ap]m?)\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?\s*[ap]m?)/i);
      const atMatch = text.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*[ap]m?)/i);

      let name = text
        .replace(/(?:add|create|set|make|schedule)\s+(?:an?\s+)?(?:activity|task|event|session|block)\s+(?:to\s+)?/i, '')
        .replace(/(?:from|at|on)\s+\d{1,2}(?::\d{2})?\s*[ap]m?.*$/i, '')
        .trim();
      name = name.replace(/\b(?:study|do|practice)\s+/i, '').trim();
      if (!name) name = persian ? 'فعالیت' : 'Study session';

      let from = '09:00';
      let to = '10:00';
      if (timeMatch) {
        const f = normalizeTime(timeMatch[1]);
        const t2 = normalizeTime(timeMatch[2]);
        if (f && t2) { from = f; to = t2; }
      } else if (atMatch) {
        const f = normalizeTime(atMatch[1]);
        if (f) { from = f; to = `${String((parseInt(f.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`; }
      } else {
        const tod = parseTimeOfDay(text);
        if (tod) { from = tod; to = `${String((parseInt(tod.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`; }
      }

      const activity: Activity = { id: crypto.randomUUID(), name, from, to, note: '' };
      recordMemory('activity', name, parseInt(from.slice(0, 2), 10));

      const dateNote = date && date.dateKey !== dateKey(todayGreg())
        ? (persian ? ` برای ${date.display}` : ` for ${date.display}`)
        : '';
      const confirm = persian
        ? `انجام شد. فعالیت «${name}» از ${from} تا ${to}${dateNote} اضافه شد.`
        : `Done. I added the activity "${name}" from ${from} to ${to}${dateNote}.`;
      return { response: confirm, action: { type: 'addActivity', activity }, actionLabel: 'Activity added' };
    }

    case 'setNote': {
      const noteMatch = text.match(/(?:set|add|write|put)\s+(?:the\s+)?(?:top\s+)?note\s*[:\-]?\s*(.+)/i)
        || text.match(/یادداشت\s*[:：]?\s*(.+)/);
      if (noteMatch && noteMatch[1].trim().length > 0) {
        const note = noteMatch[1].trim().slice(0, 500);
        return {
          response: persian ? `انجام شد. یادداشت امروز تنظیم شد: «${note}»` : `Done. I set today's note to: "${note}"`,
          action: { type: 'setTopNote', note },
          actionLabel: 'Note set',
        };
      }
      return { response: persian ? 'چه چیزی در یادداشت بنویسم؟' : 'What should I write in the note?' };
    }

    case 'addHabit': {
      const habitMatch = text.match(/(?:add|create)\s+(?:a\s+)?habit\s+(.+)/i) || text.match(/عادت\s+(.+)/);
      if (habitMatch) {
        const name = habitMatch[1].trim().slice(0, 60);
        const isValue = /\b(\d+)\s*(pages?|mins?|minutes|hours?|reps?|km|m|l|cups?)\b/i.test(name);
        const habitType: HabitType = isValue ? 'value' : 'checkbox';
        const unit = isValue ? (name.match(/\b(pages?|mins?|minutes|hours?|reps?|km|m|l|cups?)\b/i)?.[1] || null) : null;
        recordMemory('habit', name);
        return {
          response: persian ? `انجام شد. عادت «${name}» به امروز اضافه شد.` : `Done. I added habit "${name}" to today.`,
          action: { type: 'addHabitToDay', name, habitType, unit },
          actionLabel: 'Habit added',
        };
      }
      return { response: persian ? 'چه عادتی اضافه کنم؟' : 'What habit should I add?' };
    }

    case 'setCountdown': {
      const date = parseAnyDate(text);
      const nameMatch = text.match(/(?:set|create|add)\s+(?:a\s+)?countdown\s+(?:to\s+)?(.+?)(?:\s+in\s+\d+\s*days?|\s+on\s+\d{4}-\d{2}-\d{2}|$)/i);
      let name = nameMatch ? nameMatch[1].trim().slice(0, 60) : 'Countdown';
      if (date) name = name.replace(new RegExp(date.display, 'gi'), '').trim() || name;
      if (!name) name = 'Countdown';

      if (date) {
        return {
          response: persian ? `انجام شد. شمارش معکوس «${name}» برای ${date.display} تنظیم شد.` : `Done. Countdown "${name}" set for ${date.display}.`,
          action: { type: 'setCountdown', config: { name, targetDate: date.dateKey } },
          actionLabel: 'Countdown set',
        };
      }
      const daysMatch = text.match(/in\s+(\d+)\s*days?/i);
      if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        const d = new Date();
        d.setDate(d.getDate() + days);
        const targetDate = d.toISOString().slice(0, 10);
        return {
          response: persian ? `انجام شد. شمارش معکوس «${name}» برای ${days} روز دیگر تنظیم شد.` : `Done. Countdown "${name}" set for ${days} days from now.`,
          action: { type: 'setCountdown', config: { name, targetDate } },
          actionLabel: 'Countdown set',
        };
      }
      return { response: persian ? 'تاریخ شمارش معکوس رو بگو.' : 'What date should I set the countdown to?' };
    }

    case 'startTimer': {
      const m = normalizePersianDigits(text).match(/(\d+)\s*(min|mins|minutes?|h|hours?|sec|secs|seconds?|دقیقه|ساعت|ثانیه)?/i);
      if (m) {
        const num = parseInt(m[1], 10);
        const unit = (m[2] || 'min').toLowerCase();
        let seconds = num * 60;
        if (unit.startsWith('h') || unit.includes('ساعت')) seconds = num * 3600;
        else if (unit.startsWith('sec') || unit.includes('ثانیه')) seconds = num;
        const label = unit.startsWith('h') || unit.includes('ساعت') ? `${num} hour${num !== 1 ? 's' : ''}` : unit.startsWith('sec') || unit.includes('ثانیه') ? `${num} seconds` : `${num} minute${num !== 1 ? 's' : ''}`;
        recordMemory('timer', label);
        return {
          response: persian ? `تایمر ${label} شروع شد. تمرکز کن!` : `Timer started — ${label}. I'll let you know when it's done.`,
          action: { type: 'startTimer', seconds, label },
          actionLabel: 'Timer started',
        };
      }
      return { response: persian ? 'تایمر چند دقیقه؟' : 'How long should the timer be?' };
    }

    case 'stopTimer':
      return { response: persian ? 'تایمر متوقف شد.' : 'Timer stopped.', action: { type: 'stopTimer' }, actionLabel: 'Timer stopped' };

    case 'switchView': {
      const viewMatch = text.match(/(daily|weekly|monthly|yearly)/i) || text.match(/(روزانه|هفتگی|ماهانه|سالانه)/);
      if (viewMatch) {
        const v = viewMatch[1].toLowerCase();
        const view = v.includes('day') || v.includes('روز') ? 'daily'
          : v.includes('week') || v.includes('هفت') ? 'weekly'
          : v.includes('month') || v.includes('ماه') ? 'monthly'
          : 'yearly';
        return {
          response: persian ? `انجام شد. به نمایش ${view === 'daily' ? 'روزانه' : view === 'weekly' ? 'هفتگی' : view === 'monthly' ? 'ماهانه' : 'سالانه'} رفتم.` : `Done. Switched to the ${view} view.`,
          action: { type: 'switchView', view: view as 'daily' | 'weekly' | 'monthly' | 'yearly' },
          actionLabel: 'View switched',
        };
      }
      return { response: persian ? 'کدام نمایش؟ روزانه، هفتگی، ماهانه یا سالانه؟' : 'Which view? Daily, weekly, monthly, or yearly?' };
    }

    case 'navigate': {
      const date = parseAnyDate(text);
      if (date) {
        return {
          response: persian ? `انجام شد. به ${date.display} رفتم.` : `Done. Navigated to ${date.display}.`,
          action: { type: 'navigateToDate', dateKey: date.dateKey },
          actionLabel: 'Navigated',
        };
      }
      return { response: persian ? 'تاریخ رو بگو.' : 'What date should I go to?' };
    }

    case 'plan':
      return { response: generateAdaptivePlan(text, persian) };

    case 'memory': {
      const a = analyzeMemory();
      if (a.totalActivities === 0) {
        return { response: persian ? 'هنوز فعالیت زیادی ثبت نشده. هر بار که کاری برات انجام می‌دم، یادت می‌مونم و کم‌کم الگوها رو پیدا می‌کنم.' : 'I don\'t have much history yet. Each time I do something for you, I remember it and start spotting your patterns.' };
      }
      const peakDesc = a.topHours.length > 0 ? a.topHours.map(h => persian ? describeHourFa(h) : describeHour(h)).join(', ') : 'varies';
      const consistencyPct = Math.round(a.consistency * 100);
      return {
        response: persian
          ? `این آمار تو از هفته گذشته:\n- فعالیت‌های ثبت‌شده: ${a.totalActivities}\n- ساعت مطالعه (تقریبی): ${a.studyHours}\n- بیشترین فعالیت: ${peakDesc}\n- نظم: ${consistencyPct}%\n\n${a.consistency >= 0.5 ? 'منظم هستی، ادامه بده!' : 'سعی کن هر روز کمی کار کنی تا الگوی پایداری بسازی.'}`
          : `Here's your activity from the past week:\n- Logged activities: ${a.totalActivities}\n- Estimated study hours: ${a.studyHours}\n- Most active: ${peakDesc}\n- Consistency: ${consistencyPct}%\n\n${a.consistency >= 0.5 ? 'You\'re consistent — keep it up!' : 'Try to do a little each day to build a steady pattern.'}`,
      };
    }

    case 'guide':
      return { response: generateGuidance(text, persian) };

    case 'break':
      return { response: generateBreakAdvice(persian) };

    case 'tips':
      return { response: generateTips(text, persian) };

    case 'greet':
      return { response: persian ? persianGreeting() : englishGreeting() };

    case 'thanks':
      return { response: persian ? 'خواهش می‌کنم! هر وقت خواستی بگو.' : "You're welcome! Ask me anytime." };

    default:
      return { response: persian ? persianFallback() : englishFallback() };
  }
}

// ─── Conversational responses ─────────────────────────────────────────────────

function englishGreeting(): string {
  return "Hi! I'm the T-Minus Assistant. I can plan your day, set reminders, add tasks, start timers, or guide you around the app. What do you need?";
}

function persianGreeting(): string {
  return 'سلام! من دستیار تِ‌ماینوس هستم. می‌تونم برنامه روزانه بسازم، یادآور تنظیم کنم، فعالیت اضافه کنم، تایمر بذارم، یا راهنماییت کنم. چه کمکی از من برمیاد؟';
}

function englishFallback(): string {
  return [
    "I'm not sure I caught that. Here's what I can do:",
    '',
    '- "Plan my week" — a personalized schedule based on your activity',
    '- "Remind me to study tomorrow evening" — creates a reminder',
    '- "Add math study at 6pm" — adds an activity',
    '- "Set a timer for 25 minutes"',
    '- "Set countdown to exam on 2 Mordad" — Jalali date support',
    '- "Where is the countdown bar?" — app guidance',
    '- "برنامه روزانه بساز" — پشتیبانی فارسی',
  ].join('\n');
}

function persianFallback(): string {
  return [
    'متوجه نشدم. این کارهایی هست که می‌تونم انجام بدم:',
    '',
    '- «برنامه هفته‌ام رو بکش» — برنامه شخصی‌سازی‌شده',
    '- «یادآور برای فردا عصر مطالعه» — ساخت یادآور',
    '- «فعالیت ریاضی ساعت ۶ عصر» — اضافه کردن فعالیت',
    '- «تایمر ۲۵ دقیقه»',
    '- «شمارش معکوس امتحان ۲ مرداد» — پشتیبانی تاریخ شمسی',
    '- «شمارش معکوس کجاست؟» — راهنمای اپ',
  ].join('\n');
}

function generateGuidance(input: string, persian: boolean): string {
  const t = input.toLowerCase();
  if (persian) {
    if (/شمارش|countdown/.test(t)) return 'نوار شمارش معکوس بالای صفحه است. روی «افزودن شمارش معکوس» بزن تا تاریخ هدف رو تنظیم کنی. می‌تونی با آیکون‌های کناری ویرایش یا حذفش کنی.';
    if (/عادت|habit/.test(t)) return 'عادت‌ها در نمایش روزانه هستن. می‌تونی عادت رو به قالب (تکرارشونده) یا فقط به امروز اضافه کنی. عادت‌های چک‌باکس انجام/نشده رو دنبال می‌کنن؛ عادت‌های مقداری یک عدد مثل صفحات خونده‌شده.';
    if (/یادآور|reminder/.test(t)) return 'یادآورها در نمایش روزانه و ماهانه دیده می‌شن. با دکمه + اضافه کن — به یک تاریخ وصل می‌شه و می‌تونی کامل/تعویض/لغوش کنی.';
    if (/اتاق|room|گروه/.test(t)) return 'اتاق‌های مطالعه اجازه می‌دن با دیگران مطالعه کنی. از نوار بالا بازش کن. می‌تونی اتاق بسازی، دوست دعوت کنی، چت کنی و تایمر مشترک بذاری.';
    if (/تقویم|شمس|میلادی|persian/.test(t)) return 'تعویض تقویم شمسی و میلادی از بالا-چپ. کل اپ — نوار تاریخ، گرید ماهانه، نمایش سالانه — به انتخابت adapte می‌شه.';
    if (/تم|theme|تاریک|روشن/.test(t)) return 'تم‌ها در پروفایلت هستن. پروفایل رو از آواتار بالا-راست باز کن و بین روشن و تاریک سوییچ کن. انتخابت خودکار ذخیره می‌شه.';
    if (/پروفایل|account|settings/.test(t)) return 'پروفایل رو از آواتار بالا-راست باز کن. می‌تونی نام، نام کاربری، منطقه زمانی، تم و بازخورد رو مدیریت کنی.';
    if (/یادداشت|note|هفتگی|ماهانه/.test(t)) return 'هر روز، هفته و ماه یادداشت خودش رو داره. در نمایش روزانه یادداشت روز رو می‌بینی؛ نمایش‌های هفتگی و ماهانه یادداشت‌هاشون تو پنلشون هستن. خودکار ذخیره می‌شن.';
    return [
      'نقشه کلی تِ‌ماینوس:',
      '',
      '- نوار بالا: نوع تقویم (شمسی/میلادی)، نوع نمایش، شمارش معکوس، پروفایل.',
      '- نمایش روزانه: فعالیت‌ها، عادت‌ها، یادآورها، یادداشت روز.',
      '- نمایش‌های هفتگی/ماهانه: گرید کلی با یادداشت.',
      '- اتاق مطالعه: مطالعه گروهی با چت و تایمر.',
      '- پروفایل: تنظیمات، تم، بازخورد.',
      '',
      'درباره هر کدوم بپرس تا بیشتر توضیح بدم.',
    ].join('\n');
  }

  if (/countdown/.test(t)) return 'The countdown bar sits at the top of the page. Click "Add a countdown" to set a target date — it shows the days remaining. You can edit or remove it anytime with the small icons next to it.';
  if (/habit/.test(t)) return 'Habits live in the Daily view. Add a habit to your template (recurring) or just to today. Checkbox habits track done/not-done; value habits track a number like pages read or minutes exercised.';
  if (/remind/.test(t)) return 'Reminders appear in the Daily and Monthly views. Add one with the + button — it ties to a date and can be marked completed, postponed, or cancelled. You can also ask me to create one.';
  if (/study room|room|group/.test(t)) return 'Study Rooms let you study with others. Open it from the top nav. You can create a room, invite friends, chat, and run a shared timer.';
  if (/calendar|shamsi|gregorian|persian/.test(t)) return 'Switch between Shamsi (Persian) and Gregorian calendars from the top-left toggle. The whole app — date bar, monthly grid, yearly view — adapts to your selection.';
  if (/theme|dark|light/.test(t)) return 'Themes live in your Profile. Open your profile from the top-right avatar, then switch between light and dark. Your choice saves automatically.';
  if (/profile|account|settings/.test(t)) return 'Open your profile from the avatar in the top-right. There you can edit your name, username, timezone, theme, and send feedback.';
  if (/note|weekly|monthly/.test(t)) return 'Each day, week, and month has its own note. In Daily view you\'ll see the day note; Weekly and Monthly views have notes in their panels. They save automatically as you type.';
  return [
    'Here\'s a quick map of T-Minus:',
    '',
    '- Top bar: calendar type (Shamsi/Gregorian), view mode (daily/weekly/monthly/yearly), countdown, profile.',
    '- Daily view: activities, habits, reminders, and a day note.',
    '- Weekly/Monthly views: overview grids with notes.',
    '- Study Rooms: group study with chat and a shared timer.',
    '- Profile: settings, theme, and feedback.',
    '',
    'Ask me about any of these for more detail.',
  ].join('\n');
}

function generateTips(input: string, persian: boolean): string {
  if (persian) {
    const tips: string[] = [];
    if (/تمرکز|focus/.test(input)) tips.push('- تکنیک پومودورو: ۲۵ دقیقه تمرکز، ۵ دقیقه استراحت.');
    if (/انگیزه|motivat|تنبلی/.test(input)) tips.push('- با یک کار ۲ دقیقه‌ای شروع کن — حرکت از انگیزه مهم‌تره.');
    if (/امتحان|exam/.test(input)) tips.push('- سوالات تمرینی رو تحت زمان انجام بده تا امتحان واقعی رو شبیه‌سازی کنی.');
    if (tips.length === 0) {
      tips.push('- شب قبل برنامه‌ریزی کن تا صبح با جهت شروع کنی.');
      tips.push('- بلوک‌های زمانی بذار: هر بلوک یک کار مشخص.');
      tips.push('- استراحت رو برنامه‌ریزی کن — استراحت بخشی از بهره‌وریه.');
    }
    return ['چند نکته که کمک می‌کنه:', '', ...tips].join('\n');
  }
  const tips: string[] = [];
  if (/focus|concentrat|distract/.test(input)) {
    tips.push('- Try the Pomodoro technique: 25 minutes of focused work, then a 5-minute break.');
    tips.push('- Put your phone in another room or use an app blocker during study sessions.');
  }
  if (/motivat|procrastinat|lazy|stuck/.test(input)) {
    tips.push('- Start with a 2-minute task — momentum beats motivation.');
    tips.push('- Break big tasks into small steps and check them off as you go.');
  }
  if (/remember|memori|retain|forget/.test(input)) {
    tips.push('- Use active recall: close your notes and write what you remember, then check.');
    tips.push('- Space out your review sessions over days instead of cramming in one night.');
  }
  if (/exam|test|midterm|final/.test(input)) {
    tips.push('- Do practice questions under timed conditions to simulate the real thing.');
    tips.push('- Review your mistakes — understanding why matters more than the score.');
  }
  if (tips.length === 0) {
    tips.push('- Plan your day the night before so you start with direction, not decisions.');
    tips.push('- Use time blocks: assign a specific task to each block and protect that time.');
    tips.push('- Don\'t forget to schedule breaks. Rest is part of productivity.');
  }
  return ['Here are some tips that might help:', '', ...tips].join('\n');
}

function generateBreakAdvice(persian: boolean): string {
  if (persian) {
    return [
      'به نظر نیاز به یک استراحت داری. این برنامه سریع:',
      '',
      '۱. حداقل ۱۰ دقیقه از میز بلند شو.',
      '۲. آب بنوش و یک میان‌وعده سبک بخور.',
      '۳. یک پیاده‌روی کوتاه یا کشش انجام بده.',
      '۴. وقتی برگشتی، یک کار کوچیک رو شروع کن.',
    ].join('\n');
  }
  return [
    'It sounds like you need a reset. Here\'s a quick plan:',
    '',
    '1. Step away from your desk for at least 10 minutes.',
    '2. Drink water and have a light snack.',
    '3. Take a short walk or do some light stretching.',
    '4. When you return, pick one small task to ease back in.',
  ].join('\n');
}

// ─── Main entry ───────────────────────────────────────────────────────────────

function generateResponse(messages: ChatMessage[]): AssistantResponse {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return { content: englishGreeting() };

  const text = lastUserMsg.content;
  const intent = detectIntent(text);
  const result = executeIntent(intent, text);
  return { content: result.response, action: result.action, actionLabel: result.actionLabel };
}

export async function sendClaudeChat(messages: ChatMessage[]): Promise<AssistantResponse> {
  await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 350));
  return generateResponse(messages);
}

// Public API for the UI to record actions the user performs manually (so memory grows)
export function recordUserAction(type: 'activity' | 'reminder' | 'habit' | 'timer' | 'plan', label: string, hour?: number): void {
  recordMemory(type, label, hour);
}
