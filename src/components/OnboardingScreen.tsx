import { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays, Clock, Activity, CheckSquare, Hourglass,
  Users, MessageSquare, Palette, ChevronLeft, ChevronRight,
  Check, Sparkles,
} from 'lucide-react';
import { useTheme } from '../lib/theme';

interface OnboardingStep {
  icon: typeof CalendarDays;
  title: string;
  body: string;
  example?: string[];
  accent: string;
}

const STEPS: OnboardingStep[] = [
  {
    icon: CalendarDays,
    title: 'Planner',
    body: 'T Minus helps you plan your day, week, month, and year in one place. Organise your tasks, habits, activities, and reminders across different time views.',
    example: ['Daily', 'Weekly', 'Monthly', 'Yearly'],
    accent: '#7B1C3E',
  },
  {
    icon: Clock,
    title: 'Clocks',
    body: 'You can keep track of different time zones. Add a second clock if you work, study, or communicate across different countries.',
    example: ['Tehran', 'Los Angeles'],
    accent: '#1B2A4A',
  },
  {
    icon: Activity,
    title: 'Activities',
    body: 'Use Activities to track what you do during the day. Add activities with start and end times to understand how your time is being used.',
    example: ['Click + to add an activity from one time to another.'],
    accent: '#059669',
  },
  {
    icon: CheckSquare,
    title: 'Habits',
    body: 'Track your daily habits. Tick off habits, add timed habits, and keep your routine visible.',
    example: ['pills', 'exercise', 'violin practice', 'study'],
    accent: '#B45309',
  },
  {
    icon: Hourglass,
    title: 'Countdown',
    body: 'Use countdowns for important dates. Track how many days are left until deadlines, exams, events, or personal goals.',
    accent: '#7C3AED',
  },
  {
    icon: Users,
    title: 'Study Rooms',
    body: 'Create Study Rooms to focus with others. Invite people, study together, use shared timers, and keep your private planner data hidden.',
    example: ['Only shared activity time is visible. Your personal planner stays private.'],
    accent: '#0EA5E9',
  },
  {
    icon: MessageSquare,
    title: 'Chat and Room Roles',
    body: 'Study Rooms include chat and roles. Room owners can manage members, make admins, transfer ownership, and control room settings securely.',
    accent: '#6366F1',
  },
  {
    icon: Palette,
    title: 'Dark Mode and Profile',
    body: 'Personalise your experience. Update your profile, choose dark mode, and make T Minus feel comfortable for you.',
    accent: '#EC4899',
  },
];

interface Props {
  onFinish: () => void;
  onSkip: () => void;
}

