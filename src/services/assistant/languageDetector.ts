import type { AssistantLang, ResolvedLang } from './types';

const PERSIAN_RANGE = /[\u0600-\u06FF]/;

export function isPersian(text: string): boolean {
  return PERSIAN_RANGE.test(text);
}

export function isRTL(lang: ResolvedLang): boolean {
  return lang === 'fa';
}

export function isFinglish(text: string): boolean {
  const persianChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return persianChars > 0 && latinChars > 0 && persianChars >= latinChars * 0.3;
}

const FA_KEYWORDS = [
  'برنامه', 'یادآور', 'امتحان', 'مطالعه', 'فعالیت', 'عادت', 'تایمر', 'شمارش',
  'سلام', 'ممنون', 'امروز', 'فردا', 'هفته', 'ماه', 'سال', 'درس', 'تکلیف',
  'استراحت', 'خسته', 'تمرکز', 'وقت', 'حوصله', 'عقب', 'افتاده', 'سبک',
];

const FA_FINGLISH = [
  'emrooz', 'farda', 'baram', 'barname', 'reminder', 'bezaram', 'bekhoonam',
  'emtehan', 'daram', 'hafte', 'mah', 'sal', 'dars', 'taklif', 'rest',
];

export function resolveLang(pref: AssistantLang, text: string): ResolvedLang {
  if (pref === 'fa') return 'fa';
  if (pref === 'en') return 'en';
  if (isPersian(text) || isFinglish(text)) return 'fa';
  const lower = text.toLowerCase();
  if (FA_KEYWORDS.some(k => text.includes(k))) return 'fa';
  if (FA_FINGLISH.some(k => lower.includes(k))) return 'fa';
  return 'en';
}
