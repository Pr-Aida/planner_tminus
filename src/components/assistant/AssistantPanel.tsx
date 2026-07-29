import { useState, useCallback, useEffect } from 'react';
import { X, Send, Loader2, Trash2, Clock, CheckCircle2, Square, BarChart2, Target } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import type { AssistantMessage, AssistantCard, PendingTask, PlanBlock, FeedbackTag, PlannerContext, AssistantLang, EnergyLevel, AssistantAction } from '../../services/assistant/types';
import { starterPrompts } from '../../services/assistant/responses';
import { recordFeedback } from '../../services/assistant/memory';
import { useAssistant } from '../../hooks/useAssistant';

interface Props {
  open: boolean;
  onClose: () => void;
  onAction: (action: AssistantAction) => void;
  getCtx: () => PlannerContext;
  defaultLang?: AssistantLang;
}

function AssistantAvatar({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: size, height: size, background: colors.accent }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10c2 2 8 2 10 0" />
        <circle cx="9" cy="7" r="0.9" fill="#fff" stroke="none" />
        <circle cx="15" cy="7" r="0.9" fill="#fff" stroke="none" />
        <path d="M12 3C7 3 4 6 4 10c0 3 2 5.5 5 6.5V20l3-2 3 2v-3.5c3-1 5-3.5 5-6.5 0-4-3-7-8-7z" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

function EnergyBadge({ energy, onChange }: { energy: EnergyLevel; onChange: (e: EnergyLevel) => void }) {
  const { colors } = useTheme();
  const cycle: EnergyLevel[] = ['low', 'medium', 'high'];
  const next = () => onChange(cycle[(cycle.indexOf(energy) + 1) % 3]);
  const label = energy === 'low' ? '🌙 Low' : energy === 'medium' ? '⚡ Med' : '🔥 High';
  const color = energy === 'low' ? colors.textTertiary : energy === 'medium' ? colors.warning : colors.success;
  return (
    <button onClick={next} className="text-xs font-semibold px-2 py-0.5 rounded-full transition-all" style={{ background: 'rgba(255,255,255,0.15)', color, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} title="Energy level">
      {label}
    </button>
  );
}

function TypingIndicator() {
  const { colors } = useTheme();
  return (
    <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl" style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, width: 'fit-content' }}>
      {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: colors.textTertiary, animationDelay: `${i * 0.15}s` }} />)}
    </div>
  );
}

