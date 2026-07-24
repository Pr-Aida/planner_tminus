import type { Activity, CountdownConfig, HabitType } from '../types';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantResponse {
  content: string;
  action?: AssistantAction;
}

export type AssistantAction =
  | { type: 'addActivity'; activity: Activity }
  | { type: 'setTopNote'; note: string }
  | { type: 'addHabitToDay'; name: string; habitType: HabitType; unit: string | null }
  | { type: 'setCountdown'; config: CountdownConfig }
  | { type: 'startTimer'; seconds: number; label: string }
  | { type: 'stopTimer' }
  | { type: 'switchView'; view: 'daily' | 'weekly' | 'monthly' | 'yearly' };

const PERSIAN_RANGE = /[\u0600-\u06FF]/;

function isPersian(text: string): boolean {
  return PERSIAN_RANGE.test(text);
}

function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some(k => text.includes(k));
}

// ─── Persian responses ──────────────────────────────────────────────────────

function persianGreeting(): string {
  return 'سلام! من دستیار تِ‌ماینوس هستم. می‌تونم برایت برنامه روزانه بسازم، تایمر تنظیم کنم، یا نحوه استفاده از اپ رو توضیح بدم. چه کمکی از من برمیاد؟';
}

function persianFallback(): string {
  return [
    'متوجه نشدم. این کارهایی هست که می‌تونم انجام بدم:',
    '',
    '- «برنامه روزانه بساز» — یک برنامه ساعت‌به‌ساعت می‌سازم',
    '- «تایمر ۲۵ دقیقه» — تایمر مطالعه رو شروع می‌کنم',
    '- «فعالیت اضافه کن» — یک فعالیت به روزت اضافه می‌کنم',
    '- «کجا پیدا می‌شه» — راهنمایی استفاده از اپ',
  ].join('\n');
}

function persianPlan(input: string): string {
  const wakeMatch = input.match(/(\d{1,2})/);
  const startHour = wakeMatch ? parseInt(wakeMatch[1], 10) : 7;
  const slots = [
    `${startHour}:۰۰ — روتین صبح`,
    `${startHour + 1}:۰۰ — مطالعه عمیق`,
    `${startHour + 3}:۳۰ — استراحت کوتاه`,
    `${startHour + 4}:۰۰ — تمرین و حل مسئله`,
    `${startHour + 5}:۳۰ — ناهار و استراحت`,
    `${startHour + 6}:۳۰ — مرور و خلاصه‌نویسی`,
    `${startHour + 8}:۰۰ — ورزش/پیاده‌روی`,
    `${startHour + 9}:۰۰ — برنامه‌ریزی فردا`,
  ];
  return ['این برنامه پیشنهادی بر اساس ورودی شماست:', '', ...slots, '', 'نکته: سخت‌ترین درس رو اول صبح انجام بده.'].join('\n');
}

function persianTimer(input: string): string {
  const m = input.match(/(\d+)\s*(?:دقیقه|min)/i);
  const mins = m ? parseInt(m[1], 10) : 25;
  return `تایمر ${mins} دقیقه شروع شد. تمرکز کن!`;
}

function persianGuidance(): string {
  return [
    'راهنمای استفاده از تِ‌ماینوس:',
    '',
    '- بالای صفحه: انتخاب نوع تقویم (شمسی/میلادی) و نوع نمایش (روزانه/هفتگی/ماهانه/سالانه)',
    '- نوار شمارش معکوس: تاریخ مهمت رو ثبت کن تا روزهای باقی‌مونده رو ببینی',
    '- بخش روزانه: فعالیت‌ها، عادت‌ها و یادآورها',
    '- اتاق مطالعه: مطالعه گروهی با دوستان',
    '- پروفایل: تنظیمات، تم و بازخورد',
  ].join('\n');
}

// ─── English planning ────────────────────────────────────────────────────────

