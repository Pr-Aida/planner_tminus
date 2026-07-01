export type CalendarMode = 'shamsi' | 'gregorian';
export type ViewMode = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type HabitType = 'checkbox' | 'value';

export type ReminderStatus = 'pending' | 'completed' | 'not_completed' | 'postponed' | 'cancelled';
export type ReminderOffset = 0 | 1 | 3 | 7;

export interface Reminder {
  id: string;
  date_key: string; // Gregorian ISO — calendar-mode independent
  title: string;
  note: string;
  remind_offset: ReminderOffset;
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  name: string;
  habit_type: HabitType;
  unit: string | null;
  sort_order: number;
}

export interface Activity {
  id: string;
  name: string;
  from: string;
  to: string;
  note: string;
}

export interface TempHabit {
  id: string;
  name: string;
  habit_type: HabitType;
  unit: string | null;
}

export interface HabitOverride {
  hidden: string[];
  extras: TempHabit[];
}

export interface DailyData {
  date_key: string;
  top_note: string;
  habit_values: Record<string, boolean | number>;
  activities: Activity[];
  habit_overrides: HabitOverride;
}

export interface MonthlyNote {
  month_key: string;
  note: string;
}

export interface ShDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface GregDate {
  year: number;
  month: number; // 1-12
  day: number;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  recovery_email: string | null;
  calendar_pref: 'shamsi' | 'gregorian';
  timezone_pref: string;
  onboarding_completed: boolean;
  last_seen_version: string;
  // Header clock settings
  clock1_tz: string;      // 'auto' = use timezone_pref
  clock1_label: string;   // custom label, e.g. "Melbourne"
  clock1_visible: boolean;
  clock2_tz: string;      // empty = not configured
  clock2_label: string;
  clock2_visible: boolean;
}

export const TIMEZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Phoenix',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Almaty',
  'Asia/Baghdad',
  'Asia/Baku',
  'Asia/Bangkok',
  'Asia/Colombo',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Jerusalem',
  'Asia/Kabul',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Muscat',
  'Asia/Riyadh',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Taipei',
  'Asia/Tashkent',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Asia/Yerevan',
  'Atlantic/Azores',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Brussels',
  'Europe/Budapest',
  'Europe/Copenhagen',
  'Europe/Dublin',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Oslo',
  'Europe/Paris',
  'Europe/Prague',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Vienna',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Pacific/Auckland',
  'Pacific/Fiji',
  'Pacific/Honolulu',
  'Pacific/Midway',
] as const;
