import { useState, useCallback, useEffect, useRef } from 'react';
import type { AssistantMessage, PlannerContext, ResolvedLang, AssistantAction, PendingTask, PlanBlock, AssistantLang, EnergyLevel } from '../services/assistant/types';
import { sendMessage, confirmTask, planBlocksToActivities } from '../services/assistant/engine';
import { resolveLang } from '../services/assistant/languageDetector';
import { loadHistory, saveHistory, clearHistory, loadProfile, saveProfile, uid, loadActiveTimer, saveActiveTimer } from '../services/assistant/memory';
import { runCleanup } from '../services/assistant/storageCleanup';

interface UseAssistantOpts {
  lang: AssistantLang;
  onAction: (action: AssistantAction) => void;
  getCtx: () => PlannerContext;
}

export function useAssistant({ lang, onAction, getCtx }: UseAssistantOpts) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [energy, setEnergy] = useState<EnergyLevel>('medium');
  const [currentLang, setCurrentLang] = useState<ResolvedLang>(lang === 'auto' ? 'en' : lang);
  const [timerState, setTimerState] = useState<{ remaining: number; label: string; totalSeconds: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const profile = loadProfile();

  useEffect(() => {
    runCleanup(profile.historyLimit);
    const stored = loadHistory();
    if (stored.length > 0) setMessages(stored);
    const active = loadActiveTimer();
    if (active) setTimerState(active);
  }, []);

  useEffect(() => {
    if (messages.length > 0) saveHistory(messages, profile.historyLimit);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (timerState) saveActiveTimer(timerState);
    else saveActiveTimer(null);
  }, [timerState]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const resolved = resolveLang(lang, text);
    setCurrentLang(resolved);
    const userMsg: AssistantMessage = { id: uid(), role: 'user', content: text, lang: resolved, timestamp: Date.now() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const ctx = { ...getCtx(), lang: resolved, energy };
      const res = await sendMessage(nextMessages.map(m => ({ role: m.role, content: m.content })), ctx);
      const assistantMsg: AssistantMessage = { id: uid(), role: 'assistant', content: res.content, lang: resolved, timestamp: Date.now(), actionLabel: res.actionLabel, card: res.card };
      setMessages([...nextMessages, assistantMsg]);
      if (res.action) actionRef.current(res.action);
    } catch {
      setMessages([...nextMessages, { id: uid(), role: 'assistant', content: resolved === 'fa' ? 'خطایی رخ داد. دوباره امتحان کن.' : 'Something went wrong. Please try again.', lang: resolved, timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, lang, energy, getCtx]);

  const confirmPendingTask = useCallback((task: PendingTask) => {
    const { action, label } = confirmTask(task, currentLang);
    actionRef.current(action);
    setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: currentLang === 'fa' ? `انجام شد. «${task.title}» به پلنر اضافه شد.` : `Done. "${task.title}" added to your planner.`, lang: currentLang, timestamp: Date.now(), actionLabel: label }]);
  }, [currentLang]);

  const addPlanToPlanner = useCallback((blocks: PlanBlock[]) => {
    const activities = planBlocksToActivities(blocks);
    actionRef.current({ type: 'addActivities', activities });
    setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: currentLang === 'fa' ? `انجام شد. ${activities.length} فعالیت به پلنر اضافه شد.` : `Done. ${activities.length} activities added to your planner.`, lang: currentLang, timestamp: Date.now(), actionLabel: currentLang === 'fa' ? 'برنامه اضافه شد' : 'Plan added' }]);
  }, [currentLang]);

  const clearConversation = useCallback(() => { setMessages([]); clearHistory(); }, []);

  const startTimer = useCallback((seconds: number, label: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerState({ remaining: seconds, label, totalSeconds: seconds });
    timerRef.current = setInterval(() => {
      setTimerState(prev => {
        if (!prev) return null;
        if (prev.remaining <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return null; }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerState(null);
  }, []);

  const setLangPref = useCallback((l: AssistantLang) => {
    const resolved = l === 'auto' ? 'en' : l;
    setCurrentLang(resolved);
    const p = loadProfile();
    saveProfile({ ...p, lang: l });
  }, []);

  return {
    messages, input, setInput, loading, send,
    energy, setEnergy, currentLang, setCurrentLang,
    scrollRef, confirmPendingTask, addPlanToPlanner, clearConversation, setLang: setLangPref,
    timerState, startTimer, stopTimer,
  };
}
