import type { Activity, HabitType, ReminderOffset, ViewMode, CalendarMode } from '../../types';

export type AssistantLang = 'fa' | 'en' | 'auto';
export type ResolvedLang = 'fa' | 'en';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type PlanningIntensity = 'light' | 'balanced' | 'intensive';
export type PlanStyle = 'flexible' | 'structured' | 'exam-focused' | 'habit-focused' | 'deadline-focused';
export type HistoryLimit = 0 | 20 | 50 | 100;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UserPlanningProfile {
  lang: AssistantLang;
  timezone: string;
  wakeTime: string;
  sleepTime: string;
  availableDays: number[];
  availableHoursPerDay: number;
  sessionDuration: number;
  breakDuration: number;
  maxDailyStudy: number;
  minDailyStudy: number;
  difficultSubjects: string[];
  strongSubjects: string[];
  upcomingExams: { subject: string; dateKey: string }[];
  mainGoals: string[];
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening';
  energyPattern: 'morning-person' | 'night-owl' | 'balanced';
  intensity: PlanningIntensity;
  planStyle: PlanStyle;
  weekendAvailable: boolean;
  daysOff: string[];
  reminderPref: ReminderOffset;
  flexibleOrFixed: 'flexible' | 'fixed';
  historyLimit: HistoryLimit;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  lang: ResolvedLang;
  timestamp: number;
  actionLabel?: string;
  card?: AssistantCard;
  taskRef?: string;
}

export type AssistantCard =
  | { kind: 'plan'; blocks: PlanBlock[]; totalMinutes: number; lang: ResolvedLang }
  | { kind: 'taskConfirmation'; task: PendingTask; lang: ResolvedLang }
  | { kind: 'reminder'; suggestion: ReminderSuggestion; lang: ResolvedLang }
  | { kind: 'weeklyReport'; report: WeeklyAnalysis; lang: ResolvedLang }
  | { kind: 'goalBreakdown'; goal: string; steps: GoalStep[]; lang: ResolvedLang }
  | { kind: 'reschedule'; taskId: string; options: RescheduleOption[]; lang: ResolvedLang };

export interface PlanBlock {
  id: string;
  subject: string;
  start: string;
  end: string;
  durationMin: number;
  priority: 'high' | 'medium' | 'low';
  reason: string;
  type: 'study' | 'break' | 'routine' | 'review';
}

export interface PendingTask {
  title: string;
  dateKey: string;
  dateDisplay: string;
  time?: string;
  durationMin?: number;
  subject?: string;
  priority?: 'high' | 'medium' | 'low';
  reminderOffset?: ReminderOffset;
  notes?: string;
}

export interface ReminderSuggestion {
  title: string;
  dateKey: string;
  dateDisplay: string;
  reason: string;
  offsetOptions: ReminderOffset[];
}

export interface GoalStep {
  id: string;
  title: string;
  estimatedMin: number;
  suggestedDateKey?: string;
  priority: 'high' | 'medium' | 'low';
  dependsOn?: string;
}

export interface RescheduleOption {
  label: string;
  dateKey: string;
  time?: string;
  durationMin?: number;
}

export interface WeeklyAnalysis {
  totalMinutes: number;
  perSubject: Record<string, number>;
  completionRate: number;
  missedSessions: number;
  mostStudied: string | null;
  leastStudied: string | null;
  strongestDay: string | null;
  weakestDay: string | null;
  overdueTasks: number;
  consistency: number;
  avgSessionMin: number;
  observations: string[];
  recommendations: string[];
  lang: ResolvedLang;
}

export type FeedbackTag =
  | 'helpful' | 'not_helpful' | 'too_difficult' | 'too_easy'
  | 'too_long' | 'not_enough_time' | 'wrong_subject' | 'wrong_time';

export interface RecommendationFeedback {
  tag: FeedbackTag;
  timestamp: number;
}

export type AssistantIntent =
  | 'greet' | 'help' | 'pageGuidance' | 'createTask' | 'editTask' | 'deleteTask'
  | 'createReminder' | 'dailyPlanning' | 'weeklyPlanning' | 'examPlanning'
  | 'studyRecommendation' | 'taskPrioritization' | 'goalBreakdown' | 'rescheduleTask'
  | 'showOverdue' | 'showToday' | 'showTomorrow' | 'analyzeWeekly' | 'analyzeSubjectBalance'
  | 'startFocusTimer' | 'changeLanguage' | 'changeWorkload' | 'lowEnergy' | 'highEnergy'
  | 'explainRecommendation' | 'unknown';

export type AssistantAction =
  | { type: 'addActivity'; activity: Activity }
  | { type: 'addActivities'; activities: Activity[] }
  | { type: 'setTopNote'; note: string }
  | { type: 'addHabitToDay'; name: string; habitType: HabitType; unit: string | null }
  | { type: 'setCountdown'; config: { name: string; targetDate: string } }
  | { type: 'startTimer'; seconds: number; label: string }
  | { type: 'stopTimer' }
  | { type: 'switchView'; view: ViewMode }
  | { type: 'addReminder'; dateKey: string; title: string; offset: ReminderOffset }
  | { type: 'navigateToDate'; dateKey: string };

export interface AssistantResponse {
  content: string;
  action?: AssistantAction;
  actionLabel?: string;
  card?: AssistantCard;
  pendingTask?: PendingTask;
  followUpQuestion?: string;
}

export interface PlannerContext {
  viewMode: ViewMode;
  calMode: CalendarMode;
  currentKey: string;
  currentDayData: { activities: Activity[]; top_note: string };
  habits: { id: string; name: string; habit_type: HabitType; unit: string | null }[];
  reminders: { id: string; date_key: string; title: string; status: string }[];
  weeklyData: { label: string; activityHours: number; habitHours: number }[];
  profile: UserPlanningProfile;
  energy: EnergyLevel;
  lang: ResolvedLang;
}

export interface FocusSession {
  id: string;
  subject: string;
  durationMin: number;
  startedAt: number;
  endedAt?: number;
  completed: boolean;
  difficulty?: 1 | 2 | 3;
}
