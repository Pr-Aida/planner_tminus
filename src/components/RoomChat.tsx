import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Trash2, Paperclip, Smile, Download, FileText, ImageIcon, Music, File,
  Loader2, X, Mic, Square, AlertTriangle, MoreVertical,
} from 'lucide-react';
import {
  fetchChatMessages, sendChatMessage, sendChatMessageWithAttachment, deleteChatMessage,
  subscribeToChat, markRoomChatRead,
  type ChatMessage, type MessageType,
} from '../lib/roomChat';
import {
  validateFile, formatFileSize, getSignedUrl, downloadFile,
  type FileType, type UploadedFile,
} from '../lib/files';
import { useTheme } from '../lib/theme';

interface Props {
  roomId: string;
  userId: string;
  isOwnerOrAdmin: boolean;
  themeColor?: string;
}

const EMOJIS = ['😀', '😂', '😍', '👍', '👏', '🎉', '🔥', '💪', '📚', '✏️', '☕', '🎯', '⭐', '💡', '🙏', '😅', '🥳', '😴', '🤔', '👀', '💯', '✅', '❤️', '🎓'];
const MAX_VOICE_DURATION = 120; // 2 minutes

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [readyToSend, setReadyToSend] = useState(false); // Show Send bar after recording stops
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const msgs = await fetchChatMessages(roomId);
    setMessages(msgs);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    load();
    // Mark messages as read when chat is opened/loaded
    markRoomChatRead(roomId);
    const sub = subscribeToChat(roomId, () => { load(); });
    return () => { sub.unsubscribe(); };
  }, [roomId, load]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clean up recording resources on unmount
  useEffect(() => {
    return () => {
      stopRecordingTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      audioChunksRef.current = [];
      recordedBlobRef.current = null;
    };
  }, []);

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
    setDeleteConfirmId(messageId);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    const result = await deleteChatMessage(deleteConfirmId);
    setDeleteConfirmId(null);
    if (result.ok) {
      // Reload messages to reflect the deletion for everyone
      await load();
    } else {
      setError(result.error || 'Failed to delete message.');
    }
  }

  async function handleDownloadAttachment(msg: ChatMessage) {
    if (!msg.attachment) return;

    setError(null);
    console.log('[Download] Starting download for attachment:', msg.attachment.id);

    try {
      // Try to get file metadata from the attachment or fetch it
      const { fetchFileById } = await import('../lib/files');
      const fileMeta = await fetchFileById(msg.attachment.id);

      if (!fileMeta) {
        console.error('[Download] Could not fetch file metadata');
        setError('Could not find file. It may have been deleted.');
        return;
      }

      console.log('[Download] Got file metadata:', fileMeta.storage_bucket, fileMeta.storage_path);

      // Use the download helper
      const result = await downloadFile(fileMeta.storage_bucket, fileMeta.storage_path, fileMeta.original_file_name);

      if (!result.ok) {
        setError(result.error || 'Could not download file. Please try again.');
      }
    } catch (err) {
      console.error('[Download] error:', err);
      setError('Download failed. Please try again.');
    }
  }

  function insertEmoji(emoji: string) {
    setInput(prev => prev + emoji);
    setShowEmoji(false);
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function getAttachmentIcon(type: FileType) {
    switch (type) {
      case 'image': return <ImageIcon size={18} color={accent} />;
      case 'pdf': return <FileText size={18} color={accent} />;
      case 'audio': return <Music size={18} color={accent} />;
      default: return <File size={18} color={accent} />;
    }
  }

  // ─── Voice recording ──────────────────────────────────────────────────────
  function stopRecordingTimer() {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  async function startRecording() {
    setVoiceError(null);
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('Voice recording is not supported in this browser.');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError('Microphone access was denied. Please allow microphone permission to record voice messages.');
      return;
    }

    streamRef.current = stream;
    audioChunksRef.current = [];
    recordedBlobRef.current = null;

    // Pick the best supported MIME type
    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    let mimeType = '';
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setVoiceError('Could not start recording. Please try again.');
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        audioChunksRef.current.push(e.data);
      }
    };

    // Use timeslice to get data during recording for reliability
    // This ensures chunks are collected even if stop() is called quickly
    recorder.start(500);
    setIsRecording(true);
    setRecordingSeconds(0);

    // Start timer
    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(s => {
        if (s + 1 >= MAX_VOICE_DURATION) {
          // Auto-stop at 2 minutes
          stopRecording();
          return MAX_VOICE_DURATION;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    stopRecordingTimer();

    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;

    if (!recorder) {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      // Try to build from existing chunks
      if (audioChunksRef.current.length > 0) {
        const mimeType = 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        recordedBlobRef.current = blob;
        setReadyToSend(true);
      }
      setIsRecording(false);
      return;
    }

    // Capture the current chunks immediately
    const currentChunks = [...audioChunksRef.current];
    const mimeType = recorder.mimeType || 'audio/webm';

    // If recorder is already inactive, use existing chunks
    if (recorder.state === 'inactive') {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      if (currentChunks.length > 0) {
        const blob = new Blob(currentChunks, { type: mimeType });
        recordedBlobRef.current = blob;
        setReadyToSend(true);
      }
      return;
    }

    // Set up one-time handler for the final data
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        currentChunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);

      if (currentChunks.length > 0) {
        const blob = new Blob(currentChunks, { type: mimeType });
        recordedBlobRef.current = blob;
        setReadyToSend(true);
      }
    };

    try {
      // Request final data then stop
      recorder.stop();
    } catch (err) {
      console.error('[Voice] stop error:', err);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      if (currentChunks.length > 0) {
        const blob = new Blob(currentChunks, { type: mimeType });
        recordedBlobRef.current = blob;
        setReadyToSend(true);
      }
    }
  }

  function cancelRecording() {
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setReadyToSend(false);
    audioChunksRef.current = [];
    recordedBlobRef.current = null;
    setRecordingSeconds(0);
  }

  async function sendVoiceMessage() {
    // Use the already-stopped blob
    const blob = recordedBlobRef.current;

    console.log('[Voice] Got blob:', blob ? `size=${blob.size}, type=${blob.type}` : 'null');

    if (!blob || blob.size === 0) {
      setVoiceError('Recording was empty. Please try again.');
      setRecordingSeconds(0);
      setReadyToSend(false);
      audioChunksRef.current = [];
      recordedBlobRef.current = null;
      return;
    }

    // Get the MIME type from the blob or recorder
    let mimeType = blob.type;
    if (!mimeType || mimeType === '') {
      mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    }
    console.log('[Voice] Using MIME type:', mimeType);

    // Determine file extension
    const ext = mimeType.includes('webm') ? 'webm' : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a' : 'ogg';
    const fileName = `voice-${Date.now()}.${ext}`;
    const file = new File([blob], fileName, { type: mimeType });

    console.log('[Voice] Created file:', file.name, file.size, file.type);

    // Validate size (5 MB max)
    if (file.size > 5 * 1024 * 1024) {
      setVoiceError('Voice message is too large. Please record a shorter message.');
      setRecordingSeconds(0);
      setReadyToSend(false);
      audioChunksRef.current = [];
      recordedBlobRef.current = null;
      return;
    }

    // Send as audio attachment
    setSending(true);
    setUploadProgress(true);
    setVoiceError(null);

    try {
      const result = await sendChatMessageWithAttachment(roomId, '', file, userId, 'audio');

      console.log('[Voice] Send result:', result);

      setSending(false);
      setUploadProgress(false);

      if (result.ok) {
        audioChunksRef.current = [];
        recordedBlobRef.current = null;
        setRecordingSeconds(0);
        setReadyToSend(false);
        // Reload messages to show the new voice message
        await load();
      } else {
        setVoiceError(result.error || 'Failed to send voice message.');
      }
    } catch (err) {
      setSending(false);
      setUploadProgress(false);
      setVoiceError('Failed to send voice message. Please try again.');
      console.error('[Voice] send error:', err);
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
                          onDownload={() => handleDownloadAttachment(m)}
                        />
                      )}
                      {/* Text message (may accompany an attachment) */}
                      {m.message && (
                        <span>{m.message}</span>
                      )}
                    </div>

                    {/* Delete button - show for message sender OR owner/admin */}
                    {(isOwn || isOwnerOrAdmin) && (
                      <button
                        onClick={() => setDeleteConfirmId(m.id)}
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
      {(error || voiceError) && (
        <p className="text-xs text-center py-1" style={{ color: colors.error }}>{error || voiceError}</p>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg" style={{ background: colors.errorBg, border: `1px solid ${colors.error}` }}>
          <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: colors.error }} />
          <span className="text-xs font-semibold" style={{ color: colors.error }}>Recording</span>
          <span className="text-xs font-mono" style={{ color: colors.error }}>{formatDuration(recordingSeconds)}</span>
          <span className="text-[10px]" style={{ color: colors.textSecondary }}>Max 2:00</span>
          <div className="flex-1" />
          <button
            onClick={cancelRecording}
            className="px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Ready to send indicator (after recording stops) */}
      {readyToSend && !isRecording && (
        <div className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg" style={{ background: colors.bgInput, border: `1px solid ${accent}` }}>
          <Music size={16} color={accent} />
          <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Voice message ready</span>
          <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>{formatDuration(recordingSeconds)}</span>
          <div className="flex-1" />
          <button
            onClick={cancelRecording}
            className="px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ background: colors.bgSubtle, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={sendVoiceMessage}
            disabled={sending}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white"
            style={{ background: accent, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1 }}
          >
            {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send
          </button>
        </div>
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
          disabled={uploadProgress || isRecording}
          className="flex items-center justify-center rounded-lg px-2 py-2 transition-colors flex-shrink-0"
          style={{ background: 'transparent', border: 'none', cursor: (uploadProgress || isRecording) ? 'not-allowed' : 'pointer' }}
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

        {/* Microphone / voice button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={uploadProgress || sending}
          className="flex items-center justify-center rounded-lg px-2 py-2 transition-colors flex-shrink-0"
          style={{ background: isRecording ? colors.errorBg : 'transparent', border: 'none', cursor: (uploadProgress || sending) ? 'not-allowed' : 'pointer' }}
          title={isRecording ? 'Stop recording' : 'Record voice message'}
        >
          {isRecording ? <Square size={16} color={colors.error} /> : <Mic size={18} color={colors.textSecondary} />}
        </button>

        {/* Text input */}
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={pendingFile ? 'Add a caption (optional)…' : isRecording ? 'Recording voice message…' : 'Write a message…'}
          maxLength={1000}
          disabled={sending || isRecording}
          className="flex-1 rounded-lg px-3 py-2 text-sm outline-none min-w-0"
          style={{ border: `1px solid ${colors.borderLight}`, background: colors.bgSubtle, color: colors.textPrimary }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={sending || (!input.trim() && !pendingFile) || isRecording}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity flex-shrink-0"
          style={{
            background: (input.trim() || pendingFile) && !isRecording ? accent : colors.bgHover,
            color: (input.trim() || pendingFile) && !isRecording ? '#FFFFFF' : colors.textSecondary,
            border: 'none',
            cursor: (input.trim() || pendingFile) && !isRecording ? 'pointer' : 'default',
          }}
        >
          {uploadProgress ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: colors.bgCard }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} color={colors.error} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="text-sm font-bold mb-1" style={{ color: colors.textPrimary }}>Delete this message?</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  This will remove the message for everyone in this room. If the message has an attachment, the file will also be deleted.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white"
                style={{ background: colors.error, border: 'none', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Attachment content renderer ──────────────────────────────────────────────
function AttachmentContent({
  msg, accent, colors, onDownload,
}: {
  msg: ChatMessage;
  accent: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onDownload: () => void;
}) {
  if (!msg.attachment) return null;
  const { file_type, original_file_name, file_size } = msg.attachment;

  const urlExpired = !msg.attachment_url;

  // Image: inline display with three-dot menu
  if (file_type === 'image' && !urlExpired) {
    return (
      <div className="mb-1 relative group">
        <img
          src={msg.attachment_url}
          alt={original_file_name}
          className="rounded-lg max-w-full max-h-48 object-cover"
          style={{ display: 'block' }}
        />
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} />
        </div>
      </div>
    );
  }

  // Audio: inline player with three-dot menu
  if (file_type === 'audio') {
    if (urlExpired) {
      return (
        <div className="flex items-center gap-2 mb-1 rounded-lg p-2 relative group" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <Music size={16} color={accent} />
          <span className="text-xs truncate flex-1" style={{ color: 'inherit' }}>{original_file_name}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} />
          </div>
        </div>
      );
    }
    return (
      <div className="mb-1 relative group">
        <div className="flex items-center gap-2 mb-1">
          <Music size={16} color={accent} />
          <span className="text-xs truncate flex-1" style={{ color: 'inherit' }}>{original_file_name}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} />
          </div>
        </div>
        <audio controls src={msg.attachment_url} className="w-full" style={{ height: '32px' }} />
      </div>
    );
  }

  // PDF / generic file: file card with three-dot menu
  return (
    <div
      className="flex items-center gap-2 mb-1 rounded-lg p-2 relative group"
      style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      {file_type === 'pdf' ? <FileText size={18} color={accent} /> : <File size={18} color={accent} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'inherit' }}>{original_file_name}</p>
        <p className="text-[10px]" style={{ color: 'inherit', opacity: 0.7 }}>{formatFileSize(file_size)}</p>
      </div>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} />
      </div>
    </div>
  );
}

// ─── File menu (three-dot) ─────────────────────────────────────────────────────
function FileMenu({
  fileName, onDownload, colors,
}: {
  fileName: string;
  onDownload: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 rounded transition-colors"
        style={{ background: open ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}
        title="Menu"
      >
        <MoreVertical size={14} color="inherit" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[10]" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-[20] rounded-lg shadow-lg py-1 min-w-[120px]"
            style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onDownload(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:opacity-80 transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textPrimary }}
            >
              <Download size={14} />
              Download
            </button>
          </div>
        </>
      )}
    </div>
  );
}
