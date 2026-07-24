import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Sparkles, X, MessageSquare } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { sendClaudeChat, type ChatMessage } from '../lib/claudeChat';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SYSTEM_PROMPT =
  'You are a helpful study-planning assistant inside the T Minus planner app. ' +
  'Keep answers concise and practical. When the user asks for a daily plan, ' +
  'return a clear hour-by-hour schedule in plain text.';

export default function ClaudeChat({ open, onClose }: Props) {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await sendClaudeChat(nextMessages, { system: SYSTEM_PROMPT, maxTokens: 1024 });
      setMessages([...nextMessages, { role: 'assistant', content: res.content }]);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages]);

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
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ background: colors.bgCard, boxShadow: `0 8px 32px ${colors.shadow}`, maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: colors.heroBg }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} color="#fff" />
            <span className="text-sm font-bold text-white">Claude Assistant</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-opacity hover:opacity-80"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <X size={18} color="#fff" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare size={32} color={colors.textTertiary} />
              <p className="text-sm mt-3" style={{ color: colors.textSecondary }}>
                Ask me anything — study tips, a daily plan, or help with your schedule.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
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
              placeholder="Type your message…"
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