function generateDailyPlan(input: string): string {
  const wakeMatch = input.match(/(\d{1,2})\s*(?:am|pm)?\s*(?:wake|start|begin|up|morning)/i);
  const wakeHour = wakeMatch ? parseInt(wakeMatch[1], 10) : 7;
  const startHour = wakeHour > 12 ? wakeHour - 12 : wakeHour;

  const subjectsMatch = input.match(/(?:study|subjects?|topics?|focus)\s*(?:on|:)?\s*([a-z0-9,\s]+)/i);
  const subjects = subjectsMatch
    ? subjectsMatch[1].split(/[,/]| and /i).map(s => s.trim()).filter(Boolean).slice(0, 4)
    : [];

  const hasGym = /\bgym\b|workout|exercise|train/i.test(input);
  const hasExam = /\bexam\b|midterm|final/i.test(input);
  const hasBusy = /\bbusy\b|packed|hectic/i.test(input);

  const blocks: { label: string; duration: number; type: 'study' | 'break' | 'routine' }[] = [
    { label: 'Morning Routine', duration: 1, type: 'routine' },
    { label: subjects[0] || 'Deep Study', duration: 2, type: 'study' },
    { label: 'Short Break', duration: 0.5, type: 'break' },
    { label: subjects[1] || 'Practice Problems', duration: 1.5, type: 'study' },
    { label: 'Lunch & Rest', duration: 1, type: 'break' },
  ];

  if (hasGym) {
    blocks.push({ label: 'Gym / Workout', duration: 1, type: 'routine' });
    blocks.push({ label: 'Short Break', duration: 0.5, type: 'break' });
  }

  blocks.push(
    { label: subjects[2] || 'Review & Notes', duration: 1.5, type: 'study' },
    { label: 'Short Break', duration: 0.5, type: 'break' },
  );

  if (hasExam) {
    blocks.push({ label: 'Exam Practice Questions', duration: 1.5, type: 'study' });
  } else {
    blocks.push({ label: subjects[3] || 'Light Reading', duration: 1, type: 'study' });
  }

  if (!hasGym) {
    blocks.push({ label: 'Exercise / Walk', duration: 0.5, type: 'routine' });
  }

  blocks.push({ label: 'Wind Down & Plan Tomorrow', duration: 0.5, type: 'routine' });

  const slots: string[] = [];
  let currentHour = startHour;
  let ampm = wakeMatch && /pm/i.test(wakeMatch[0]) ? 'PM' : 'AM';
  if (wakeHour >= 12) ampm = 'PM';

  for (const block of blocks) {
    const startLabel = formatHour(currentHour, ampm);
    const endH = currentHour + block.duration;
    const wrapped = wrapHour(endH, ampm);
    const endLabel = formatHour(wrapped.hour, wrapped.ampm);
    const icon = block.type === 'study' ? '[Study]' : block.type === 'break' ? '[Break]' : '[Routine]';
    slots.push(`${startLabel} – ${endLabel}  ${icon} ${block.label}`);
    currentHour = wrapped.hour;
    ampm = wrapped.ampm;
  }

  const tips: string[] = [];
  if (hasExam) tips.push('- Prioritize practice questions — simulate the real exam under timed conditions.');
  if (hasGym) tips.push('- Schedule gym after your hardest study block to decompress.');
  if (hasBusy) tips.push('- Protect your morning study block — that\'s your highest-value time.');
  tips.push('- Tackle the hardest subject first when your energy is highest.');
  tips.push('- Keep breaks screen-free to let your eyes and mind rest.');

  return ['Here\'s a suggested daily plan:', '', ...slots, '', 'Tips:', ...tips].join('\n');
}

function formatHour(hour: number, ampm: string): string {
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  const suffix = hour % 1 !== 0 ? ':30' : ':00';
  return `${Math.floor(display)}${suffix} ${ampm}`;
}

function wrapHour(hour: number, ampm: string): { hour: number; ampm: string } {
  if (hour >= 12) {
    if (ampm === 'AM') ampm = 'PM';
    else ampm = 'AM';
    hour = hour > 12 ? hour - 12 : hour;
  }
  return { hour, ampm };
}

