import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Check, Sparkles } from 'lucide-react';
import { useTheme } from '../lib/theme';

// ─── Version & What's New ─────────────────────────────────────────────────────
// Bump APP_VERSION and add a new entry to WHATS_NEW_UPDATES whenever you ship
// a meaningful change. Users whose last_seen_version is older than APP_VERSION
// will automatically see the What's New tour on next login.
export const APP_VERSION = '1.3';

export interface WhatsNewUpdate {
  version: string;
  title: string;
  summary: string;
  steps: TourStep[];
}

export const WHATS_NEW_UPDATES: WhatsNewUpdate[] = [
  {
    version: '1.1',
    title: 'Cross-Device Sync',
    summary: 'Your planner now syncs across all your devices.',
    steps: [
      {
        target: 'tour-profile',
        title: "What's New: Cross-Device Sync",
        body: 'Your entire planner — habits, notes, countdowns, reminders, and your cover image — is now saved to your account and syncs automatically across every device you use.',
        badge: 'New',
      },
    ],
  },
  {
    version: '1.2',
    title: 'Local Time & Secure Account',
    summary: 'Local time in the header, secure avatar storage, and a Delete Account option.',
    steps: [
      {
        target: 'tour-local-time',
        title: "What's New: Local Time",
        body: "Your current local time now appears right in the header. It updates live and uses the timezone from your profile, so it is always correct wherever you are in the world.",
        badge: 'New',
      },
      {
        target: 'tour-countdown',
        title: "What's New: Countdown Success Message",
        body: 'When you save a countdown, you now see a clear confirmation message: "Countdown saved successfully." so you always know it was saved.',
        badge: 'Improved',
      },
      {
        target: 'tour-profile',
        title: "What's New: Delete Account",
        body: 'You can now permanently delete your account from Profile > Preferences. This removes all your data including habits, notes, reminders, and your avatar — nothing is left behind.',
        badge: 'New',
      },
    ],
  },
  {
    version: '1.3',
    title: 'Study Rooms',
    summary: 'Create private focus rooms. Invite by link or username — only Activity time is shared, everything else stays private.',
    steps: [
      {
        target: 'tour-study-rooms',
        title: "What's New: Study Rooms",
        body: 'Create private focus rooms and invite others by link or username. Invite links never give direct access — people can only request to join, and you approve them. Inside a room, only your Activity-section time is shared. Your habits, notes, reminders, and all other planner data stay completely private.',
        badge: 'New',
      },
      {
        target: 'tour-activities',
        title: "What's New: Activity Sharing",
        body: 'Your Activity-section time can now be shared in Study Rooms. You control what you share with privacy toggles: share today, share weekly, show active now, or hide all your activity from a room. Habits, notes, and reminders are never shared.',
        badge: 'New',
        requireView: 'daily',
      },
    ],
  },
];

// ─── Tour Step ────────────────────────────────────────────────────────────────
export interface TourStep {
  target: string;          // data-tour attribute on the element
  title: string;
  body: string;
  requireView?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  fallback?: string;       // alternate data-tour if target not found
  badge?: string;          // e.g. "New" | "Improved" — shown as a pill
  scrollBehavior?: 'center' | 'start' | 'nearest';
}

