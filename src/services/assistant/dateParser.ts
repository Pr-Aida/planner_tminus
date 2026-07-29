import { SH_MONTHS, shToGregorian, todaySh, todayGreg, addDaysGreg, dateKey, gregorianToSh } from '../../lib/calendar';
import type { ResolvedLang } from './types';

const SH_MONTH_ALIASES: Record<string, number> = {};
SH_MONTHS.forEach((m, i) => {
  SH_MONTH_ALIASES[m.name.toLowerCase()] = i + 1;
  SH_MONTH_ALIASES[m.short.toLowerCase()] = i + 1;
});

const SH_MONTH_PERSIAN: Record<string, number> = {
  'فروردین': 1, 'اردیبهشت': 2, 'خرداد': 3, 'تیر': 4, 'مرداد': 5, 'شهریور': 6,
  'مهر': 7, 'آبان': 8, 'آذر': 9, 'دی': 10, 'بهمن': 11, 'اسفند': 12,
};

const PERSIAN_NUMS: Record<string, string> = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

export function normalizePersianDigits(text: string): string {
  return text.replace(/[۰-۹]/g, d => PERSIAN_NUMS[d] || d);
}

const GREG_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const GREG_MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

export interface ParsedDate {
  dateKey: string;
  display: string;
  persian: boolean;
}

function parseShamsiDate(text: string): ParsedDate | null {
  const normalized = normalizePersianDigits(text);
  const today = todaySh();
  const persianMonthNames = Object.keys(SH_MONTH_PERSIAN).join('|');
  const persianMatch = normalized.match(new RegExp(`(\\d{1,2})\\s*(${persianMonthNames})`, 'i'));
  if (persianMatch) {
    const day = parseInt(persianMatch[1], 10);
    const month = SH_MONTH_PERSIAN[persianMatch[2]];
    const yearMatch = normalized.match(new RegExp(`${persianMatch[1]}\\s*${persianMatch[2]}\\s*(\\d{4})`));
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.year;
    const g = shToGregorian({ year, month, day });
    return { dateKey: dateKey(g), display: `${day} ${SH_MONTHS[month - 1].name} ${year}`, persian: true };
  }
  const latinMatch = normalized.match(new RegExp(`(\\d{1,2})\\s*(${Object.keys(SH_MONTH_ALIASES).join('|')})`, 'i'));
  if (latinMatch) {
    const day = parseInt(latinMatch[1], 10);
    const month = SH_MONTH_ALIASES[latinMatch[2].toLowerCase()];
    if (!month) return null;
    const yearMatch = normalized.match(new RegExp(`${latinMatch[1]}\\s*${latinMatch[2]}\\s*(\\d{4})`));
    const year = yearMatch ? parseInt(yearMatch[1], 10) : today.year;
    const g = shToGregorian({ year, month, day });
    return { dateKey: dateKey(g), display: `${day} ${SH_MONTHS[month - 1].name} ${year}`, persian: true };
  }
  return null;
}

function parseGregorianDate(text: string): ParsedDate | null {
  const t = text.toLowerCase();
  for (let i = 0; i < 12; i++) {
    for (const name of [GREG_MONTHS[i], GREG_MONTH_SHORT[i]]) {
      const re = new RegExp(`${name}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i');
      const m = t.match(re);
      if (m) {
        const day = parseInt(m[1], 10);
        const year = m[2] ? parseInt(m[2], 10) : new Date().getFullYear();
        return { dateKey: dateKey({ year, month: i + 1, day }), display: `${GREG_MONTHS[i]} ${day}, ${year}`, persian: false };
      }
    }
  }
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
  const hasFa = /[\u0600-\u06FF]/.test(text);
  if (/\btoday\b|امروز/.test(t)) return { dateKey: dateKey(today), display: hasFa ? 'امروز' : 'today', persian: hasFa };
  if (/\btomorrow\b|فردا/.test(t)) return { dateKey: dateKey(addDaysGreg(today, 1)), display: hasFa ? 'فردا' : 'tomorrow', persian: hasFa };
  if (/\bday after tomorrow\b|پس\u200cفردا|پس فردا/.test(t)) return { dateKey: dateKey(addDaysGreg(today, 2)), display: hasFa ? 'پس‌فردا' : 'the day after tomorrow', persian: hasFa };
  if (/\bnext week\b|هفته\u200cی بعد|هفته بعد/.test(t)) return { dateKey: dateKey(addDaysGreg(today, 7)), display: hasFa ? 'هفته بعد' : 'next week', persian: hasFa };
  if (/\btonight\b|امشب/.test(t)) return { dateKey: dateKey(today), display: hasFa ? 'امشب' : 'tonight', persian: hasFa };
  const daysMatch = t.match(/(?:in\s+)?(\d+)\s*(?:days?|روز)/);
  if (daysMatch && /\bin\s+\d+\s*days\b|روز\s*(?:دیگ|بعد)/.test(t)) {
    return { dateKey: dateKey(addDaysGreg(today, parseInt(daysMatch[1], 10))), display: hasFa ? `${daysMatch[1]} روز دیگر` : `in ${daysMatch[1]} days`, persian: hasFa };
  }
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
  const currentDow = now.getDay();
  for (const wd of weekdays) {
    const matchEn = wd.en.some(w => new RegExp(`\\b${w}\\b`).test(t));
    const matchSh = wd.sh.some(w => t.includes(w));
    if (matchEn || matchSh) {
      const isNext = /\bnext\b|بعد/.test(t);
      let targetDow = wd.offset === 6 ? 0 : wd.offset;
      let diff = targetDow - currentDow;
      if (diff <= 0 || isNext) diff += 7;
      return { dateKey: dateKey(addDaysGreg(today, diff)), display: hasFa ? wd.sh[0] : wd.en[0], persian: hasFa };
    }
  }
  return null;
}

export function parseAnyDate(text: string): ParsedDate | null {
  return parseShamsiDate(text) || parseGregorianDate(text) || parseRelativeDate(text);
}

export function displayDate(dateKeyStr: string, lang: ResolvedLang): string {
  const [y, m, d] = dateKeyStr.split('-').map(Number);
  if (lang === 'fa') {
    try {
      const sh = gregorianToSh({ year: y, month: m, day: d });
      return `${sh.day} ${SH_MONTHS[sh.month - 1].name} ${sh.year}`;
    } catch { return dateKeyStr; }
  }
  return `${GREG_MONTHS[m - 1]} ${d}, ${y}`;
}

export function normalizeTime(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const suffix = m[3];
  if (suffix === 'am' && h === 12) h = 0;
  if (suffix === 'pm' && h !== 12) h += 12;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function parseTimeOfDay(text: string): string | null {
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

export function parseDuration(text: string): number | null {
  const t = normalizePersianDigits(text.toLowerCase());
  const m = t.match(/(\d+)\s*(min|mins|minutes?|h|hours?|دقیقه|ساعت)/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (/h|hour|ساعت/i.test(m[2])) return num * 60;
    return num;
  }
  return null;
}