// ─── English tips ────────────────────────────────────────────────────────────

function generateTips(input: string): string {
  const tips: string[] = [];
  if (hasAny(input, ['focus', 'concentrate', 'distract'])) {
    tips.push('- Try the Pomodoro technique: 25 minutes of focused work, then a 5-minute break.');
    tips.push('- Put your phone in another room or use an app blocker during study sessions.');
  }
  if (hasAny(input, ['motivat', 'procrastinat', 'lazy', 'stuck'])) {
    tips.push('- Start with a 2-minute task — momentum beats motivation.');
    tips.push('- Break big tasks into small steps and check them off as you go.');
  }
  if (hasAny(input, ['remember', 'memori', 'retain', 'forget'])) {
    tips.push('- Use active recall: close your notes and write what you remember, then check.');
    tips.push('- Space out your review sessions over days instead of cramming in one night.');
  }
  if (hasAny(input, ['exam', 'test', 'midterm', 'final'])) {
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

function generateBreakAdvice(): string {
  return [
    'It sounds like you need a reset. Here\'s a quick plan:',
    '',
    '1. Step away from your desk for at least 10 minutes.',
    '2. Drink water and have a light snack.',
    '3. Take a short walk or do some light stretching.',
    '4. When you return, pick one small task to ease back in.',
  ].join('\n');
}

function generateGreeting(): string {
  const greetings = [
    "Hi! I'm the T-Minus Assistant. I can build daily plans, set timers, add activities, or guide you around the app. What do you need?",
    "Hello! Ready to plan your day? Tell me what you're studying or what time you start, and I'll draft a schedule.",
  ];
  return greetings[Math.floor(Math.random() * greetings.length)];
}

function generateThanks(): string {
  return "You're welcome! Ask me anytime if you need a plan, a timer, or help finding a feature.";
}

// ─── Website guidance ─────────────────────────────────────────────────────────

function generateGuidance(input: string): string {
  const t = input.toLowerCase();
  if (hasAny(t, ['countdown'])) {
    return 'The countdown bar sits at the top of the page. Click "Add a countdown" to set a target date — it shows the days remaining. You can edit or remove it anytime with the small icons next to it.';
  }
  if (hasAny(t, ['habit'])) {
    return 'Habits live in the Daily view. Add a habit to your template (recurring) or just to today. Checkbox habits track done/not-done; value habits track a number like pages read or minutes exercised.';
  }
  if (hasAny(t, ['reminder'])) {
    return 'Reminders appear in the Daily and Monthly views. Add one with the + button — it ties to a date and can be marked completed, postponed, or cancelled.';
  }
  if (hasAny(t, ['study room', 'room', 'group'])) {
    return 'Study Rooms let you study with others. Open it from the top nav. You can create a room, invite friends, chat, and run a shared timer.';
  }
  if (hasAny(t, ['calendar', 'shamsi', 'gregorian', 'persian'])) {
    return 'Switch between Shamsi (Persian) and Gregorian calendars from the top-left toggle. The whole app — date bar, monthly grid, yearly view — adapts to your selection.';
  }
  if (hasAny(t, ['theme', 'dark', 'light'])) {
    return 'Themes live in your Profile. Open your profile from the top-right avatar, then switch between light and dark. Your choice saves automatically.';
  }
  if (hasAny(t, ['profile', 'account', 'settings'])) {
    return 'Open your profile from the avatar in the top-right. There you can edit your name, username, timezone, theme, and send feedback.';
  }
  if (hasAny(t, ['note', 'weekly', 'monthly'])) {
    return 'Each day, week, and month has its own note. In Daily view you\'ll see the day note; Weekly and Monthly views have notes in their panels. They save automatically as you type.';
  }
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

// ─── Task execution ───────────────────────────────────────────────────────────

function tryExecuteTask(input: string): { response: string; action?: AssistantAction } | null {
  const t = input.toLowerCase();

  // Add activity: "add activity study from 9 to 11"
  const activityMatch = input.match(/(?:add|create|set)\s+(?:an?\s+)?activity\s+(.+?)\s+from\s+(\d{1,2}(?::\d{2})?\s*[ap]m?)\s+to\s+(\d{1,2}(?::\d{2})?\s*[ap]m?)/i);
  if (activityMatch) {
    const name = activityMatch[1].trim();
    const from = normalizeTime(activityMatch[2]);
    const to = normalizeTime(activityMatch[3]);
    if (from && to) {
      const activity: Activity = { id: crypto.randomUUID(), name, from, to, note: '' };
      return { response: `Done! I added the activity "${name}" from ${from} to ${to} to today.`, action: { type: 'addActivity', activity } };
    }
  }

  // Set top note: "set note: remember to call mom"
  const noteMatch = input.match(/(?:set|add|write)\s+(?:the\s+)?(?:top\s+)?note\s*[:\-]?\s*(.+)/i);
  if (noteMatch && noteMatch[1].trim().length > 0) {
    const note = noteMatch[1].trim().slice(0, 500);
    return { response: `Got it — I set today's note to: "${note}"`, action: { type: 'setTopNote', note } };
  }

  // Add habit to day: "add habit read 30 pages"
  const habitMatch = input.match(/(?:add|create)\s+(?:a\s+)?habit\s+(.+)/i);
  if (habitMatch) {
    const name = habitMatch[1].trim().slice(0, 60);
    const isValue = /\b(\d+)\s*(pages?|mins?|minutes|hours?|reps?|km|m|l|cups?)\b/i.test(name);
    const habitType: HabitType = isValue ? 'value' : 'checkbox';
    const unit = isValue ? (name.match(/\b(pages?|mins?|minutes|hours?|reps?|km|m|l|cups?)\b/i)?.[1] || null) : null;
    return {
      response: `Added habit "${name}" to today's list. You can track it in the Daily view.`,
      action: { type: 'addHabitToDay', name, habitType, unit },
    };
  }

  // Set countdown: "set countdown to exam in 30 days" or "countdown to 2026-08-15"
  const countdownDaysMatch = input.match(/(?:set|create|add)\s+(?:a\s+)?countdown\s+(?:to\s+)?(.+?)\s+in\s+(\d+)\s*days?/i);
  if (countdownDaysMatch) {
    const name = countdownDaysMatch[1].trim().slice(0, 60);
    const days = parseInt(countdownDaysMatch[2], 10);
    const date = new Date();
    date.setDate(date.getDate() + days);
    const targetDate = date.toISOString().slice(0, 10);
    return {
      response: `Countdown "${name}" set — ${days} days from today (${targetDate}). You'll see it in the top bar.`,
      action: { type: 'setCountdown', config: { name, targetDate } },
    };
  }
  const countdownDateMatch = input.match(/(?:set|create|add)\s+(?:a\s+)?countdown\s+(?:to\s+)?(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})/i);
  if (countdownDateMatch) {
    const name = countdownDateMatch[1].trim().slice(0, 60);
    const targetDate = countdownDateMatch[2];
    return {
      response: `Countdown "${name}" set for ${targetDate}. You'll see it in the top bar.`,
      action: { type: 'setCountdown', config: { name, targetDate } },
    };
  }

  // Start timer: "set timer 25 minutes" or "timer 10 min" or "start a 5 minute timer"
  const timerMatch = input.match(/(?:set|start)\s+(?:a\s+)?timer\s*(?:for\s+)?(\d+)\s*(min|mins|minutes?|h|hours?|sec|secs|seconds?)?/i)
    || input.match(/timer\s+(\d+)\s*(min|mins|minutes?|h|hours?|sec|secs|seconds?)?/i);
  if (timerMatch) {
    const num = parseInt(timerMatch[1], 10);
    const unit = (timerMatch[2] || 'min').toLowerCase();
    let seconds = num * 60;
    if (unit.startsWith('h')) seconds = num * 3600;
    else if (unit.startsWith('sec')) seconds = num;
    const label = unit.startsWith('h') ? `${num} hour${num !== 1 ? 's' : ''}` : unit.startsWith('sec') ? `${num} seconds` : `${num} minute${num !== 1 ? 's' : ''}`;
    return {
      response: `Timer started — ${label}. I'll let you know when it's done.`,
      action: { type: 'startTimer', seconds, label },
    };
  }

  // Stop timer
  if (/\b(stop|cancel|clear)\s+(the\s+)?timer\b/i.test(input)) {
    return { response: 'Timer stopped.', action: { type: 'stopTimer' } };
  }

  // Switch view: "show weekly view" / "go to monthly"
  const viewMatch = input.match(/(?:show|go to|switch to|open)\s+(?:the\s+)?(daily|weekly|monthly|yearly)\s*(?:view)?/i);
  if (viewMatch) {
    const view = viewMatch[1].toLowerCase() as 'daily' | 'weekly' | 'monthly' | 'yearly';
    return { response: `Switched to the ${view} view.`, action: { type: 'switchView', view } };
  }

  return null;
}

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

// ─── Main intent router ───────────────────────────────────────────────────────

function generateResponse(messages: ChatMessage[]): AssistantResponse {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return { content: generateGreeting() };

  const text = lastUserMsg.content;
  const lowerText = text.toLowerCase();

  // Persian detection — route to Persian responses first
  if (isPersian(text)) {
    if (hasAny(lowerText, ['سلام', 'سلام', 'درود', 'hey', 'hello']) && text.length < 25) {
      return { content: persianGreeting() };
    }
    if (hasAny(lowerText, ['برنامه', 'plan', 'schedule', 'روزانه'])) {
      return { content: persianPlan(text) };
    }
    if (hasAny(lowerText, ['تایمر', 'timer', 'زمان'])) {
      return { content: persianTimer(text) };
    }
    if (hasAny(lowerText, ['راهنما', 'کجا', 'چطور', 'چجوری', 'help', 'guide'])) {
      return { content: persianGuidance() };
    }
    return { content: persianFallback() };
  }

  // Task execution (English)
  const exec = tryExecuteTask(text);
  if (exec) return { content: exec.response, action: exec.action };

  // Conversational
  if (hasAny(lowerText, ['hello', 'hi', 'hey', 'greetings', 'howdy']) && text.length < 20) {
    return { content: generateGreeting() };
  }
  if (hasAny(lowerText, ['thank', 'thanks', 'appreciate'])) {
    return { content: generateThanks() };
  }

  // Guidance
  if (hasAny(lowerText, ['where', 'how do i', 'how to', 'where is', 'find', 'guide', 'help me use', 'explain', 'what is'])) {
    return { content: generateGuidance(text) };
  }

  // Planning
  if (hasAny(lowerText, ['plan', 'schedule', 'daily plan', 'study plan', 'routine', 'organize my day', 'plan my day'])) {
    return { content: generateDailyPlan(text) };
  }

  // Break / overwhelm
  if (hasAny(lowerText, ['break', 'rest', 'tired', 'burnout', 'overwhelmed', 'exhausted'])) {
    return { content: generateBreakAdvice() };
  }

  // Tips
  if (hasAny(lowerText, ['tip', 'advice', 'how do i', 'how should', 'better', 'improve', 'focus', 'motivated', 'procrastinat', 'exam', 'test', 'midterm', 'final'])) {
    return { content: generateTips(text) };
  }

  // Fallback
  return {
    content: [
      "I'm not sure I caught that. Here's what I can do:",
      '',
      '- "Plan my day" — generate an hour-by-hour schedule',
      '- "Set a timer for 25 minutes" — start a countdown',
      '- "Add activity study from 9am to 11am" — add it to today',
      '- "Set countdown to exam in 30 days"',
      '- "Where is the countdown bar?" — app guidance',
      '- "برنامه روزانه بساز" — پشتیبانی فارسی',
    ].join('\n'),
  };
}

export async function sendClaudeChat(messages: ChatMessage[]): Promise<AssistantResponse> {
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));
  return generateResponse(messages);
}
