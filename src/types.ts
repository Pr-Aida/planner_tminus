export type CalendarMode = 'shamsi' | 'gregorian';
export type ViewMode = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type HabitType = 'checkbox' | 'value';

// ─── Study Rooms ─────────────────────────────────────────────────────────────
export type RoomMemberStatus =
  | 'pending' | 'approved' | 'rejected' | 'invited' | 'declined' | 'left' | 'removed';
export type RoomInviteStatus = 'sent' | 'accepted' | 'declined' | 'revoked';
export type RoomNotificationType =
  | 'join_request' | 'request_approved' | 'request_rejected'
  | 'room_invited' | 'invite_accepted' | 'member_left' | 'member_removed';

export interface StudyRoom {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  avatar_url: string | null;
  profile_image_url: string | null;
  theme_color: string;
  invite_code: string;
  room_code: string;
  invite_enabled: boolean;
  leaderboard_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type RoomMemberRole = 'owner' | 'admin' | 'member';

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: RoomMemberRole;
  status: RoomMemberStatus;
  share_today: boolean;
  share_weekly: boolean;
  show_active_now: boolean;
  hide_activity: boolean;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined profile fields (from RPC / manual join)
  display_name?: string;
  username?: string;
  avatar_url?: string | null;
}

export interface RoomInvite {
  id: string;
  room_id: string;
  invitee_user_id: string;
  inviter_user_id: string;
  status: RoomInviteStatus;
  created_at: string;
}

export interface RoomNotification {
  id: string;
  user_id: string;
  room_id: string;
  type: RoomNotificationType;
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

export interface RoomMemberActivity {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  minutes: number;
  active_now: boolean;
  hidden: boolean;
}

export interface RoomStudySession {
  id: string;
  room_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
}

// Re-export SessionStatus from types
export type SessionStatus = 'running' | 'paused' | 'ended';

export interface MemberTimerSummary {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  status: SessionStatus;
  is_studying: boolean;
  today_seconds: number;
  week_seconds: number;
  active_started_at: string | null;
  active_accumulated_seconds: number;
  finished_for_day: boolean;
}

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
  theme_pref: 'light' | 'dark';
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
