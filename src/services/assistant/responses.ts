import type { ResolvedLang } from './types';

export function greeting(lang: ResolvedLang): string {
  return lang === 'fa'
    ? 'سلام! من دستیار برنامه‌ریز تو هستم. می‌تونم برنامه روزانه بسازم، یادآور تنظیم کنم، فعالیت اضافه کنم، تایمر بذارم، تحلیل هفته‌ات رو نشون بدم یا راهنماییت کنم. چه کمکی از من برمیاد؟'
    : "Hi! I'm your planning assistant. I can create daily plans, set reminders, add tasks, start timers, analyze your week, or guide you around the app. What do you need?";
}

export function fallback(lang: ResolvedLang): string {
  return lang === 'fa'
    ? 'درخواستت را دقیق متوجه نشدم. می‌توانم برای امروز برنامه تنظیم کنم، کارها را اولویت‌بندی کنم، روند مطالعه‌ات را بررسی کنم یا یادآوری بسازم.'
    : "I'm not sure I understood that. I can help you plan your day, organize your tasks, analyze your study progress, or create a reminder.";
}

export function thanks(lang: ResolvedLang): string {
  return lang === 'fa' ? 'خواهش می‌کنم! هر وقت خواستی بگو.' : "You're welcome! Ask me anytime.";
}

export function pageGuidance(text: string, lang: ResolvedLang): string {
  const t = text.toLowerCase();
  if (lang === 'fa') {
    if (/شمارش|countdown/.test(t)) return 'نوار شمارش معکوس بالای صفحه است. روی «افزودن شمارش معکوس» بزن تا تاریخ هدف را تنظیم کنی.';
    if (/عادت|habit/.test(t)) return 'عادت‌ها در نمایش روزانه هستند. می‌توانی عادت را به قالب (تکرارشونده) یا فقط به امروز اضافه کنی.';
    if (/یادآور|reminder/.test(t)) return 'یادآورها در نمایش روزانه و ماهانه دیده می‌شوند. با دکمه + اضافه کن.';
    if (/اتاق|room|گروه/.test(t)) return 'اتاق‌های مطالعه اجازه می‌دهند با دیگران مطالعه کنی. از نوار بالا بازش کن.';
    if (/تقویم|شمس|میلادی|persian/.test(t)) return 'تعویض تقویم شمسی و میلادی از بالا-چپ انجام می‌شود.';
    if (/تم|theme|تاریک|روشن/.test(t)) return 'تم‌ها در پروفایلت هستند. پروفایل را از آواتار بالا-راست باز کن.';
    if (/پروفایل|account|settings/.test(t)) return 'پروفایل را از آواتار بالا-راست باز کن.';
    return ['نقشه کلی تِ‌ماینوس:', '', '- نوار بالا: نوع تقویم، نوع نمایش، شمارش معکوس، پروفایل.', '- نمایش روزانه: فعالیت‌ها، عادت‌ها، یادآورها.', '- نمایش‌های هفتگی/ماهانه: گرید کلی.', '- اتاق مطالعه: مطالعه گروهی.', '', 'درباره هر کدوم بپرس تا بیشتر توضیح بدم.'].join('\n');
  }
  if (/countdown/.test(t)) return 'The countdown bar sits at the top. Click "Add a countdown" to set a target date.';
  if (/habit/.test(t)) return 'Habits live in the Daily view. Add a habit to your template (recurring) or just to today.';
  if (/remind/.test(t)) return 'Reminders appear in Daily and Monthly views. Add one with the + button.';
  if (/study room|room|group/.test(t)) return 'Study Rooms let you study with others. Open it from the top nav.';
  if (/calendar|shamsi|gregorian|persian/.test(t)) return 'Switch between Shamsi and Gregorian calendars from the top-left toggle.';
  if (/theme|dark|light/.test(t)) return 'Themes live in your Profile. Open your profile from the top-right avatar.';
  if (/profile|account|settings/.test(t)) return 'Open your profile from the avatar in the top-right.';
  return ['Here\'s a quick map of T-Minus:', '', '- Top bar: calendar type, view mode, countdown, profile.', '- Daily view: activities, habits, reminders.', '- Weekly/Monthly views: overview grids.', '- Study Rooms: group study.', '', 'Ask me about any of these for more detail.'].join('\n');
}

export function lowEnergyAdvice(lang: ResolvedLang): string {
  return lang === 'fa'
    ? ['با توجه به انرژی کمت، پیشنهاد می‌کنم:', '', '- جلسات کوتاه ۲۰-۲۵ دقیقه‌ای', '- کارهای سبک و مرور', '- استراحت‌های بیشتر', '', 'سخت‌ترین کار را برای وقتی نگه دار که انرژی بیشتری داری.'].join('\n')
    : ['Given your low energy, I suggest:', '', '- Short 20-25 minute sessions', '- Light review tasks', '- More frequent breaks', '', 'Save the hardest tasks for when your energy is higher.'].join('\n');
}

export function highEnergyAdvice(lang: ResolvedLang): string {
  return lang === 'fa'
    ? 'انرژی بالات! وقت مناسبی برای مطالعه عمیق و کارهای دشواره. پیشنهاد می‌کنم جلسات ۴۵-۶۰ دقیقه‌ای بدون وقفه بذاری و سخت‌ترین درس را اول شروع کنی.'
    : 'You have high energy! This is a great time for deep work. I suggest 45-60 minute focused blocks and tackling your hardest subject first.';
}

export function overwhelmedAdvice(lang: ResolvedLang): string {
  return lang === 'fa'
    ? 'حجم کارهای فعلی بیشتر از زمان آزاد تو است. پیشنهاد می‌کنم دو کار ضروری‌تر را نگه داریم و بقیه را به روزهای بعد منتقل کنیم.'
    : 'You currently have more work than your available time allows. I recommend prioritizing the two most urgent tasks and moving the remaining tasks to later dates.';
}

export function starterPrompts(viewMode: string, lang: ResolvedLang): string[] {
  const isFa = lang === 'fa';
  switch (viewMode) {
    case 'daily':
      return isFa ? ['امروز چه کارهایی انجام بدهم؟', 'برای امروز برنامه بچین', 'برنامه امروز را سبک‌تر کن', 'یادآوری برای امروز بذار'] : ['What should I work on today?', 'Plan my day', "Make today's plan lighter", 'Set a reminder for today'];
    case 'weekly':
      return isFa ? ['برای این هفته برنامه‌ریزی کن', 'کدام درس را کمتر خوانده‌ام؟', 'تحلیل هفته‌ام را نشان بده', 'کارهای عقب‌افتاده‌ام را مرتب کن'] : ['Plan my week', 'Which subject needs more attention?', 'Show my weekly analysis', 'Organize my overdue tasks'];
    case 'monthly':
      return isFa ? ['این ماه چه امتحانی دارم؟', 'برنامه امتحانم را بده', 'یادآوری برای امتحان بذار'] : ['What exams do I have this month?', 'Help me prepare for my exam', 'Set an exam reminder'];
    case 'yearly':
      return isFa ? ['نمای کلی سال', 'امتحان‌های مهم سال'] : ['Year overview', 'Important exams this year'];
    default:
      return isFa ? ['برای امروز برنامه بچین', 'یادآوری بذار', 'تحلیل هفته‌ام را نشان بده'] : ['Plan my day', 'Set a reminder', 'Show my weekly analysis'];
  }
}