function PlanCard({ card, onAdd }: { card: Extract<AssistantCard, { kind: 'plan' }>; onAdd: (blocks: PlanBlock[]) => void }) {
  const { colors } = useTheme();
  const isFa = card.lang === 'fa';
  const typeColor = (type: string) => type === 'study' ? colors.accent : type === 'review' ? colors.warning : colors.success;
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgCard }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: colors.accentLight, borderBottom: `1px solid ${colors.borderLight}` }}>
        <span className="text-xs font-bold" style={{ color: colors.accent }}>{isFa ? `برنامه — ${Math.floor(card.totalMinutes / 60)} ساعت` : `Plan — ${Math.floor(card.totalMinutes / 60)}h ${card.totalMinutes % 60}m`}</span>
        <button onClick={() => onAdd(card.blocks)} className="text-xs font-bold px-2 py-0.5 rounded-lg text-white" style={{ background: colors.accent, border: 'none', cursor: 'pointer' }}>{isFa ? '+ اضافه' : '+ Add'}</button>
      </div>
      <div className="divide-y" style={{ borderColor: colors.borderLight }}>
        {card.blocks.map(block => (
          <div key={block.id} className="flex items-center gap-2 px-3 py-2">
            <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: block.type === 'break' ? colors.borderLight : typeColor(block.type) }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold truncate" style={{ color: block.type === 'break' ? colors.textTertiary : colors.textPrimary }}>{block.subject}</span>
                <span className="text-[10px] flex-shrink-0" style={{ color: colors.textTertiary }}>{block.start}–{block.end}</span>
              </div>
              {block.reason && block.type !== 'break' && <p className="text-[10px] truncate" style={{ color: colors.textTertiary }}>{block.reason}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskConfirmCard({ card, onConfirm, onCancel }: { card: Extract<AssistantCard, { kind: 'taskConfirmation' }>; onConfirm: (t: PendingTask) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const isFa = card.lang === 'fa';
  const t = card.task;
  const rows: [string, string][] = [[isFa ? 'تاریخ' : 'Date', t.dateDisplay]];
  if (t.time) rows.push([isFa ? 'ساعت' : 'Time', t.time]);
  if (t.durationMin) rows.push([isFa ? 'مدت' : 'Duration', isFa ? `${t.durationMin} دقیقه` : `${t.durationMin} min`]);
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgCard }}>
      <div className="px-3 py-2" style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.borderLight}` }}>
        <p className="text-xs font-bold" style={{ color: colors.textPrimary }}>{t.title}</p>
      </div>
      <div className="px-3 py-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <span style={{ color: colors.textTertiary }}>{k}:</span>
            <span style={{ color: colors.textPrimary }}>{v}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 px-3 py-2" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
        <button onClick={() => onConfirm(t)} className="flex-1 text-xs font-bold py-1.5 rounded-lg text-white" style={{ background: colors.success, border: 'none', cursor: 'pointer' }}>{isFa ? 'تأیید' : 'Confirm'}</button>
        <button onClick={onCancel} className="flex-1 text-xs font-semibold py-1.5 rounded-lg" style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, cursor: 'pointer', color: colors.textSecondary }}>{isFa ? 'لغو' : 'Cancel'}</button>
      </div>
    </div>
  );
}

function WeeklyReportCard({ card }: { card: Extract<AssistantCard, { kind: 'weeklyReport' }> }) {
  const { colors } = useTheme();
  const isFa = card.lang === 'fa';
  const r = card.report;
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgCard }}>
      <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.borderLight}` }}>
        <BarChart2 size={13} style={{ color: colors.accent }} />
        <span className="text-xs font-bold" style={{ color: colors.textPrimary }}>{isFa ? 'گزارش هفته' : 'Weekly Report'}</span>
      </div>
      <div className="p-3 space-y-2">
        {r.observations.map((obs, i) => <p key={i} className="text-[11px]" style={{ color: colors.textSecondary }}>• {obs}</p>)}
        {r.recommendations.length > 0 && (
          <>
            <p className="text-[11px] font-bold pt-1" style={{ color: colors.textPrimary }}>{isFa ? 'پیشنهادها:' : 'Recommendations:'}</p>
            {r.recommendations.map((rec, i) => <p key={i} className="text-[11px]" style={{ color: colors.accent }}>→ {rec}</p>)}
          </>
        )}
      </div>
    </div>
  );
}

function GoalCard({ card }: { card: Extract<AssistantCard, { kind: 'goalBreakdown' }> }) {
  const { colors } = useTheme();
  const isFa = card.lang === 'fa';
  return (
    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgCard }}>
      <div className="px-3 py-2 flex items-center gap-1.5" style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.borderLight}` }}>
        <Target size={13} style={{ color: colors.accent }} />
        <span className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{card.goal}</span>
      </div>
      <div className="divide-y" style={{ borderColor: colors.borderLight }}>
        {card.steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2.5 px-3 py-2">
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{ background: step.priority === 'high' ? colors.accent : colors.bgSubtle, color: step.priority === 'high' ? '#fff' : colors.textTertiary }}>{i + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate" style={{ color: colors.textPrimary }}>{step.title}</p>
              <p className="text-[10px]" style={{ color: colors.textTertiary }}>{isFa ? `${step.estimatedMin} دقیقه` : `${step.estimatedMin} min`}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeedbackRow({ lang }: { lang: 'fa' | 'en' }) {
  const { colors } = useTheme();
  const [given, setGiven] = useState<FeedbackTag | null>(null);
  const tags: { tag: FeedbackTag; label: string }[] = lang === 'fa'
    ? [{ tag: 'helpful', label: 'مفید' }, { tag: 'not_helpful', label: 'غیرمفید' }, { tag: 'too_difficult', label: 'سخت' }, { tag: 'too_long', label: 'طولانی' }]
    : [{ tag: 'helpful', label: 'Helpful' }, { tag: 'not_helpful', label: 'Not helpful' }, { tag: 'too_difficult', label: 'Too hard' }, { tag: 'too_long', label: 'Too long' }];
  if (given) return <p className="text-[10px] mt-1" style={{ color: colors.success }}>✓ {lang === 'fa' ? 'بازخورد ثبت شد' : 'Feedback recorded'}</p>;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.map(({ tag, label }) => (
        <button key={tag} onClick={() => { setGiven(tag); recordFeedback(tag); }} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}`, cursor: 'pointer', color: colors.textTertiary }}>{label}</button>
      ))}
    </div>
  );
}

