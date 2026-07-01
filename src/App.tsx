import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import {
  todaySh, todayGreg, shToGregorian, gregorianToSh,
  dateKey, monthKey, shDateKey, SH_MONTHS, gregMonthDays,
  addDaysGreg, addDaysSh,
} from './lib/calendar';
import type {
  CalendarMode, ViewMode, Habit, HabitType, DailyData, ShDate, GregDate,
  UserProfile, Reminder, ReminderStatus, ReminderOffset, TempHabit,
} from './types';
import type { ClockSettings } from './components/TopNav';
import type { User, Session } from '@supabase/supabase-js';
import TopNav from './components/TopNav';
import HeroBanner from './components/HeroBanner';
import DateBar from './components/DateBar';
import DailyView from './views/DailyView';
import WeeklyView from './views/WeeklyView';
import MonthlyView from './views/MonthlyView';
import YearlyView from './views/YearlyView';
import SignIn from './views/SignIn';
import SignUp from './views/SignUp';
import ForgotPassword from './views/ForgotPassword';
import ResetPassword from './views/ResetPassword';
import ProfileView from './components/ProfileView';
import GuidedTour, { APP_VERSION, WHATS_NEW_UPDATES } from './components/GuidedTour';
import type { CountdownConfig } from './components/CountdownBar';

type AuthScreen = 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password';
type TourMode = 'onboarding' | 'whats-new';

const EMPTY_DAY: DailyData = { date_key: '', top_note: '', habit_values: {}, activities: [], habit_overrides: { hidden: [], extras: [] } };
const COUNTDOWN_KEY = 'countdown-config';

function emptyDay(key: string): DailyData {
  return { ...EMPTY_DAY, date_key: key };
}

function isTodayKey(key: string, tz?: string): boolean {
  return key === dateKey(todayGreg(tz));
}