export default function OnboardingScreen({ onFinish, onSkip }: Props) {
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [animKey, setAnimKey] = useState(0);

  const isEnd = step === STEPS.length;
  const current = isEnd ? null : STEPS[step];

  const goNext = useCallback(() => {
    if (isEnd) { onFinish(); return; }
    setDirection('forward');
    setAnimKey(k => k + 1);
    setStep(s => s + 1);
  }, [isEnd, onFinish]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setDirection('backward');
    setAnimKey(k => k + 1);
    setStep(s => s - 1);
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      if (e.key === 'ArrowLeft') goBack();
      if (e.key === 'Escape') onSkip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goBack, onSkip]);

  const slideIn = direction === 'forward' ? 'slide-in-right' : 'slide-in-left';

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col overflow-hidden"
      style={{ background: colors.bg }}
    >
      <style>{`
        @keyframes slide-in-right {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slide-in-left {
          from { opacity: 0; transform: translateX(-40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse-soft {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        .slide-in-right { animation: slide-in-right 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
        .slide-in-left { animation: slide-in-left 0.45s cubic-bezier(0.22, 1, 0.36, 1); }
        .fade-up { animation: fade-up 0.5s ease-out both; }
        .scale-in { animation: scale-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .pulse-soft { animation: pulse-soft 3s ease-in-out infinite; }
      `}</style>

      {/* Top bar: Skip button */}
      <div className="flex items-center justify-between px-5 py-4 md:px-8 md:py-5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="T Minus" className="h-7 w-7" />
          <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>T Minus</span>
        </div>
        {!isEnd && (
          <button
            onClick={onSkip}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ color: colors.textSecondary, background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.color = colors.textPrimary}
            onMouseLeave={e => e.currentTarget.style.color = colors.textSecondary}
          >
            Skip
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 pb-2 flex-shrink-0">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setDirection(i > step ? 'forward' : 'backward');
              setAnimKey(k => k + 1);
              setStep(i);
            }}
            className="rounded-full transition-all"
            style={{
              width: i === step ? 24 : 7,
              height: 7,
              background: i === step
                ? colors.accent
                : i < step
                  ? colors.border
                  : colors.borderLight,
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            title={`Step ${i + 1}`}
          />
        ))}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-8 overflow-y-auto">
        <div className="w-full max-w-lg" key={animKey}>
          {isEnd ? (
            // ─── End screen ───────────────────────────────────────────────
            <div className="text-center fade-up">
              <div
                className="inline-flex items-center justify-center rounded-full mb-6 pulse-soft"
                style={{
                  width: 80, height: 80,
                  background: colors.accentLight,
                }}
              >
                <Check size={40} color={colors.accent} strokeWidth={3} />
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold mb-3" style={{ color: colors.textPrimary }}>
                You're ready to start.
              </h1>
              <p className="text-base mb-8" style={{ color: colors.textSecondary, lineHeight: 1.6 }}>
                Start planning your time with T Minus.
              </p>
              <button
                onClick={onFinish}
                className="px-8 py-3.5 rounded-xl text-base font-bold text-white transition-all"
                style={{
                  background: colors.accent,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: `0 8px 24px ${colors.accent}40`,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 12px 32px ${colors.accent}55`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 8px 24px ${colors.accent}40`; }}
              >
                Go to Planner
              </button>
            </div>
          ) : (
            // ─── Feature step ──────────────────────────────────────────────
            <div className={slideIn}>
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div
                  className="inline-flex items-center justify-center rounded-3xl scale-in"
                  style={{
                    width: 88, height: 88,
                    background: current!.accent + '18',
                  }}
                >
                  {(() => { const Icon = current!.icon; return <Icon size={44} color={current!.accent} strokeWidth={1.8} />; })()}
                </div>
              </div>

              {/* Title */}
              <h2 className="text-xl md:text-2xl font-extrabold text-center mb-3" style={{ color: colors.textPrimary }}>
                {current!.title}
              </h2>

              {/* Body */}
              <p className="text-sm md:text-base text-center mb-6" style={{ color: colors.textSecondary, lineHeight: 1.7 }}>
                {current!.body}
              </p>

              {/* Example chips */}
              {current!.example && (
                <div className="flex flex-wrap justify-center gap-2 mb-2">
                  {current!.example.map((ex, i) => (
                    <span
                      key={i}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full fade-up"
                      style={{
                        background: current!.accent + '15',
                        color: current!.accent,
                        animationDelay: `${0.15 + i * 0.08}s`,
                      }}
                    >
                      {ex}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom navigation */}
      <div className="flex items-center justify-between px-5 py-5 md:px-8 md:py-6 flex-shrink-0" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
        <button
          onClick={goBack}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          style={{
            background: step === 0 ? 'transparent' : colors.bgInput,
            color: step === 0 ? colors.textTertiary : colors.textPrimary,
            border: 'none',
            cursor: step === 0 ? 'default' : 'pointer',
            opacity: step === 0 ? 0.4 : 1,
          }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <span className="text-xs font-semibold" style={{ color: colors.textTertiary }}>
          {isEnd ? `${STEPS.length + 1} / ${STEPS.length + 1}` : `${step + 1} / ${STEPS.length + 1}`}
        </span>

        <button
          onClick={goNext}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-all"
          style={{
            background: colors.accent,
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {isEnd ? (
            <><Sparkles size={16} /> Get Started</>
          ) : step === STEPS.length - 1 ? (
            <>Finish <Check size={16} /></>
          ) : (
            <>Next <ChevronRight size={16} /></>
          )}
        </button>
      </div>
    </div>
  );
}