function MessageBubble({ msg, onConfirmTask, onAddPlan, onDismissTask }: {
  msg: AssistantMessage;
  onConfirmTask: (t: PendingTask) => void;
  onAddPlan: (blocks: PlanBlock[]) => void;
  onDismissTask: (msgId: string) => void;
}) {
  const { colors } = useTheme();
  const isUser = msg.role === 'user';
  const isRtl = msg.lang === 'fa';
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {!isUser && (
        <div className="flex items-center gap-1.5 mb-1">
          <AssistantAvatar size={20} />
          <span className="text-[10px]" style={{ color: colors.textTertiary }}>T-Minus</span>
        </div>
      )}
      <div className="max-w-[88%]">
        <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap" style={isUser
          ? { background: colors.accent, color: '#fff', borderBottomRightRadius: isRtl ? '1rem' : '0.25rem', borderBottomLeftRadius: isRtl ? '0.25rem' : '1rem' }
          : { background: colors.bgSubtle, color: colors.textPrimary, border: `1px solid ${colors.borderLight}`, borderBottomLeftRadius: isRtl ? '1rem' : '0.25rem', borderBottomRightRadius: isRtl ? '0.25rem' : '1rem' }
        }>
          {msg.content}
        </div>
        {msg.actionLabel && (
          <div className="flex items-center gap-1 mt-1">
            <CheckCircle2 size={10} />
            <span className="text-[10px] font-semibold" style={{ color: colors.success }}>{msg.actionLabel}</span>
          </div>
        )}
        {msg.card?.kind === 'plan' && <PlanCard card={msg.card} onAdd={onAddPlan} />}
        {msg.card?.kind === 'taskConfirmation' && <TaskConfirmCard card={msg.card} onConfirm={onConfirmTask} onCancel={() => onDismissTask(msg.id)} />}
        {msg.card?.kind === 'weeklyReport' && <WeeklyReportCard card={msg.card} />}
        {msg.card?.kind === 'goalBreakdown' && <GoalCard card={msg.card} />}
        {!isUser && !msg.card && <FeedbackRow lang={msg.lang} />}
      </div>
    </div>
  );
}

