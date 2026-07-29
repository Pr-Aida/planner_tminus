import type { AssistantMessage, UserPlanningProfile, RecommendationFeedback, FeedbackTag, FocusSession, HistoryLimit } from './types';
import { STORAGE_LIMITS, getMaxHistory } from './storageConfig';

const HISTORY_KEY = 'tminus-assistant-history';
const PROFILE_KEY = 'tminus-assistant-profile';
const FEEDBACK_KEY = 'tminus-assistant-feedback';
const FOCUS_KEY = 'tminus-assistant-focus';
const ACTIVE_TIMER_KEY = 'tminus-assistant-active-timer';

export function uid(): string {
  return crypto.randomUUID();
}

export function loadHistory(): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AssistantMessage[];
    return parsed.slice(-STORAGE_LIMITS.assistantMessagesPerUser);
  } catch { return []; }
}

export function saveHistory(messages: AssistantMessage[], limit: HistoryLimit): void {
  try {
    const max = getMaxHistory(limit);
    if (max === 0) { localStorage.removeItem(HISTORY_KEY); return; }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-max)));
  } catch { /* ignore */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

const DEFAULT_PROFILE: UserPlanningProfile = {
  lang: 'auto',
  timezone: 'UTC',
  wakeTime: '07:00',
  sleepTime: '23:00',
  availableDays: [0, 1, 2, 3, 4, 5, 6],
  availableHoursPerDay: 4,
  sessionDuration: 45,
  breakDuration: 10,
  maxDailyStudy: 240,
  minDailyStudy: 60,
  difficultSubjects: [],
  strongSubjects: [],
  upcomingExams: [],
  mainGoals: [],
  preferredTimeOfDay: 'morning',
  energyPattern: 'balanced',
  intensity: 'balanced',
  planStyle: 'flexible',
  weekendAvailable: true,
  daysOff: [],
  reminderPref: 1,
  flexibleOrFixed: 'flexible',
  historyLimit: 50,
};

export function loadProfile(): UserPlanningProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch { return DEFAULT_PROFILE; }
}

export function saveProfile(profile: UserPlanningProfile): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export function loadFeedback(): RecommendationFeedback[] {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecommendationFeedback[];
  } catch { return []; }
}

export function recordFeedback(tag: FeedbackTag): void {
  const all = loadFeedback();
  all.push({ tag, timestamp: Date.now() });
  try { localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all.slice(-STORAGE_LIMITS.recommendationRecordsPerUser))); } catch { /* ignore */ }
}

export function loadFocusSessions(): FocusSession[] {
  try {
    const raw = localStorage.getItem(FOCUS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FocusSession[];
  } catch { return []; }
}

export function saveFocusSession(session: FocusSession): void {
  const all = loadFocusSessions();
  all.push(session);
  try { localStorage.setItem(FOCUS_KEY, JSON.stringify(all.slice(-200))); } catch { /* ignore */ }
}

export function getFeedbackStats(): Record<FeedbackTag, number> {
  const all = loadFeedback();
  const stats: Record<FeedbackTag, number> = {
    helpful: 0, not_helpful: 0, too_difficult: 0, too_easy: 0,
    too_long: 0, not_enough_time: 0, wrong_subject: 0, wrong_time: 0,
  };
  for (const f of all) stats[f.tag] = (stats[f.tag] || 0) + 1;
  return stats;
}

export function saveActiveTimer(state: { remaining: number; label: string; totalSeconds: number } | null): void {
  try {
    if (state) localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify(state));
    else localStorage.removeItem(ACTIVE_TIMER_KEY);
  } catch { /* ignore */ }
}

export function loadActiveTimer(): { remaining: number; label: string; totalSeconds: number } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_TIMER_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearAllAssistantData(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(FEEDBACK_KEY);
    localStorage.removeItem(FOCUS_KEY);
    localStorage.removeItem(ACTIVE_TIMER_KEY);
  } catch { /* ignore */ }
}

export function getStorageEstimate(): { assistantBytes: number; status: 'normal' | 'moderate' | 'high' | 'critical' } {
  let assistantBytes = 0;
  try {
    [HISTORY_KEY, PROFILE_KEY, FEEDBACK_KEY, FOCUS_KEY, ACTIVE_TIMER_KEY].forEach(k => {
      const v = localStorage.getItem(k);
      if (v) assistantBytes += v.length;
    });
  } catch { /* ignore */ }
  let status: 'normal' | 'moderate' | 'high' | 'critical' = 'normal';
  if (assistantBytes > 500_000) status = 'critical';
  else if (assistantBytes > 200_000) status = 'high';
  else if (assistantBytes > 50_000) status = 'moderate';
  return { assistantBytes, status };
}