// ─── Full onboarding steps ────────────────────────────────────────────────────
export const ONBOARDING_STEPS: TourStep[] = [
  {
    target: 'tour-calendar-switch',
    title: 'Calendar System',
    body: 'Switch between the Solar Hijri (Persian 1405) calendar and the Gregorian calendar. Your planner data is linked to the same real-world day in both — switching never loses anything.',
  },
  {
    target: 'tour-local-time',
    title: 'Local Time',
    body: 'Your current local time is shown here live, based on the timezone in your profile. It helps you stay oriented no matter which device or timezone you are in.',
  },
  {
    target: 'tour-view-tabs',
    title: 'Day / Week / Month / Year',
    body: 'Switch between four views. Daily is your main planning surface. Weekly shows all seven days at once. Monthly is a calendar grid for planning ahead. Yearly shows all twelve months.',
  },
  {
    target: 'tour-today',
    title: 'Today Button',
    body: 'No matter how far you navigate into the past or future, press Today to instantly jump back to the current date in any view.',
  },
  {
    target: 'tour-prev-next',
    title: 'Navigate Days',
    body: 'Use the Previous and Next arrows to move one day at a time. The date dropdown lets you jump directly to any month and day.',
  },
  {
    target: 'tour-countdown',
    title: 'Countdown Widget',
    body: 'Create a countdown to an important event — an exam, deadline, or occasion. It shows the days remaining right here in the header. You can enter a number of days or pick a specific date.',
  },
  {
    target: 'tour-habits',
    title: 'Habit Tracker',
    body: 'This is your daily habit list. Track any routine — reading, exercise, practice, study. Habits are shared across all days so your template is always ready.',
    requireView: 'daily',
  },
  {
    target: 'tour-habit-add',
    title: 'Add, Edit & Delete Habits',
    body: 'Press Add Habit to create a new one. Choose Checkbox for a simple tick, or With Time to log minutes. Rename or delete habits from each row. Use "Today only" to add a one-off habit that only appears on this day.',
    requireView: 'daily',
    fallback: 'tour-habits',
  },
  {
    target: 'tour-habit-checkbox',
    title: 'Checkbox Habits',
    body: 'Just tick the box each day you complete a checkbox habit. Your progress is tracked automatically. Use the eye icon to hide a habit for just one day without deleting it.',
    requireView: 'daily',
    fallback: 'tour-habits',
  },
  {
    target: 'tour-habit-time',
    title: 'Time-Tracked Habits',
    body: 'For habits like "minutes of practice", enter a number instead of ticking. The daily summary adds up all your tracked time at the bottom of the page.',
    requireView: 'daily',
    fallback: 'tour-habits',
  },
  {
    target: 'tour-activities',
    title: 'Activity Log',
    body: 'Log what you did today with start and end times. The app calculates the duration automatically and includes it in your daily summary. Add an optional note to each activity. This is the only data you can optionally share in Study Rooms.',
    requireView: 'daily',
  },
  {
    target: 'tour-study-rooms',
    title: 'Study Rooms',
    body: 'Create private focus rooms and invite others by link or username. Invite links never give direct access — people can only request to join, and you approve them. Inside a room, only your Activity-section time is shared. Your habits, notes, reminders, and all other planner data stay completely private.',
  },
  {
    target: 'tour-notes',
    title: 'Daily Notes',
    body: 'Write anything here — thoughts, plans, reflections. Notes save automatically as you type and are always there when you come back.',
    requireView: 'daily',
  },
  {
    target: 'tour-summary',
    title: 'Daily Summary',
    body: 'A live snapshot at the bottom of your day: activities logged, total time from activities, and total minutes from time-tracked habits.',
    requireView: 'daily',
  },
  {
    target: 'tour-monthly-reminders',
    requireView: 'monthly',
    title: 'Monthly Reminders',
    body: 'In Month view, click any day to add a reminder. Set it to trigger 1 week, 3 days, 1 day before, or on the day itself. On the day, check it off as completed, postponed, or cancelled.',
    fallback: 'tour-view-monthly',
  },
  {
    target: 'tour-profile',
    title: 'Profile & Settings',
    body: 'Tap your avatar to open Profile & Settings. Change your display name, username, avatar, bio, timezone, and calendar preference. All settings sync to your account.',
  },
  {
    target: 'tour-settings-help',
    title: 'Menu',
    body: 'From this menu you can open your profile, restart the feature tour, view What\'s New, or sign out.',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  mode: 'onboarding' | 'whats-new';
  whatsNewSteps?: TourStep[];
  whatsNewTitle?: string;
  whatsNewSummary?: string;
  onFinish: () => void;
  onSkip: () => void;
  onRequireView?: (view: 'daily' | 'weekly' | 'monthly' | 'yearly') => void;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 10;
const TT_WIDTH = 340;

// ─── Component ────────────────────────────────────────────────────────────────
export default function GuidedTour({
  mode, whatsNewSteps, whatsNewTitle, whatsNewSummary,
  onFinish, onSkip, onRequireView,
}: Props) {
  const { colors } = useTheme();
  const steps = mode === 'whats-new' && whatsNewSteps ? whatsNewSteps : ONBOARDING_STEPS;

  const [stepIdx, setStepIdx] = useState(-1); // -1 = intro screen
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const rafRef = useRef<number | null>(null);
  const scrolledRef = useRef<Set<number>>(new Set());

  const isIntro = stepIdx === -1;
  const isLast = stepIdx === steps.length - 1;
  const step = isIntro ? null : steps[stepIdx];

  // Scroll to the element once per step index
  const scrollToTarget = useCallback((el: HTMLElement, behavior: ScrollBehavior = 'smooth') => {
    el.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
  }, []);

  const measure = useCallback(() => {
    if (isIntro) { setRect(null); return; }
    const s = steps[stepIdx];
    if (!s) { setRect(null); return; }

    if (s.requireView && onRequireView) onRequireView(s.requireView);

    rafRef.current = requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${s.target}"]`)
        || (s.fallback ? document.querySelector<HTMLElement>(`[data-tour="${s.fallback}"]`) : null);

      if (!el) { setRect(null); return; }

      // Scroll into view once per step
      if (!scrolledRef.current.has(stepIdx)) {
        scrolledRef.current.add(stepIdx);
        scrollToTarget(el, 'smooth');
        // Re-measure after scroll settles
        setTimeout(() => {
          const r2 = el.getBoundingClientRect();
          setRect({
            top: Math.max(0, r2.top - PAD),
            left: Math.max(0, r2.left - PAD),
            width: r2.width + PAD * 2,
            height: r2.height + PAD * 2,
          });
        }, 350);
      }

      const r = el.getBoundingClientRect();
      setRect({
        top: Math.max(0, r.top - PAD),
        left: Math.max(0, r.left - PAD),
        width: r.width + PAD * 2,
        height: r.height + PAD * 2,
      });
    });
  }, [stepIdx, isIntro, steps, onRequireView, scrollToTarget]);

  useLayoutEffect(() => { measure(); }, [measure]);

  useEffect(() => {
    function onResize() {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      measure();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', measure, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  function next() {
    if (isIntro) { setStepIdx(0); return; }
    if (isLast) { onFinish(); return; }
    setStepIdx(i => i + 1);
  }

  function back() {
    if (stepIdx === 0) { setStepIdx(-1); return; }
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  // ─── Tooltip positioning ────────────────────────────────────────────────────
  const ttWidth = Math.min(TT_WIDTH, viewport.w - 24);

  const tooltipPos = (() => {
    if (isIntro || !rect) {
      return { top: viewport.h / 2 - 140, left: (viewport.w - ttWidth) / 2, placement: 'center' as const };
    }
    const belowSpace = viewport.h - (rect.top + rect.height);
    const aboveSpace = rect.top;
    const placeBelow = belowSpace >= 200 || (belowSpace >= aboveSpace);
    let left = rect.left + rect.width / 2 - ttWidth / 2;
    left = Math.max(12, Math.min(left, viewport.w - ttWidth - 12));

    if (placeBelow) {
      const top = Math.min(rect.top + rect.height + 16, viewport.h - 280);
      return { top, left, placement: 'below' as const };
    }
    // Above: tooltip is translated up by 100%, so `top` is its bottom edge.
    // Clamp so the tooltip (max ~260px tall) stays on-screen on mobile.
    const top = Math.max(260, rect.top - 16);
    return { top, left, placement: 'above' as const };
  })();

  const mask = !isIntro && rect
    ? {
        clipPath: `polygon(
          0 0, 0 100%,
          ${rect.left}px 100%, ${rect.left}px ${rect.top}px,
          ${rect.left + rect.width}px ${rect.top}px,
          ${rect.left + rect.width}px ${rect.top + rect.height}px,
          ${rect.left}px ${rect.top + rect.height}px,
          ${rect.left}px 100%, 100% 100%, 100% 0
        )`,
      }
    : { background: 'rgba(0,0,0,0.65)' };

  const progress = isIntro ? 0 : Math.round(((stepIdx + 1) / steps.length) * 100);
  const isWhatsNew = mode === 'whats-new';

  return (
    <div className="fixed inset-0 z-[300]" style={{ pointerEvents: 'auto' }}>
      {/* Dimmed overlay */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{ background: 'rgba(0,0,0,0.65)', ...mask }}
        onClick={isIntro ? undefined : undefined}
      />

      {/* Spotlight ring */}
      {!isIntro && rect && (
        <div
          className="absolute pointer-events-none transition-all duration-300"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: 8,
            boxShadow: `0 0 0 3px ${isWhatsNew ? '#059669' : '#7B1C3E'}, 0 0 0 7px ${isWhatsNew ? 'rgba(5,150,105,0.2)' : 'rgba(123,28,62,0.2)'}`,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute rounded-2xl overflow-hidden"
        style={{
          top: tooltipPos.top,
          left: tooltipPos.left,
          width: ttWidth,
          background: colors.bgCard,
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
          transform: tooltipPos.placement === 'above' ? 'translateY(-100%)' : 'none',
          transition: 'top 0.3s ease, left 0.3s ease',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: 4,
            background: isWhatsNew
              ? 'linear-gradient(90deg, #059669, #34D399)'
              : 'linear-gradient(90deg, #7B1C3E, #B91C1C)',
          }}
        />

        {/* Progress bar (only during steps) */}
        {!isIntro && (
          <div style={{ height: 3, background: colors.borderLight, position: 'relative' }}>
            <div
              style={{
                position: 'absolute', left: 0, top: 0, height: '100%',
                width: `${progress}%`,
                background: isWhatsNew ? '#059669' : '#7B1C3E',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        <div className="p-5">
          {isIntro ? (
            // ─── Intro / splash screen ────────────────────────────────────────
            <div className="text-center">
              <div
                className="inline-flex items-center justify-center rounded-full mb-4"
                style={{
                  width: 56, height: 56,
                  background: isWhatsNew ? '#D1FAE5' : colors.accentLight,
                }}
              >
                {isWhatsNew
                  ? <Sparkles size={28} color="#059669" />
                  : <img src="/logo.svg" alt="T Minus logo" className="h-10 w-10" />
                }
              </div>

              <h2 className="text-lg font-extrabold mb-1" style={{ color: colors.textPrimary }}>
                {isWhatsNew ? (whatsNewTitle || "What's New") : 'Welcome to T Minus'}
              </h2>

              {isWhatsNew && whatsNewSummary && (
                <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>{whatsNewSummary}</p>
              )}

              {!isWhatsNew && (
                <p className="text-sm mb-4" style={{ color: colors.textSecondary, lineHeight: 1.6 }}>
                  Let's take a quick tour of your planner. We'll walk through each feature one by one, right where it lives in the interface.
                </p>
              )}

              <div className="flex items-center justify-center gap-1 mb-4 mt-3">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className="rounded-full"
                    style={{
                      width: 6, height: 6,
                      background: isWhatsNew ? 'rgba(5,150,105,0.3)' : 'rgba(123,28,62,0.3)',
                    }}
                  />
                ))}
              </div>

              <p className="text-xs mb-5" style={{ color: colors.textSecondary }}>
                {steps.length} {steps.length === 1 ? 'step' : 'steps'} · Takes about a minute
              </p>

              <div className="flex gap-2">
                <button
                  onClick={onSkip}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                  style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
                >
                  Skip
                </button>
                <button
                  onClick={next}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-opacity"
                  style={{
                    background: isWhatsNew ? '#059669' : '#7B1C3E',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {isWhatsNew ? "See What's New" : "Start Tour"}
                </button>
              </div>
            </div>
          ) : (
            // ─── Step card ────────────────────────────────────────────────────
            <>
              {/* Arrow caret */}
              {rect && tooltipPos.placement !== 'center' && (
                <div
                  className="absolute"
                  style={{
                    left: Math.max(12, Math.min(
                      rect.left + rect.width / 2 - tooltipPos.left - 8,
                      ttWidth - 24
                    )),
                    [tooltipPos.placement === 'below' ? 'top' : 'bottom']: -7,
                    width: 0, height: 0,
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    ...(tooltipPos.placement === 'below'
                      ? { borderBottom: `8px solid ${colors.bgCard}` }
                      : { borderTop: `8px solid ${colors.bgCard}` }),
                  } as React.CSSProperties}
                />
              )}

              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {step?.badge && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: step.badge === 'New' ? '#D1FAE5' : '#FEF3C7',
                        color: step.badge === 'New' ? '#059669' : '#D97706',
                      }}
                    >
                      {step.badge}
                    </span>
                  )}
                  <span
                    className="text-xs font-bold uppercase tracking-widest truncate"
                    style={{ color: isWhatsNew ? '#059669' : '#7B1C3E' }}
                  >
                    {step?.title}
                  </span>
                </div>
                <button
                  onClick={onSkip}
                  className="flex items-center justify-center rounded-full w-6 h-6 transition-colors hover:bg-gray-100 flex-shrink-0"
                  style={{ border: 'none', cursor: 'pointer', background: 'transparent' }}
                  title="Skip"
                >
                  <X size={14} color={colors.textSecondary} />
                </button>
              </div>

              <p className="text-sm leading-relaxed mb-4" style={{ color: colors.textSecondary, lineHeight: 1.65 }}>
                {step?.body}
              </p>

              {/* Step dots */}
              <div className="flex items-center gap-1 mb-4">
                {steps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStepIdx(i)}
                    className="rounded-full transition-all"
                    style={{
                      width: i === stepIdx ? 20 : 6,
                      height: 6,
                      background: i === stepIdx
                        ? (isWhatsNew ? '#059669' : '#7B1C3E')
                        : i < stepIdx
                          ? (isWhatsNew ? '#6EE7B7' : '#C8A0B0')
                          : '#E5E7EB',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={`Step ${i + 1}`}
                  />
                ))}
                <span className="text-xs ml-auto" style={{ color: colors.textSecondary }}>
                  {stepIdx + 1} / {steps.length}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={back}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity"
                  style={{
                    background: colors.bgInput, color: colors.textPrimary, border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = colors.bgHover}
                  onMouseLeave={e => e.currentTarget.style.background = colors.bgInput}
                >
                  <ChevronLeft size={14} /> Back
                </button>

                <button
                  onClick={onSkip}
                  className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: 'transparent', color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
                >
                  Skip
                </button>

                <div className="flex-1" />

                <button
                  onClick={next}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold text-white transition-opacity"
                  style={{ background: isWhatsNew ? '#059669' : '#7B1C3E', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {isLast ? (
                    <><Check size={14} /> Got it</>
                  ) : (
                    <>Next <ChevronRight size={14} /></>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