export default function AssistantPanel({ open, onClose, onAction, getCtx, defaultLang = 'auto' }: Props) {
  const { colors } = useTheme();
  const [langPref, setLangPref] = useState<AssistantLang>(defaultLang);
  const [dismissedTasks, setDismissedTasks] = useState<Set<string>>(new Set());

  const wrappedOnAction = useCallback((action: AssistantAction) => {
    if (action.type === 'startTimer') {
      startTimer(action.seconds, action.label);
    } else if (action.type === 'stopTimer') {
      stopTimer();
    }
    onAction(action);
  }, [onAction]);

  const { messages, input, setInput, loading, send, energy, setEnergy, currentLang, scrollRef, confirmPendingTask, addPlanToPlanner, clearConversation, setLang, timerState, startTimer, stopTimer } = useAssistant({
    lang: langPref, onAction: wrappedOnAction, getCtx,
  });

  useEffect(() => () => { stopTimer(); }, []);

  const handleLangChange = (l: AssistantLang) => { setLangPref(l); setLang(l); };
  const formatTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const ctx = getCtx();
  const prompts = starterPrompts(ctx.viewMode, currentLang);
  const isRtl = currentLang === 'fa';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ background: colors.overlay }} onClick={onClose}>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="w-full sm:w-[420px] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: colors.bgCard, boxShadow: `0 16px 48px ${colors.shadow}`, height: '100%', maxHeight: '680px' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ background: colors.heroBg }}>
          <div className="flex items-center gap-2.5">
            <AssistantAvatar size={32} />
            <div>
              <p className="text-sm font-bold text-white leading-tight">T-Minus Assistant</p>
              <p className="text-[10px] flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                {isRtl ? 'آماده' : 'Ready'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <EnergyBadge energy={energy} onChange={setEnergy} />
            <select value={langPref} onChange={e => handleLangChange(e.target.value as AssistantLang)} className="text-[10px] px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', cursor: 'pointer', outline: 'none' }}>
              <option value="auto">Auto</option>
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </select>
            <button onClick={clearConversation} className="p-1 rounded hover:opacity-75 transition-opacity" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'rgba(255,255,255,0.65)' }} title={isRtl ? 'پاک کردن' : 'Clear'}><Trash2 size={14} /></button>
            <button onClick={onClose} className="p-1 rounded hover:opacity-75 transition-opacity" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#fff' }}><X size={16} /></button>
          </div>
        </div>

        {timerState && (
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ background: colors.accentLight, borderBottom: `1px solid ${colors.borderLight}` }}>
            <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: colors.accent }}><Clock size={12} />{timerState.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono" style={{ color: colors.accent }}>{formatTimer(timerState.remaining)}</span>
              <button onClick={stopTimer} className="p-0.5 rounded hover:opacity-70" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.textTertiary }}><Square size={12} /></button>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AssistantAvatar size={48} />
              <p className="text-sm font-medium mt-3" style={{ color: colors.textPrimary }}>{isRtl ? 'دستیار برنامه‌ریزی شما' : 'Your planning assistant'}</p>
              <p className="text-xs mt-1 max-w-56" style={{ color: colors.textSecondary }}>{isRtl ? 'می‌توانم برنامه روزانه بسازم، یادآور تنظیم کنم، هفته‌ات را تحلیل کنم و راهنماییت کنم.' : 'I can plan your day, set reminders, analyze your week, and guide you around the app.'}</p>
              <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                {prompts.slice(0, 3).map(p => <button key={p} onClick={() => send(p)} className="text-xs px-2.5 py-1 rounded-full transition-colors" style={{ background: colors.accentLight, color: colors.accent, border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}>{p}</button>)}
              </div>
            </div>
          )}
          {messages.map(msg => !dismissedTasks.has(msg.id) && <MessageBubble key={msg.id} msg={msg} onConfirmTask={confirmPendingTask} onAddPlan={addPlanToPlanner} onDismissTask={id => setDismissedTasks(prev => new Set(prev).add(id))} />)}
          {loading && <div className="flex items-start gap-2"><AssistantAvatar size={20} /><TypingIndicator /></div>}
        </div>

        {messages.length > 0 && (
          <div className="px-4 py-2 flex gap-1.5 overflow-x-auto flex-shrink-0" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
            {prompts.slice(0, 4).map(p => <button key={p} onClick={() => send(p)} className="text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0 transition-colors" style={{ background: colors.bgSubtle, color: colors.textSecondary, border: `1px solid ${colors.borderLight}`, cursor: 'pointer' }}>{p}</button>)}
          </div>
        )}

        <div className="p-3 flex-shrink-0" style={{ borderTop: `1px solid ${colors.borderLight}`, background: colors.bgCard }}>
          <div className="flex gap-2 items-end">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder={isRtl ? 'بپرس یا دستور بده…' : 'Ask anything…'} rows={1} dir={isRtl ? 'rtl' : 'ltr'} className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" style={{ border: `1.5px solid ${colors.borderLight}`, background: colors.bgInput, color: colors.textPrimary, fontFamily: 'inherit', maxHeight: '120px', minHeight: '42px' }} />
            <button onClick={() => send(input)} disabled={!input.trim() || loading} className="flex items-center justify-center w-10 h-10 rounded-xl text-white transition-all flex-shrink-0" style={{ background: colors.accent, border: 'none', cursor: !input.trim() || loading ? 'not-allowed' : 'pointer', opacity: !input.trim() || loading ? 0.5 : 1 }}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AssistantButton({ onClick, lang }: { onClick: () => void; lang: 'fa' | 'en' }) {
  const { colors } = useTheme();
  const isRtl = lang === 'fa';
  return (
    <button onClick={onClick} className="fixed bottom-5 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-white shadow-xl transition-all hover:scale-105 z-40" style={{ [isRtl ? 'left' : 'right']: '20px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.heroBg})`, border: 'none', cursor: 'pointer', boxShadow: `0 4px 20px ${colors.shadow}` }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3C7 3 4 6 4 10c0 3 2 5.5 5 6.5V20l3-2 3 2v-3.5c3-1 5-3.5 5-6.5 0-4-3-7-8-7z" />
        <path d="M7 10c2 2 8 2 10 0" />
      </svg>
      <span className="hidden sm:inline">{isRtl ? 'دستیار' : 'Assistant'}</span>
    </button>
  );
}
