import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, MessageSquare, Clock, Sparkles } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { sendClaudeChat, type ChatMessage, type AssistantAction } from '../lib/claudeChat';

interface Props {
  open: boolean;
  onClose: () => void;
  onAction?: (action: AssistantAction) => void;
}

function AssistantIcon({ size = 18, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10c2 2 8 2 10 0" />
      <circle cx="9" cy="7" r="0.8" fill={color} stroke="none" />
      <circle cx="15" cy="7" r="0.8" fill={color} stroke="none" />
    </svg>
  );
}

export default function ClaudeChat({ open, onClose, onAction }: Props) {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [timer, setTimer] = useState<{ remaining: number; label: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = useCallback((seconds: number, label: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer({ remaining: seconds, label });
    timerRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev) return null;
        if (prev.remaining <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setMessages(m => [...m, { role: 'assistant', content: `Timer finished — ${label} is up!` }]);
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTimer(null);
  }, []);

  const formatTimer = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await sendClaudeChat(nextMessages);
      setMessages([...nextMessages, { role: 'assistant', content: res.content }]);
      if (res.action) {
        if (res.action.type === 'startTimer') {
          startTimer(res.action.seconds, res.action.label);
        } else if (res.action.type === 'stopTimer') {
          stopTimer();
        }
        onAction?.(res.action);
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, onAction, startTimer, stopTimer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: colors.overlay }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ background: colors.bgCard, boxShadow: `0 8px 32px ${colors.shadow}`, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: colors.heroBg }}
        >
          <div className="flex items-center gap-2">
            <AssistantIcon size={18} color="#fff" />
            <span className="text-sm font-bold text-white">T-Minus Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-opacity hover:opacity-80"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X size={18} color="#fff" />
          </button>
        </div>

        {/* Dismissible banner */}
        {showBanner && (
          <div
            className="flex items-center justify-between gap-2 px-4 py-2 text-xs"
            style={{ background: colors.accentLight, color: colors.accent, borderBottom: `1px solid ${colors.borderLight}` }}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} />
              New Feature: T-Minus Assistant is now available!
            </span>
            <button
              onClick={() => setShowBanner(false)}
              className="p-0.5 rounded transition-opacity hover:opacity-70"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: colors.accent }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Timer strip */}
        {timer && (
          <div
            className="flex items-center justify-between px-4 py-2 text-xs font-mono"
            style={{ background: colors.bgSubtle, borderBottom: `1px solid ${colors.borderLight}` }}
          >
            <span className="flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
              <Clock size={13} />
              {timer.label}
            </span>
            <span className="font-bold" style={{ color: colors.accent }}>{formatTimer(timer.remaining)}</span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AssistantIcon size={32} color={colors.textTertiary} />
              <p className="text-sm mt-3" style={{ color: colors.textSecondary }}>
                I can plan your day, set timers, add activities, or guide you around the app.
              </p>
              <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                Try: "plan my day" or "set a 25 minute timer"
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                style={
                  m.role === 'user'
                    ? { background: colors.accent, color: '#fff' }
                    : { background: colors.bgSubtle, color: colors.textPrimary, border: `1px solid ${colors.borderLight}` }
                }
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div
                className="rounded-xl px-3.5 py-2.5 flex items-center gap-2"
                style={{ background: colors.bgSubtle, border: `1px solid ${colors.borderLight}` }}
              >
                <Loader2 size={14} className="animate-spin" color={colors.textSecondary} />
                <span className="text-xs" style={{ color: colors.textSecondary }}>Thinking…</span>
              </div>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{ background: colors.errorBg, color: colors.error }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="p-3 border-t"
          style={{ borderColor: colors.borderLight, background: colors.bgCard }}
        >
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me to plan, set a timer, or add a task…"
              rows={1}
              className="flex-1 rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{
                border: `1.5px solid ${colors.borderLight}`,
                background: colors.bgInput,
                color: colors.textPrimary,
                fontFamily: 'inherit',
                maxHeight: '120px',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex items-center justify-center w-10 h-10 rounded-lg text-white transition-opacity flex-shrink-0"
              style={{
                background: colors.accent,
                border: 'none',
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || loading ? 0.5 : 1,
              }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
