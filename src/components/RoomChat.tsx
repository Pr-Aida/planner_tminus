import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Trash2, Paperclip, Smile, Download, Eye, FileText, ImageIcon, Music, File, Loader2, X } from 'lucide-react';
import {
  fetchChatMessages, sendChatMessage, sendChatMessageWithAttachment, deleteChatMessage,
  subscribeToChat, type ChatMessage, type MessageType,
} from '../lib/roomChat';
import { validateFile, formatFileSize, getSignedUrl, type FileType } from '../lib/files';
import { useTheme } from '../lib/theme';

interface Props {
  roomId: string;
  userId: string;
  isOwnerOrAdmin: boolean;
  themeColor?: string;
}

const EMOJIS = ['😀', '😂', '😍', '👍', '👏', '🎉', '🔥', '💪', '📚', '✏️', '☕', '🎯', '⭐', '💡', '🙏', '😅', '🥳', '😴', '🤔', '👀', '💯', '✅', '❤️', '🎓'];

export default function RoomChat({ roomId, userId, isOwnerOrAdmin, themeColor }: Props) {
  const { colors } = useTheme();
  const accent = themeColor || colors.accent;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileType, setPendingFileType] = useState<FileType | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; name: string; type: FileType } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    setError(null);

    const validation = validateFile(file);
    if (!validation.ok) {
      setError(validation.error || 'File is too large. Please upload a smaller file.');
      return;
    }
    setPendingFile(file);
    setPendingFileType(validation.type || 'file');
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed && !pendingFile) return;
    if (sending) return;

    // With attachment
    if (pendingFile && pendingFileType) {
      setSending(true);
      setUploadProgress(true);
      setError(null);
      const msgType: MessageType = pendingFileType as MessageType;
      const result = await sendChatMessageWithAttachment(roomId, trimmed, pendingFile, userId, msgType);
      setSending(false);
      setUploadProgress(false);

      if (result.ok) {
        setInput('');
        setPendingFile(null);
        setPendingFileType(null);
      } else {
        setError(result.error || 'Failed to send attachment.');
      }
      return;
    }

    // Plain text
    if (!trimmed) return;
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

  async function handlePreviewAttachment(url: string | null, name: string, type: FileType) {
    if (!url) {
      // Re-fetch signed URL (may have expired)
      return;
    }
    setPreviewUrl({ url, name, type });
  }

  async function handleDownloadAttachment(msg: ChatMessage) {
    if (!msg.attachment || !msg.attachment_url) {
      // Try to get a fresh signed URL
      if (msg.attachment) {
        const { fetchFileById, getSignedUrl } = await import('../lib/files');
        const file = await fetchFileById(msg.attachment.id);
        if (file) {
          const url = await getSignedUrl(file.storage_bucket, file.storage_path, true);
          if (url) window.open(url, '_blank');
        }
      }
      return;
    }
    window.open(msg.attachment_url, '_blank');
  }

  function insertEmoji(emoji: string) {
    setInput(prev => prev + emoji);
    setShowEmoji(false);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getAttachmentIcon(type: FileType) {
    switch (type) {
      case 'image': return <ImageIcon size={18} color={accent} />;
      case 'pdf': return <FileText size={18} color={accent} />;
      case 'audio': return <Music size={18} color={accent} />;
      default: return <File size={18} color={accent} />;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={20} color={colors.textSecondary} />
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 280px)', minHeight: '300px' }}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-1 py-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm" style={{ color: colors.textSecondary }}>No messages yet.</p>
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
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5" style={{ background: isOwn ? accent : colors.textPrimary }}>
                    {(m.display_name || m.username || 'M').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Message bubble */}
                <div className={`group flex-1 min-w-0 max-w-[75%] ${isOwn ? 'text-right' : 'text-left'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5" style={{ flexDirection: isOwn ? 'row-reverse' : 'row' }}>
                    <span className="text-xs font-semibold truncate" style={{ color: colors.textPrimary }}>
                      {isOwn ? 'You' : (m.display_name || m.username || 'Member')}
                    </span>
                    {!isOwn && m.username && m.display_name && (
                      <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>@{m.username}</span>
                    )}
                    <span className="text-[10px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                      {formatTime(m.created_at)}
                    </span>
                  </div>

                  {m.is_deleted ? (
                    <div
                      className="inline-block rounded-lg px-3 py-1.5 text-sm break-words"
                      style={{ background: colors.bgSubtle, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'left' }}
                    >
                      Message deleted
                    </div>
                  ) : (
                    <div
                      className="inline-block rounded-lg px-3 py-1.5 text-sm break-words"
                      style={{
                        background: isOwn ? accent : colors.bgSubtle,
                        color: isOwn ? '#FFFFFF' : colors.textPrimary,
                        textAlign: 'left',
                      }}
                    >
                      {/* Attachment rendering */}
                      {m.attachment && m.message_type !== 'text' && (
                        <AttachmentContent
                          msg={m}
                          accent={accent}
                          colors={colors}
                          onPreview={() => handlePreviewAttachment(m.attachment_url, m.attachment!.original_file_name, m.attachment!.file_type)}
                          onDownload={() => handleDownloadAttachment(m)}
                        />
                      )}
                      {/* Text message (may accompany an attachment) */}
                      {m.message && (
                        <span>{m.message}</span>
                      )}
                    </div>
                  )}

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
        <p className="text-xs text-center py-1" style={{ color: colors.accent }}>{error}</p>
      )}

      {/* Pending file preview bar */}
      {pendingFile && (
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg" style={{ background: colors.bgInput, border: `1px solid ${colors.borderLight}` }}>
          {getAttachmentIcon(pendingFileType || 'file')}
          <span className="text-xs flex-1 truncate" style={{ color: colors.textPrimary }}>{pendingFile.name}</span>
          <span className="text-xs flex-shrink-0" style={{ color: colors.textSecondary }}>{formatFileSize(pendingFile.size)}</span>
          <button onClick={() => { setPendingFile(null); setPendingFileType(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={15} color={colors.textSecondary} />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <div className="rounded-lg p-2 mb-1 flex flex-wrap gap-1" style={{ background: colors.bgInput, border: `1px solid ${colors.borderLight}` }}>
          {EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={() => insertEmoji(emoji)}
              className="text-lg rounded p-1 transition-colors hover:opacity-70"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-1.5 pt-2" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
        {/* Emoji button */}
        <button
          onClick={() => setShowEmoji(s => !s)}
          className="flex items-center justify-center rounded-lg px-2 py-2 transition-colors flex-shrink-0"
          style={{ background: showEmoji ? colors.bgInput : 'transparent', border: 'none', cursor: 'pointer' }}
          title="Emoji"
        >
          <Smile size={18} color={showEmoji ? accent : colors.textSecondary} />
        </button>

        {/* Attachment button */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploadProgress}
          className="flex items-center justify-center rounded-lg px-2 py-2 transition-colors flex-shrink-0"
          style={{ background: 'transparent', border: 'none', cursor: uploadProgress ? 'not-allowed' : 'pointer' }}
          title="Attach file"
        >
          <Paperclip size={18} color={colors.textSecondary} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.m4a,.aac,audio/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Text input */}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={pendingFile ? 'Add a caption (optional)…' : 'Write a message…'}
          maxLength={1000}
          disabled={sending}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none min-w-0"
          style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgSubtle, color: colors.textPrimary }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !pendingFile)}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity flex-shrink-0"
          style={{
            background: (input.trim() || pendingFile) ? accent : colors.bgHover,
            color: (input.trim() || pendingFile) ? '#FFFFFF' : colors.textSecondary,
            border: 'none',
            cursor: (input.trim() || pendingFile) ? 'pointer' : 'default',
          }}
        >
          {uploadProgress ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Image/preview modal */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] rounded-xl overflow-hidden flex flex-col"
            style={{ background: colors.bgCard }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
              <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{previewUrl.name}</p>
              <div className="flex items-center gap-2">
                <a href={previewUrl.url} download={previewUrl.name} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: colors.bgInput, color: colors.textPrimary }}>
                  <Download size={13} /> Download
                </a>
                <button onClick={() => setPreviewUrl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <X size={18} color={colors.textSecondary} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4" style={{ minHeight: '250px' }}>
              {previewUrl.type === 'image' ? (
                <img src={previewUrl.url} alt={previewUrl.name} className="max-w-full max-h-[70vh] rounded-lg" />
              ) : previewUrl.type === 'pdf' ? (
                <iframe src={previewUrl.url} title={previewUrl.name} className="w-full" style={{ height: '70vh', border: 'none' }} />
              ) : previewUrl.type === 'audio' ? (
                <audio controls src={previewUrl.url} className="w-full" />
              ) : (
                <div className="text-center py-12">
                  <File size={36} color={colors.textTertiary} className="mx-auto mb-3" />
                  <a href={previewUrl.url} download={previewUrl.name} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white" style={{ background: colors.accent }}>
                    <Download size={14} /> Download
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Attachment content renderer ──────────────────────────────────────────────
function AttachmentContent({
  msg, accent, colors, onPreview, onDownload,
}: {
  msg: ChatMessage;
  accent: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onPreview: () => void;
  onDownload: () => void;
}) {
  if (!msg.attachment) return null;
  const { file_type, original_file_name, file_size } = msg.attachment;

  // Image: inline preview
  if (file_type === 'image' && msg.attachment_url) {
    return (
      <div className="mb-1">
        <img
          src={msg.attachment_url}
          alt={original_file_name}
          className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer"
          onClick={onPreview}
          style={{ display: 'block' }}
        />
      </div>
    );
  }

  // Audio: inline player
  if (file_type === 'audio' && msg.attachment_url) {
    return (
      <div className="mb-1">
        <div className="flex items-center gap-2 mb-1">
          <Music size={16} color={accent} />
          <span className="text-xs truncate" style={{ color: 'inherit' }}>{original_file_name}</span>
        </div>
        <audio controls src={msg.attachment_url} className="w-full" style={{ height: '32px' }} />
      </div>
    );
  }

  // PDF / generic file: file card
  return (
    <div
      className="flex items-center gap-2 mb-1 rounded-lg p-2"
      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      {file_type === 'pdf' ? <FileText size={20} color={accent} /> : <File size={20} color={accent} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'inherit' }}>{original_file_name}</p>
        <p className="text-[10px]" style={{ color: 'inherit', opacity: 0.7 }}>{formatFileSize(file_size)}</p>
      </div>
      {file_type === 'pdf' && msg.attachment_url && (
        <button
          onClick={onPreview}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Open"
        >
          <Eye size={15} color="inherit" />
        </button>
      )}
      <button
        onClick={onDownload}
        className="p-1 rounded transition-colors flex-shrink-0"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
        title="Download"
      >
        <Download size={15} color="inherit" />
      </button>
    </div>
  );
}