export default function App() {
  // ─── Auth State ────────────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authScreen, setAuthScreen] = useState<AuthScreen>('sign-in');

  // Profile + onboarding/tour
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourMode, setTourMode] = useState<TourMode>('onboarding');

  const [clockSettings, setClockSettings] = useState<ClockSettings>({
    clock1_tz: 'auto',
    clock1_label: '',
    clock1_visible: true,
    clock2_tz: '',
    clock2_label: '',
    clock2_visible: false,
  });

  // ─── Calendar & View State ──────────────────────────────────────────────
  const [calMode, setCalMode] = useState<CalendarMode>('shamsi');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const [shDate, setShDate] = useState<ShDate>(todaySh);
  const [gregDate, setGregDate] = useState<GregDate>(todayGreg);

  // Lifted month-view navigation (so Today button works in month view)
  const [viewShYear, setViewShYear] = useState<number>(todaySh().year);
  const [viewShMonth, setViewShMonth] = useState<number>(todaySh().month);
  const [viewGregYear, setViewGregYear] = useState<number>(todayGreg().year);
  const [viewGregMonth, setViewGregMonth] = useState<number>(todayGreg().month);
  // Lifted year-view navigation
  const [viewShYearForYear, setViewShYearForYear] = useState<number>(todaySh().year);
  const [viewGregYearForYear, setViewGregYearForYear] = useState<number>(todayGreg().year);

  // ─── Data State ──────────────────────────────────────────────────────────
  const [habits, setHabits] = useState<Habit[]>([]);
  const [dayCache, setDayCache] = useState<Map<string, DailyData>>(new Map());
  const [dayNotes, setDayNotes] = useState<Map<string, string>>(new Map());
  const [monthlyNotes, setMonthlyNotes] = useState<Map<string, string>>(new Map());
  const [countdown, setCountdown] = useState<CountdownConfig | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [coverLoaded, setCoverLoaded] = useState(false);

  // Debounce timers
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<Map<string, DailyData>>(new Map());
  const pendingMonthly = useRef<Map<string, string>>(new Map());
  const pendingDayNotes = useRef<Map<string, string>>(new Map());
  const clockSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Auth Setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
      if (!session?.user) {
        setProfile(null);
        setShowTour(false);
        setShowProfile(false);
        setReminders([]);
        setCoverImage(null);
        setCoverLoaded(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check for password reset URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    if (type === 'recovery') {
      setAuthScreen('reset-password');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // ─── Load profile when user changes ──────────────────────────────────────
  useEffect(() => {
    if (!user) { setProfile(null); return; }
    setProfileLoading(true);
    supabase.from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfileLoading(false);
        if (data) {
          const p = data as UserProfile;
          setProfile(p);
          setCalMode(p.calendar_pref);
          setClockSettings({
            clock1_tz: p.clock1_tz || 'auto',
            clock1_label: p.clock1_label || '',
            clock1_visible: p.clock1_visible !== false,
            clock2_tz: p.clock2_tz || '',
            clock2_label: p.clock2_label || '',
            clock2_visible: !!p.clock2_visible,
          });

          if (!p.onboarding_completed) {
            // Brand new user — show full onboarding
            setTourMode('onboarding');
            setShowTour(true);
          } else if ((p.last_seen_version || '0') < APP_VERSION) {
            // Returning user who hasn't seen the latest What's New
            setTourMode('whats-new');
            setShowTour(true);
          }
        }
      });
  }, [user]);

  // ─── Current date key ────────────────────────────────────────────────────
  const currentKey = calMode === 'shamsi'
    ? shDateKey(shDate.year, shDate.month, shDate.day)
    : dateKey(gregDate);

  // ─── Derived values for header ───────────────────────────────────────────
  const currentGregYear = calMode === 'shamsi'
    ? shToGregorian({ year: shDate.year, month: shDate.month, day: shDate.day }).year
    : gregDate.year;

  const currentShMonth = calMode === 'shamsi'
    ? shDate.month
    : (gregorianToSh(gregDate)?.month ?? 1);

  // ─── Load habits ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase.from('planner_habits')
      .select('*')
      .order('sort_order')
      .then(({ data }) => { if (data) setHabits(data as Habit[]); });
  }, [user]);

  // ─── Load countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase.from('planner_monthly_notes')
      .select('note')
      .eq('month_key', COUNTDOWN_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.note) {
          try { setCountdown(JSON.parse(data.note)); } catch {}
        }
      });
  }, [user]);

  // ─── Load all reminders for the user ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase.from('planner_reminders')
      .select('*')
      .order('date_key')
      .then(({ data }) => { if (data) setReminders(data as Reminder[]); });
  }, [user]);

  // ─── Browser notifications for today's reminders ─────────────────────────
  useEffect(() => {
    if (!user || reminders.length === 0) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const todayKeyStr = dateKey(todayGreg(profile?.timezone_pref));
    const todayReminders = reminders.filter(r => r.date_key === todayKeyStr && r.status === 'pending');
    todayReminders.forEach(r => {
      try {
        new Notification('Today is the day!', { body: `${r.title} — Did you complete it?` });
      } catch {}
    });
  }, [user, reminders]);

  // ─── Load daily data for current key ─────────────────────────────────────
  useEffect(() => {
    if (!user || dayCache.has(currentKey)) return;
    supabase.from('planner_daily')
      .select('*')
      .eq('date_key', currentKey)
      .maybeSingle()
      .then(({ data }) => {
        const day: DailyData = data
          ? { date_key: data.date_key, top_note: data.top_note, habit_values: data.habit_values, activities: data.activities, habit_overrides: data.habit_overrides || { hidden: [], extras: [] } }
          : emptyDay(currentKey);
        setDayCache(prev => new Map(prev).set(currentKey, day));
      });
  }, [currentKey, user]);

  // ─── Load day notes for current key ──────────────────────────────────────
  useEffect(() => {
    if (!user || dayNotes.has(currentKey)) return;
    supabase.from('planner_monthly_notes')
      .select('note')
      .eq('month_key', 'day-' + currentKey)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.note) setDayNotes(prev => new Map(prev).set(currentKey, data.note));
      });
  }, [currentKey, user]);

  // ─── Prefetch a whole month ───────────────────────────────────────────────
  const prefetchMonthKeys = useCallback((keys: string[]) => {
    if (!user) return;
    const missing = keys.filter(k => !dayCache.has(k));
    if (!missing.length) return;
    supabase.from('planner_daily')
      .select('*')
      .in('date_key', missing)
      .then(({ data }) => {
        setDayCache(prev => {
          const next = new Map(prev);
          missing.forEach(k => { if (!next.has(k)) next.set(k, emptyDay(k)); });
          if (data) {
            data.forEach((row: any) => {
              next.set(row.date_key, {
                date_key: row.date_key,
                top_note: row.top_note,
                habit_values: row.habit_values,
                activities: row.activities,
                habit_overrides: row.habit_overrides || { hidden: [], extras: [] },
              });
            });
          }
          return next;
        });
      });
  }, [dayCache, user]);

  // ─── Load monthly note ────────────────────────────────────────────────────
  const loadMonthlyNote = useCallback((key: string) => {
    if (!user || monthlyNotes.has(key)) return;
    supabase.from('planner_monthly_notes')
      .select('note')
      .eq('month_key', key)
      .maybeSingle()
      .then(({ data }) => {
        setMonthlyNotes(prev => new Map(prev).set(key, data?.note || ''));
      });
  }, [monthlyNotes, user]);

  const currentMonthKey = calMode === 'shamsi'
    ? monthKey('shamsi', viewShYear, viewShMonth)
    : monthKey('gregorian', viewGregYear, viewGregMonth);

  useEffect(() => { loadMonthlyNote(currentMonthKey); }, [currentMonthKey, user]);

  const weeklyNoteKey = 'weekly-' + (calMode === 'shamsi'
    ? monthKey('shamsi', shDate.year, shDate.month)
    : monthKey('gregorian', gregDate.year, gregDate.month));

  useEffect(() => {
    if (!user || monthlyNotes.has(weeklyNoteKey)) return;
    supabase.from('planner_monthly_notes')
      .select('note')
      .eq('month_key', weeklyNoteKey)
      .maybeSingle()
      .then(({ data }) => {
        setMonthlyNotes(prev => new Map(prev).set(weeklyNoteKey, data?.note || ''));
      });
  }, [weeklyNoteKey, user]);

  // ─── Load cover image from Supabase ──────────────────────────────────────
  useEffect(() => {
    if (!user || coverLoaded) return;
    setCoverLoaded(true);
    const path = `${user.id}/cover.jpg`;
    const { data } = supabase.storage.from('covers').getPublicUrl(path);
    // Verify the file exists by trying to fetch it
    fetch(data.publicUrl, { method: 'HEAD' }).then(res => {
      if (res.ok) setCoverImage(data.publicUrl + '?v=' + Date.now());
    }).catch(() => { /* no cover set */ });
  }, [user, coverLoaded]);

  // ─── Cover image ──────────────────────────────────────────────────────────
  const handleCoverChange = useCallback(async (dataUrl: string | null) => {
    if (!user) return;
    if (!dataUrl) {
      // Delete the file
      await supabase.storage.from('covers').remove([`${user.id}/cover.jpg`]);
      setCoverImage(null);
      return;
    }
    // dataUrl is a base64 string from FileReader — upload as blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${user.id}/cover.jpg`;
    const { error: upErr } = await supabase.storage
      .from('covers')
      .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (!upErr) {
      const { data } = supabase.storage.from('covers').getPublicUrl(path);
      setCoverImage(data.publicUrl + '?v=' + Date.now());
    }
  }, [user]);

  // ─── Calendar mode toggle ─────────────────────────────────────────────────
  function handleCalModeChange(mode: CalendarMode) {
    if (mode === calMode) return;
    if (mode === 'gregorian') {
      const g = shToGregorian({ year: shDate.year, month: shDate.month, day: shDate.day });
      setGregDate(g);
      setViewGregYear(g.year);
      setViewGregMonth(g.month);
    } else {
      const sh = gregorianToSh(gregDate);
      setShDate(sh ?? todaySh(profile?.timezone_pref));
      if (sh) { setViewShMonth(sh.month); setViewShYear(sh.year); }
    }
    setCalMode(mode);
  }

  // ─── Go to today (works in all views) ────────────────────────────────────
  function goToday() {
    const tz = profile?.timezone_pref;
    const tSh = todaySh(tz);
    const tGr = todayGreg(tz);
    if (calMode === 'shamsi') {
      setShDate(tSh);
      setViewShYear(tSh.year);
      setViewShMonth(tSh.month);
      setViewShYearForYear(tSh.year);
    } else {
      setGregDate(tGr);
      setViewGregYear(tGr.year);
      setViewGregMonth(tGr.month);
      setViewGregYearForYear(tGr.year);
    }
  }

  function goPrevDay() {
    if (calMode === 'shamsi') setShDate(addDaysSh(shDate, -1));
    else setGregDate(addDaysGreg(gregDate, -1));
  }

  function goNextDay() {
    if (calMode === 'shamsi') setShDate(addDaysSh(shDate, 1));
    else setGregDate(addDaysGreg(gregDate, 1));
  }

  // ─── Data accessors ───────────────────────────────────────────────────────
  const getDayData = useCallback((key: string): DailyData => {
    return dayCache.get(key) || emptyDay(key);
  }, [dayCache]);

  const getDayNote = useCallback((key: string): string => {
    return dayNotes.get(key) || '';
  }, [dayNotes]);

  // ─── Debounced saves ──────────────────────────────────────────────────────
  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSaves, 800);
  }

  async function flushSaves() {
    const dailyEntries = [...pendingSave.current.entries()];
    pendingSave.current.clear();
    for (const [key, d] of dailyEntries) {
      await supabase.from('planner_daily').upsert({
        date_key: key,
        top_note: d.top_note,
        habit_values: d.habit_values,
        activities: d.activities,
        habit_overrides: d.habit_overrides,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date_key' });
    }

    const monthlyEntries = [...pendingMonthly.current.entries()];
    pendingMonthly.current.clear();
    for (const [key, note] of monthlyEntries) {
      await supabase.from('planner_monthly_notes').upsert({
        month_key: key,
        note,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month_key' });
    }

    const dayNoteEntries = [...pendingDayNotes.current.entries()];
    pendingDayNotes.current.clear();
    for (const [key, note] of dayNoteEntries) {
      await supabase.from('planner_monthly_notes').upsert({
        month_key: 'day-' + key,
        note,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,month_key' });
    }
  }

  // ─── Data change handlers ─────────────────────────────────────────────────
  const handleDayDataChange = useCallback((patch: Partial<DailyData>) => {
    setDayCache(prev => {
      const existing = prev.get(currentKey) || emptyDay(currentKey);
      const updated = { ...existing, ...patch, date_key: currentKey };
      pendingSave.current.set(currentKey, updated);
      scheduleSave();
      return new Map(prev).set(currentKey, updated);
    });
  }, [currentKey]);

  const handleMonthlyNoteChange = useCallback((key: string, note: string) => {
    setMonthlyNotes(prev => new Map(prev).set(key, note));
    pendingMonthly.current.set(key, note);
    scheduleSave();
  }, []);

  const handleWeeklyNoteChange = useCallback((note: string) => {
    setMonthlyNotes(prev => new Map(prev).set(weeklyNoteKey, note));
    pendingMonthly.current.set(weeklyNoteKey, note);
    scheduleSave();
  }, [weeklyNoteKey]);

  const handleSetDayNote = useCallback((key: string, note: string) => {
    setDayNotes(prev => new Map(prev).set(key, note));
    pendingDayNotes.current.set(key, note);
    scheduleSave();
  }, []);

  // ─── Countdown save ───────────────────────────────────────────────────────
  const handleCountdownSave = useCallback(async (cfg: CountdownConfig | null) => {
    setCountdown(cfg);
    const note = cfg ? JSON.stringify(cfg) : '';
    await supabase.from('planner_monthly_notes').upsert({
      month_key: COUNTDOWN_KEY,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month_key' });
  }, []);

  // ─── Habit CRUD ───────────────────────────────────────────────────────────
  const handleAddHabit = useCallback(async (name: string, type: HabitType, unit: string | null) => {
    const { data } = await supabase.from('planner_habits')
      .insert({ name, habit_type: type, unit, sort_order: habits.length })
      .select()
      .single();
    if (data) setHabits(prev => [...prev, data as Habit]);
  }, [habits.length]);

  const handleDeleteHabit = useCallback(async (id: string) => {
    await supabase.from('planner_habits').delete().eq('id', id);
    setHabits(prev => prev.filter(h => h.id !== id));
  }, []);

  const handleRenameHabit = useCallback(async (id: string, newName: string) => {
    await supabase.from('planner_habits').update({ name: newName }).eq('id', id);
    setHabits(prev => prev.map(h => h.id === id ? { ...h, name: newName } : h));
  }, []);

  const handleAddHabitToDay = useCallback((name: string, type: HabitType, unit: string | null) => {
    setDayCache(prev => {
      const existing = prev.get(currentKey) || emptyDay(currentKey);
      const newExtra: TempHabit = { id: crypto.randomUUID(), name, habit_type: type, unit };
      const overrides = { ...(existing.habit_overrides || { hidden: [], extras: [] }), extras: [...(existing.habit_overrides?.extras || []), newExtra] };
      const updated = { ...existing, habit_overrides: overrides, date_key: currentKey };
      pendingSave.current.set(currentKey, updated);
      scheduleSave();
      return new Map(prev).set(currentKey, updated);
    });
  }, [currentKey]);

  const handleHideHabitForDay = useCallback((id: string) => {
    setDayCache(prev => {
      const existing = prev.get(currentKey) || emptyDay(currentKey);
      const overrides = { ...(existing.habit_overrides || { hidden: [], extras: [] }), hidden: [...(existing.habit_overrides?.hidden || []), id] };
      const updated = { ...existing, habit_overrides: overrides, date_key: currentKey };
      pendingSave.current.set(currentKey, updated);
      scheduleSave();
      return new Map(prev).set(currentKey, updated);
    });
  }, [currentKey]);

  const handleRemoveExtraHabit = useCallback((id: string) => {
    setDayCache(prev => {
      const existing = prev.get(currentKey) || emptyDay(currentKey);
      const overrides = { ...(existing.habit_overrides || { hidden: [], extras: [] }), extras: (existing.habit_overrides?.extras || []).filter(e => e.id !== id) };
      const updated = { ...existing, habit_overrides: overrides, date_key: currentKey };
      pendingSave.current.set(currentKey, updated);
      scheduleSave();
      return new Map(prev).set(currentKey, updated);
    });
  }, [currentKey]);

  const handleSaveTemplate = useCallback(() => {
    // The template is already persisted in planner_habits via add/rename/delete.
    // This is a no-op confirmation — the template IS the saved state.
    // Could show a toast in the future.
  }, []);

  // ─── Reminder CRUD ────────────────────────────────────────────────────────
  const handleAddReminder = useCallback(async (dateKeyStr: string, title: string, offset: ReminderOffset) => {
    const { data } = await supabase.from('planner_reminders')
      .insert({ date_key: dateKeyStr, title, remind_offset: offset })
      .select()
      .single();
    if (data) setReminders(prev => [...prev, data as Reminder].sort((a, b) => a.date_key.localeCompare(b.date_key)));
  }, []);

  const handleUpdateReminderStatus = useCallback(async (id: string, status: ReminderStatus) => {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    await supabase.from('planner_reminders').update({ status }).eq('id', id);
  }, []);

  const handleDeleteReminder = useCallback(async (id: string) => {
    setReminders(prev => prev.filter(r => r.id !== id));
    await supabase.from('planner_reminders').delete().eq('id', id);
  }, []);

  // ─── Clock settings change + debounced DB save ────────────────────────────
  const handleClockSettingsChange = useCallback((s: ClockSettings) => {
    setClockSettings(s);
    if (!user) return;
    if (clockSaveTimer.current) clearTimeout(clockSaveTimer.current);
    clockSaveTimer.current = setTimeout(async () => {
      await supabase.from('profiles').update({
        clock1_tz: s.clock1_tz,
        clock1_label: s.clock1_label,
        clock1_visible: s.clock1_visible,
        clock2_tz: s.clock2_tz,
        clock2_label: s.clock2_label,
        clock2_visible: s.clock2_visible,
      }).eq('id', user.id);
    }, 800);
  }, [user]);

  // ─── Auth handlers ────────────────────────────────────────────────────────
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // ─── Tour + onboarding completion ────────────────────────────────────────
  const handleTourFinish = useCallback(async () => {
    setShowTour(false);
    if (!user || !profile) return;
    const updates: Partial<UserProfile> = { last_seen_version: APP_VERSION };
    if (!profile.onboarding_completed) updates.onboarding_completed = true;
    await supabase.from('profiles').update(updates).eq('id', user.id);
    setProfile(prev => prev ? { ...prev, ...updates } : prev);
  }, [user, profile]);

  const handleTourSkip = useCallback(() => {
    handleTourFinish();
  }, [handleTourFinish]);

  const handleRestartTour = useCallback(() => {
    setTourMode('onboarding');
    setShowTour(true);
  }, []);

  const handleOpenWhatsNew = useCallback(() => {
    setTourMode('whats-new');
    setShowTour(true);
  }, []);

  // ─── Profile save ──────────────────────────────────────────────────────────
  const handleProfileSaved = useCallback((updated: UserProfile) => {
    setProfile(updated);
  }, []);

  // ─── View sync (prefetch monthly) ────────────────────────────────────────
  useEffect(() => {
    if (!user || viewMode !== 'monthly') return;
    let keys: string[];
    if (calMode === 'shamsi') {
      const days = SH_MONTHS[viewShMonth - 1].days;
      keys = Array.from({ length: days }, (_, i) => shDateKey(viewShYear, viewShMonth, i + 1));
    } else {
      const days = gregMonthDays(viewGregYear, viewGregMonth);
      keys = Array.from({ length: days }, (_, i) =>
        dateKey({ year: viewGregYear, month: viewGregMonth, day: i + 1 })
      );
    }
    prefetchMonthKeys(keys);
  }, [viewMode, calMode, viewShYear, viewShMonth, viewGregYear, viewGregMonth, user]);

  // ─── Auth Loading ─────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#EDEDEE' }}>
        <div className="w-10 h-10 border-4 border-gray-300 border-t-[#7B1C3E] rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Auth Screens ────────────────────────────────────────────────────────
  if (!user) {
    if (authScreen === 'sign-in') {
      return (
        <SignIn
          onSwitchToSignUp={() => setAuthScreen('sign-up')}
          onSwitchToForgot={() => setAuthScreen('forgot-password')}
        />
      );
    }
    if (authScreen === 'sign-up') {
      return <SignUp onSwitchToSignIn={() => setAuthScreen('sign-in')} />;
    }
    if (authScreen === 'forgot-password') {
      return <ForgotPassword onSwitchToSignIn={() => setAuthScreen('sign-in')} />;
    }
    if (authScreen === 'reset-password') {
      return <ResetPassword onComplete={() => setAuthScreen('sign-in')} />;
    }
  }

  // ─── Render Main App ───────────────────────────────────────────────────────
  const currentDayData = getDayData(currentKey);
  const currentDayReminders = reminders.filter(r => r.date_key === currentKey);

  // Compute What's New steps: collect all update steps newer than user's last seen version
  const userVersion = profile?.last_seen_version || '0';
  const whatsNewUpdates = WHATS_NEW_UPDATES.filter(u => u.version > userVersion);
  const whatsNewSteps = whatsNewUpdates.flatMap(u => u.steps);
  const latestUpdate = whatsNewUpdates[whatsNewUpdates.length - 1];

  return (
    <div className="min-h-screen" style={{ background: '#EDEDEE' }}>
      {showTour && (
        <GuidedTour
          mode={tourMode}
          whatsNewSteps={tourMode === 'whats-new' ? whatsNewSteps : undefined}
          whatsNewTitle={latestUpdate?.title ? `What's New in ${latestUpdate.title}` : "What's New"}
          whatsNewSummary={latestUpdate?.summary}
          onFinish={handleTourFinish}
          onSkip={handleTourSkip}
          onRequireView={(v) => setViewMode(v as ViewMode)}
        />
      )}

      {showProfile && profile && (
        <ProfileView
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSaved={handleProfileSaved}
          onAccountDeleted={() => { setShowProfile(false); }}
        />
      )}

      <TopNav
        calMode={calMode}
        onCalModeChange={handleCalModeChange}
        viewMode={viewMode}
        onViewChange={setViewMode}
        currentGregYear={currentGregYear}
        currentShYear={calMode === 'shamsi' ? shDate.year : gregorianToSh(gregDate).year}
        currentShMonth={currentShMonth}
        countdown={countdown}
        onCountdownSave={handleCountdownSave}
        userAvatar={profile?.avatar_url}
        userInitial={(profile?.display_name || profile?.username || 'U').charAt(0).toUpperCase()}
        onSignOut={handleSignOut}
        onOpenProfile={() => setShowProfile(true)}
        onRestartTour={handleRestartTour}
        onOpenWhatsNew={handleOpenWhatsNew}
        timezone={profile?.timezone_pref || 'UTC'}
        clockSettings={clockSettings}
        onClockSettingsChange={handleClockSettingsChange}
      />

      <HeroBanner imageDataUrl={coverImage} onImageChange={handleCoverChange} />

      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-6 pb-16">
        <DateBar
          calMode={calMode}
          shDate={shDate}
          gregDate={gregDate}
          onShDateChange={setShDate}
          onGregDateChange={setGregDate}
          onToday={goToday}
          onPrevDay={goPrevDay}
          onNextDay={goNextDay}
        />

        {viewMode === 'daily' && (
          <DailyView
            data={currentDayData}
            habits={habits}
            dateKey={currentKey}
            isToday={isTodayKey(currentKey, profile?.timezone_pref)}
            reminders={currentDayReminders}
            onDataChange={handleDayDataChange}
            onAddHabitToTemplate={handleAddHabit}
            onAddHabitToDay={handleAddHabitToDay}
            onDeleteHabit={handleDeleteHabit}
            onRenameHabit={handleRenameHabit}
            onHideHabitForDay={handleHideHabitForDay}
            onRemoveExtraHabit={handleRemoveExtraHabit}
            onSaveTemplate={handleSaveTemplate}
            onUpdateReminderStatus={handleUpdateReminderStatus}
          />
        )}

        {viewMode === 'weekly' && (
          <WeeklyView
            calMode={calMode}
            shDate={shDate}
            gregDate={gregDate}
            getDayData={getDayData}
            habits={habits}
            weeklyNote={monthlyNotes.get(weeklyNoteKey) || ''}
            onWeeklyNoteChange={handleWeeklyNoteChange}
          />
        )}

        {viewMode === 'monthly' && (
          <MonthlyView
            calMode={calMode}
            viewShYear={viewShYear}
            viewShMonth={viewShMonth}
            viewGregYear={viewGregYear}
            viewGregMonth={viewGregMonth}
            onViewShYearChange={setViewShYear}
            onViewShMonthChange={setViewShMonth}
            onViewGregYearChange={setViewGregYear}
            onViewGregMonthChange={setViewGregMonth}
            getDayData={getDayData}
            getDayNote={getDayNote}
            setDayNote={handleSetDayNote}
            habits={habits}
            monthlyNote={monthlyNotes.get(currentMonthKey) || ''}
            onMonthlyNoteChange={handleMonthlyNoteChange}
            reminders={reminders}
            onAddReminder={handleAddReminder}
            onUpdateReminderStatus={handleUpdateReminderStatus}
            onDeleteReminder={handleDeleteReminder}
            timezone={profile?.timezone_pref}
          />
        )}

        {viewMode === 'yearly' && (
          <YearlyView
            calMode={calMode}
            viewShYear={viewShYearForYear}
            viewGregYear={viewGregYearForYear}
            onViewShYearChange={setViewShYearForYear}
            onViewGregYearChange={setViewGregYearForYear}
            reminders={reminders}
            timezone={profile?.timezone_pref}
            onPickMonth={(month, mode) => {
              if (calMode === 'shamsi') {
                setViewShYear(viewShYearForYear);
                setViewShMonth(month);
                setShDate({ year: viewShYearForYear, month, day: 1 });
              } else {
                setViewGregMonth(month);
                setGregDate({ year: viewGregYearForYear, month, day: 1 });
              }
              setViewMode(mode);
            }}
          />
        )}
      </div>

      {profileLoading && !profile && (
        <div className="fixed bottom-4 right-4 text-xs" style={{ color: '#9CA3AF' }}>Loading profile…</div>
      )}
    </div>
  );
}
