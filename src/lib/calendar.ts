import { toJalaali, toGregorian, isLeapJalaaliYear } from 'jalaali-js';
import type { ShDate, GregDate } from '../types';

// ─── Shamsi month definitions ─────────────────────────────────────────────────
// Month lengths for a common (non-leap) Shamsi year:
// months 1-6 → 31 days, 7-11 → 30 days, 12 → 29 days (30 in leap year)
export const SH_MONTHS = [
  { name: 'Farvardin',   short: 'Far', days: 31 },
  { name: 'Ordibehesht', short: 'Ord', days: 31 },
  { name: 'Khordad',     short: 'Kho', days: 31 },
  { name: 'Tir',         short: 'Tir', days: 31 },
  { name: 'Mordad',      short: 'Mor', days: 31 },
  { name: 'Shahrivar',   short: 'Sha', days: 31 },
  { name: 'Mehr',        short: 'Meh', days: 30 },
  { name: 'Aban',        short: 'Aba', days: 30 },
  { name: 'Azar',        short: 'Aza', days: 30 },
  { name: 'Dey',         short: 'Dey', days: 30 },
  { name: 'Bahman',      short: 'Bah', days: 30 },
  { name: 'Esfand',      short: 'Esf', days: 29 }, // 30 in leap years
];

// ─── Gregorian helpers ────────────────────────────────────────────────────────
export function gregMonthDays(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export const GREG_MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
export const GREG_MONTH_SHORT = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
];

// SH week starts Saturday (Shanbe = 0)
export const SH_WEEKDAYS_SHORT = ['Sh','Ye','Do','Se','Ch','Pa','Jo'];
export const SH_WEEKDAYS_FULL  = ['Shanbeh','Yekshanbeh','Doshanbeh','Seshanbeh','Chaharshanbeh','Panjshanbeh','Jomeh'];

// Gregorian week starts Monday (Mon = 0)
export const GREG_WEEKDAYS_SHORT = ['Mo','Tu','We','Th','Fr','Sa','Su'];
export const GREG_WEEKDAYS_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

// ─── Jalali (Solar Hijri) ↔ Gregorian conversion ──────────────────────────────
// Uses the well-tested `jalaali-js` library (https://github.com/jalaali/jalaali-js),
// which is accurate for the full supported range and round-trip consistent.
// This replaces a hand-rolled algorithm that had an off-by-one-day bug.

export function isJalaliLeap(year: number): boolean {
  return isLeapJalaaliYear(year);
}

export function shDaysInMonth(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeap(year) ? 30 : 29;
}

// Convert Jalali (SH) to Gregorian.
export function shToGregorian(sh: ShDate): GregDate {
  const { gy, gm, gd } = toGregorian(sh.year, sh.month, sh.day);
  return { year: gy, month: gm, day: gd };
}

// Convert Gregorian to Jalali (SH).
export function gregorianToSh(g: GregDate): ShDate {
  const { jy, jm, jd } = toJalaali(g.year, g.month, g.day);
  return { year: jy, month: jm, day: jd };
}

/** Day of week for SH date. 0=Saturday(Shanbe) … 6=Friday(Jome) */
export function shDayOfWeek(year: number, month: number, day: number): number {
  const g = shToGregorian({ year, month, day });
  const dow = new Date(Date.UTC(g.year, g.month - 1, g.day)).getUTCDay(); // 0=Sun
  // Sat=0, Sun=1, Mon=2, Tue=3, Wed=4, Thu=5, Fri=6
  return (dow + 1) % 7;
}

/** Day of week for Gregorian date. 0=Monday … 6=Sunday */
export function gregDayOfWeek(year: number, month: number, day: number): number {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  return (dow + 6) % 7; // shift so Mon=0
}

// ─── Timezone-aware "today" ───────────────────────────────────────────────────
// Returns the Gregorian {year,month,day} for "now" in the given IANA timezone.
// Falls back to the browser's local timezone when tz is empty/invalid.
function gregTodayInTz(tz?: string): GregDate {
  if (tz && tz !== 'auto') {
    try {
      // Format "now" in the target timezone and parse the parts.
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(new Date());
      const y = Number(parts.find(p => p.type === 'year')!.value);
      const m = Number(parts.find(p => p.type === 'month')!.value);
      const d = Number(parts.find(p => p.type === 'day')!.value);
      return { year: y, month: m, day: d };
    } catch {
      // invalid tz — fall through to local
    }
  }
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
}

/** Today's Shamsi date, computed in the user's selected timezone (or browser local). */
export function todaySh(tz?: string): ShDate {
  return gregorianToSh(gregTodayInTz(tz));
}

/** Today's Gregorian date, computed in the user's selected timezone (or browser local). */
export function todayGreg(tz?: string): GregDate {
  return gregTodayInTz(tz);
}

/** Universal date key — always Gregorian ISO, shared across both calendar modes */
export function dateKey(g: GregDate): string {
  return `${g.year}-${String(g.month).padStart(2,'0')}-${String(g.day).padStart(2,'0')}`;
}

export function shDateKey(year: number, shMonth: number, shDay: number): string {
  return dateKey(shToGregorian({ year, month: shMonth, day: shDay }));
}

export function monthKey(mode: 'shamsi' | 'gregorian', year: number, month: number): string {
  return `${mode === 'shamsi' ? 'sh' : 'gr'}-${year}-${month}`;
}

export function gregDateFromKey(key: string): GregDate {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d };
}

/** Add (or subtract) days from a Gregorian date. Handles month/year boundaries. */
export function addDaysGreg(g: GregDate, delta: number): GregDate {
  const ms = Date.UTC(g.year, g.month - 1, g.day) + delta * 86400000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Add (or subtract) days from a Shamsi date via Gregorian conversion. */
export function addDaysSh(sh: ShDate, delta: number): ShDate {
  const g = shToGregorian(sh);
  const nextG = addDaysGreg(g, delta);
  return gregorianToSh(nextG);
}
