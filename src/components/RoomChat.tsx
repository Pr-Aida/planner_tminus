import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { fetchChatMessages, sendChatMessage, deleteChatMessage, subscribeToChat, type ChatMessage } from '../lib/roomChat';

interface Props {
  roomId: string;
  userId: string;
  isOwnerOrAdmin: boolean;
}

export default function RoomChat({ roomId, userId, isOwnerOrAdmin }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const msgs = await fetchChatMessages(roomId);
    setMessages(msgs);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    load();

    const sub = subscribeToChat(roomId, () => { load(); });
    return () => { sub.unsubscribe(); };
  }, [roomId, load]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);
    const result = await sendChatMessage(roomId, trimmed);
    setSending(false);

    if (result.ok) {
      setInput('');
    } else {
      setError(result.error || 'Failed to send message.');
    }
  }

  async function handleDelete(messageId: string) {
    const result = await deleteChatMessage(messageId);
    if (!result.ok) {
      setError(result.error || 'Failed to delete message.');
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm" style={{ color: '#9CA3AF' }}>Loading chat…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '300px' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-1 py-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: '#9CA3AF' }}>No messages yet.</p>
          </div>
        ) : (
          messages.map(m => {
            const isOwn = m.user_id === userId;

            return (
              <div key={m.id} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5" style={{ background: isOwn ? '#7B1C3E' : '#1B2A4A' }}>
                    {(m.display_name || m.username || 'M').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Message bubble */}
                <div className={`group flex-1 min-w-0 max-w-[75%] ${isOwn ? 'text-right' : 'text-left'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5" style={{ flexDirection: isOwn ? 'row-reverse' : 'row' }}>
                    <span className="text-xs font-semibold truncate" style={{ color: '#1B2A4A' }}>
                      {isOwn ? 'You' : (m.display_name || m.username || 'Member')}
                    </span>
                    {!isOwn && m.username && m.display_name && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#9CA3AF' }}>@{m.username}</span>
                    )}
                    <span className="text-[10px] flex-shrink-0" style={{ color: '#9CA3AF' }}>
                      {formatTime(m.created_at)}
                    </span>
                  </div>
                  <div
                    className="inline-block rounded-lg px-3 py-1.5 text-sm break-words"
                    style={{
                      background: m.is_deleted ? '#F3F4F6' : (isOwn ? '#7B1C3E' : '#F8F9FC'),
                      color: m.is_deleted ? '#9CA3AF' : (isOwn ? '#FFFFFF' : '#1B2A4A'),
                      fontStyle: m.is_deleted ? 'italic' : 'normal',
                      textAlign: 'left',
                    }}
                  >
                    {m.is_deleted ? 'Message deleted' : m.message}
                  </div>
                  {/* Delete button for owner/admin */}
                  {!m.is_deleted && isOwnerOrAdmin && (
                    <button
                      onClick={() => handleDelete(m.id)}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center align-middle"
                      title="Delete message"
                      style={{ color: '#D97706', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-center py-1" style={{ color: '#D97706' }}>{error}</p>
      )}

      {/* Input */}
      <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid #E8EBF4' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Write a message…"
          maxLength={1000}
          disabled={sending}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
          style={{ border: '1px solid #E8EBF4', background: '#F8F9FC', color: '#1B2A4A' }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity"
          style={{
            background: input.trim() ? '#7B1C3E' : '#E8EBF4',
            color: input.trim() ? '#FFFFFF' : '#9CA3AF',
            border: 'none',
            cursor: input.trim() ? 'pointer' : 'default',
          }}
        >
          <Send size={14} />
          Send
        </button>
      </div>
    </div>
  );
}
