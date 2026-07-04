import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, Trash2, Paperclip, Smile, Download, FileText, ImageIcon, Music, File as FileIcon,
  Loader2, X, Mic, Square, AlertTriangle, MoreVertical,
} from 'lucide-react';
import {
  fetchChatMessages, fetchNewChatMessages, refreshMessagesByIds, sendChatMessage, sendChatMessageWithAttachment, deleteChatMessage,
  subscribeToChat, joinChatActivity, markRoomChatRead, clearChatCache,
  type ChatMessage, type MessageType, type ChatActivityState, type ChatActivityType,
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
const MAX_VOICE_SIZE = 5 * 1024 * 1024; // 5 MB

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
  const [readyToSend, setReadyToSend] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const cancelRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Optimistic local voice bubble shown immediately on Send, while the
  // upload + attachment link is still in flight. Replaced by the real
  // server message once it arrives via realtime/refresh.
  const [sendingVoice, setSendingVoice] = useState<{ url: string; duration: number } | null>(null);

  // ─── Chat activity indicators (iMessage-style typing dots) ────────────────
  // Other approved members' ephemeral activity, received via realtime broadcast.
  const [otherActivity, setOtherActivity] = useState<ChatActivityState[]>([]);
  // Current user's outgoing activity broadcast — debounced so we don't spam.
  const lastBroadcastRef = useRef<number>(0);
  const activityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentActivityRef = useRef<ChatActivityType | null>(null);
  // Single joined channel for both sending + receiving. Held in a ref so it
  // persists across renders and is cleaned up on room switch / unmount.
  const activityChannelRef = useRef<{ broadcast: (t: ChatActivityType | null) => void; unsubscribe: () => void } | null>(null);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const msgs = await fetchChatMessages(roomId);
    setMessages(msgs);
    setLoading(false);
  }, [roomId]);

  // Incremental refresh: fetch new messages AND re-fetch messages whose
  // attachment_id was set after the message was already loaded (e.g. voice
  // messages where the file upload + attachment link happens after insert).
  const refreshNew = useCallback(async () => {
    setMessages(prev => {
      const newest = prev.length > 0 ? prev[prev.length - 1].created_at : null;
      // Collect messages that need an attachment re-fetch. Two cases:
      //  (a) attachment_id is set but attachment data not yet resolved.
      //  (b) non-text messages (audio/image/file) with no resolved attachment —
      //      covers voice messages inserted with attachment_id=null, then
      //      UPDATE'd with the id after upload completes. Without this, the
      //      UPDATE realtime event never re-fetches the attachment and the
      //      audio player only appears after a full page refresh.
      const pendingAttachmentIds = prev
        .filter(m =>
          (m.attachment_id && !m.attachment) ||
          (m.message_type !== 'text' && !m.attachment)
        )
        .map(m => m.id);

      (async () => {
        if (!newest && pendingAttachmentIds.length === 0) {
          // No known messages — full load
          const all = await fetchChatMessages(roomId);
          setMessages(all);
          return;
        }

        // 1. Fetch new messages (newer than the newest known)
        if (newest) {
          const fresh = await fetchNewChatMessages(roomId, newest);
          if (fresh.length > 0) {
            setMessages(cur => {
              const existing = new Set(cur.map(m => m.id));
              const toAdd = fresh.filter(m => !existing.has(m.id));
              return toAdd.length > 0 ? [...cur, ...toAdd] : cur;
            });
          }
        }

        // 2. Re-fetch messages with pending attachments (attachment_id set
        //    but attachment data not yet resolved). This handles the case
        //    where a message was inserted, then the file was uploaded and
        //    the attachment_id was updated — the realtime UPDATE event
        //    triggers this refresh.
        if (pendingAttachmentIds.length > 0) {
          const refreshed = await refreshMessagesByIds(roomId, pendingAttachmentIds);
          if (refreshed.length > 0) {
            const refreshMap = new Map(refreshed.map(m => [m.id, m]));
            setMessages(cur => cur.map(m => {
              const updated = refreshMap.get(m.id);
              return updated && updated.attachment ? updated : m;
            }));
          }
        }
      })();
      return prev;
    });
  }, [roomId]);

  useEffect(() => {
    setLoading(true);
    load();
    markRoomChatRead(roomId);
    const sub = subscribeToChat(roomId, () => { refreshNew(); });
    // Join the single activity channel for this room — used for both sending
    // and receiving ephemeral typing/recording/uploading indicators.
    activityChannelRef.current = joinChatActivity(roomId, userId, (states) => {
      // Prune states older than 5s (safety net for missed clear broadcasts).
      const cutoff = Date.now() - 5000;
      setOtherActivity(states.filter(s => s.timestamp > cutoff));
    });
    return () => {
      sub.unsubscribe();
      // Clear our activity and tear down the channel when leaving the room.
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }
      if (activityChannelRef.current) {
        activityChannelRef.current.broadcast(null);
        activityChannelRef.current.unsubscribe();
        activityChannelRef.current = null;
      }
      clearChatCache(roomId);
    };
  }, [roomId, userId, load, refreshNew]);

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
      // Revoke any leftover preview object URL so we don't leak memory.
      setPreviewUrl(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  // ─── Part 1: clear the optimistic voice bubble the instant the real audio
  // message from this user arrives in the chat, instead of a fixed delay. This
  // makes the swap from "Sending…" to the playable audio player feel immediate.
  useEffect(() => {
    if (!sendingVoice) return;
    const arrived = messages.some(
      m => m.user_id === userId && m.message_type === 'audio'
        && Date.now() - new Date(m.created_at).getTime() < 30000,
    );
    if (arrived) {
      setSendingVoice(prev => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  }, [messages, sendingVoice, userId]);

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
      setActivity('uploading_file');
      const msgType: MessageType = pendingFileType as MessageType;
      const result = await sendChatMessageWithAttachment(roomId, trimmed, pendingFile, userId, msgType);
      setSending(false);
      setUploadProgress(false);
      setActivity(null);

      if (result.ok) {
        setInput('');
        setPendingFile(null);
        setPendingFileType(null);
        // Trigger a refresh to pick up the new message + attachment.
        refreshNew();
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
    setActivity(null);

    if (result.ok) {
      setInput('');
      // Realtime will deliver the message, but trigger refresh as a safety net.
      refreshNew();
    } else {
      setError(result.error || 'Failed to send message.');
    }
  }

  async function handleDelete(messageId: string) {
    setDeleteConfirmId(messageId);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    const targetId = deleteConfirmId;
    const result = await deleteChatMessage(targetId);
    setDeleteConfirmId(null);
    if (result.ok) {
      // Optimistically remove the deleted message from state — no refetch needed.
      setMessages(prev => prev.filter(m => m.id !== targetId));
    } else {
      setError(result.error || 'Failed to delete message.');
    }
  }

  async function handleDownloadAttachment(msg: ChatMessage) {
    if (!msg.attachment) return;
    setError(null);
    try {
      const { fetchFileById } = await import('../lib/files');
      const fileMeta = await fetchFileById(msg.attachment.id);
      if (!fileMeta) {
        setError('Could not find file. It may have been deleted.');
        return;
      }
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
      default: return <FileIcon size={18} color={accent} />;
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
    cancelRef.current = false;

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

    recorder.start(500);
    setIsRecording(true);
    setReadyToSend(false);
    setRecordingSeconds(0);
    setActivity('recording_voice');

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds(s => {
        if (s + 1 >= MAX_VOICE_DURATION) {
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

    if (!recorder || recorder.state === 'inactive') {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      if (audioChunksRef.current.length > 0) {
        const mimeType = recorder?.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          recordedBlobRef.current = blob;
          setPreviewUrl(URL.createObjectURL(blob));
          setReadyToSend(true);
        }
      }
      return;
    }

    const mimeType = recorder.mimeType || 'audio/webm';

    recorder.onstop = () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);

      if (cancelRef.current) {
        audioChunksRef.current = [];
        recordedBlobRef.current = null;
        setReadyToSend(false);
        return;
      }

      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          recordedBlobRef.current = blob;
          setPreviewUrl(URL.createObjectURL(blob));
          setReadyToSend(true);
        } else {
          setVoiceError('Recording was empty. Please try again.');
          setReadyToSend(false);
        }
      } else {
        setVoiceError('Recording was empty. Please try again.');
        setReadyToSend(false);
      }
    };

    try {
      recorder.stop();
    } catch (err) {
      console.error('[Voice] stop error:', err);
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setIsRecording(false);
      if (audioChunksRef.current.length > 0) {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          recordedBlobRef.current = blob;
          setReadyToSend(true);
        }
      }
    }
  }

  function clearPreviewUrl() {
    setPreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  // ─── Activity broadcast helpers ───────────────────────────────────────────
  // Debounce broadcasts to at most once per 1.5s. Auto-clear after 4s of no
  // re-broadcast so the indicator disappears if the user stops interacting.
  function setActivity(type: ChatActivityType | null) {
    if (type === null) {
      currentActivityRef.current = null;
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
        activityTimeoutRef.current = null;
      }
      activityChannelRef.current?.broadcast(null);
      return;
    }
    currentActivityRef.current = type;
    const now = Date.now();
    if (now - lastBroadcastRef.current > 1500) {
      lastBroadcastRef.current = now;
      activityChannelRef.current?.broadcast(type);
    }
    // Reset the auto-clear timer — every keystroke/recording tick refreshes it.
    if (activityTimeoutRef.current) clearTimeout(activityTimeoutRef.current);
    activityTimeoutRef.current = setTimeout(() => {
      currentActivityRef.current = null;
      activityChannelRef.current?.broadcast(null);
    }, 4000);
  }

  function cancelRecording() {
    stopRecordingTimer();
    cancelRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setReadyToSend(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    recordedBlobRef.current = null;
    clearPreviewUrl();
    setActivity(null);
  }

  async function sendVoiceMessage() {
    const blob = recordedBlobRef.current;

    if (!blob || blob.size === 0) {
      setVoiceError('Audio file is empty. Please try recording again.');
      setReadyToSend(false);
      recordedBlobRef.current = null;
      audioChunksRef.current = [];
      return;
    }

    if (blob.size > MAX_VOICE_SIZE) {
      setVoiceError('Voice message is too large (max 5 MB). Please record a shorter message.');
      return;
    }

    // Strip codec parameters for a clean MIME type
    const rawMime = blob.type || mediaRecorderRef.current?.mimeType || 'audio/webm';
    const mimeType = rawMime.split(';')[0].trim() || 'audio/webm';

    // Map MIME type to file extension
    const ext = mimeType.includes('webm') ? 'webm'
      : mimeType.includes('mp4') || mimeType.includes('m4a') ? 'm4a'
      : mimeType.includes('ogg') ? 'ogg'
      : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
      : mimeType.includes('wav') ? 'wav'
      : 'webm';
    const fileName = `voice-${Date.now()}.${ext}`;

    // Create File from Blob — the existing attachment pipeline handles the rest
    const arrayBuffer = await blob.arrayBuffer();
    const file = new File([arrayBuffer], fileName, { type: mimeType });

    setSending(true);
    setUploadProgress(true);
    setVoiceError(null);
    setActivity('sending_voice');

    // Optimistic: show an immediate audio bubble using the local preview URL
    // so the user sees a voice bubble (not a filename) while upload is in flight.
    // The real server message replaces it once it arrives via refresh/realtime.
    const optimisticUrl = previewUrl || URL.createObjectURL(blob);
    setSendingVoice({ url: optimisticUrl, duration: recordingSeconds });

    try {
      const result = await sendChatMessageWithAttachment(roomId, '', file, userId, 'audio');

      setSending(false);
      setUploadProgress(false);

      if (result.ok) {
        audioChunksRef.current = [];
        recordedBlobRef.current = null;
        setRecordingSeconds(0);
        setReadyToSend(false);
        clearPreviewUrl();
        setActivity(null);
        // Trigger a refresh to pick up the new message + attachment.
        // Realtime may also fire; whichever arrives first clears the optimistic
        // bubble (handled by the effect watching messages for an audio row from
        // the current user). This avoids a fixed-delay wait.
        refreshNew();
      } else {
        setSendingVoice(null);
        if (optimisticUrl !== previewUrl) URL.revokeObjectURL(optimisticUrl);
        setActivity(null);
        setVoiceError(result.error || 'Failed to send voice message.');
      }
    } catch (err) {
      setSending(false);
      setUploadProgress(false);
      setSendingVoice(null);
      if (optimisticUrl !== previewUrl) URL.revokeObjectURL(optimisticUrl);
      setActivity(null);
      const errMsg = err instanceof Error ? err.message : String(err);
      setVoiceError(`Failed to send voice message: ${errMsg}`);
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
                          colors={colors}
                          bubbleBg={isOwn ? accent : colors.bgSubtle}
                          onDownload={() => handleDownloadAttachment(m)}
                        />
                      )}
                      {/* Audio message whose attachment is still resolving
                          (insert fired before upload/link completed). Show a
                          loading audio bubble instead of the raw file name. */}
                      {m.message_type === 'audio' && !m.attachment && (
                        <div className="flex items-center gap-2 py-1">
                          <Loader2 size={14} className="animate-spin" style={{ color: isOwn ? '#FFFFFF' : colors.textSecondary }} />
                          <span className="text-xs" style={{ color: isOwn ? '#FFFFFF' : colors.textSecondary }}>Voice message…</span>
                        </div>
                      )}
                      {/* Text message — suppressed for audio messages so the
                          file name / label never shows as plain text. */}
                      {m.message && m.message_type !== 'audio' && (
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
        {/* iMessage-style activity indicator — shows ONLY three animated dots
            when another approved room member is typing/recording/uploading.
            Ephemeral realtime broadcast; no database rows. No text labels. */}
        {otherActivity.length > 0 && (
          <div className="flex flex-row-reverse">
            <div className="inline-block rounded-2xl px-3 py-2.5" style={{ background: colors.bgSubtle }}>
              <span className="typing-dots flex items-center gap-1">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
            </div>
          </div>
        )}
        {/* Optimistic voice bubble — shown immediately on Send while the
            upload/attachment-link is in flight. Replaced by the real server
            message once it arrives. Rendered as an audio player, never as
            plain file-name text. */}
        {sendingVoice && (
          <div className="flex gap-2 flex-row-reverse">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 mt-0.5" style={{ background: accent }}>
              {'M'}
            </div>
            <div className="flex-1 min-w-0 max-w-[75%] text-right">
              <div className="inline-block text-left rounded-2xl px-3 py-2" style={{ background: accent, color: '#FFFFFF' }}>
                <div className="flex items-center gap-2 mb-1">
                  <Music size={14} color="#FFFFFF" />
                  <span className="text-xs font-semibold" style={{ opacity: 0.9 }}>Voice message</span>
                  <span className="text-xs font-mono" style={{ opacity: 0.75 }}>{formatDuration(sendingVoice.duration)}</span>
                  <Loader2 size={12} className="animate-spin" color="#FFFFFF" />
                  <span className="text-[10px]" style={{ opacity: 0.75 }}>Sending…</span>
                </div>
                <audio controls src={sendingVoice.url} className="w-full" style={{ height: 32 }} />
              </div>
            </div>
          </div>
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
            className="px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
            style={{ background: colors.bgInput, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Ready to send indicator (after recording stops) — includes audio preview */}
      {readyToSend && !isRecording && (
        <div className="px-3 py-2 mb-1 rounded-lg" style={{ background: colors.bgInput, border: `1px solid ${accent}` }}>
          <div className="flex items-center gap-2">
            <Music size={16} color={accent} />
            <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>Voice message ready</span>
            <span className="text-xs font-mono" style={{ color: colors.textSecondary }}>{formatDuration(recordingSeconds)}</span>
            <div className="flex-1" />
            <button
              onClick={cancelRecording}
              className="px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
              style={{ background: colors.bgSubtle, color: colors.textSecondary, border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={sendVoiceMessage}
              disabled={sending}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-white flex-shrink-0"
              style={{ background: accent, border: 'none', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1 }}
            >
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send
            </button>
          </div>
          {previewUrl && (
            <audio controls src={previewUrl} className="w-full mt-2" style={{ height: 32 }} />
          )}
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
          disabled={uploadProgress || sending || readyToSend}
          className="flex items-center justify-center rounded-lg px-2 py-2 transition-colors flex-shrink-0"
          style={{ background: isRecording ? colors.errorBg : 'transparent', border: 'none', cursor: (uploadProgress || sending || readyToSend) ? 'not-allowed' : 'pointer' }}
          title={isRecording ? 'Stop recording' : 'Record voice message'}
        >
          {isRecording ? <Square size={16} color={colors.error} /> : <Mic size={18} color={colors.textSecondary} />}
        </button>

        {/* Text input */}
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setActivity('typing'); }}
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
  msg, colors, onDownload, bubbleBg,
}: {
  msg: ChatMessage;
  colors: ReturnType<typeof useTheme>['colors'];
  onDownload: () => void;
  bubbleBg: string;
}) {
  if (!msg.attachment) return null;
  const { file_type, original_file_name, file_size } = msg.attachment;

  const urlExpired = !msg.attachment_url;
  // High-contrast color for small icons/details inside the colored bubble:
  // navy details on a burgundy/pink bubble, burgundy on a navy/light bubble.
  const detail = detailColorForBubble(bubbleBg);

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
        <div className="absolute top-1 right-1">
          <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} iconColor={detail} />
        </div>
      </div>
    );
  }

  // Audio: inline player with three-dot menu
  if (file_type === 'audio') {
    if (urlExpired) {
      return (
        <div className="flex items-center gap-2 mb-1 rounded-lg p-2 relative group" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}>
          <Music size={16} color={detail} />
          <span className="text-xs truncate flex-1" style={{ color: 'inherit' }}>Voice message</span>
          <div>
            <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} iconColor={detail} />
          </div>
        </div>
      );
    }
    return (
      <div className="mb-1 relative group">
        <div className="flex items-center gap-2 mb-1">
          <Music size={16} color={detail} />
          <span className="text-xs truncate flex-1" style={{ color: 'inherit' }}>Voice message</span>
          <div>
            <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} iconColor={detail} />
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
      {file_type === 'pdf' ? <FileText size={18} color={detail} /> : <FileIcon size={18} color={detail} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: 'inherit' }}>{original_file_name}</p>
        <p className="text-[10px]" style={{ color: 'inherit', opacity: 0.7 }}>{formatFileSize(file_size)}</p>
      </div>
      <div>
        <FileMenu fileName={original_file_name} onDownload={onDownload} colors={colors} iconColor={detail} />
      </div>
    </div>
  );
}

// ─── File menu (three-dot) ─────────────────────────────────────────────────────
const BURGUNDY = '#800020';
const NAVY = '#1B2A4A';

// Decide a high-contrast detail color for icons inside a colored chat bubble.
// On a navy/dark-blue bubble the burgundy/pink accent reads well; on a
// burgundy/pink bubble the accent disappears, so we switch to navy instead.
function detailColorForBubble(bubbleBg: string): string {
  const hex = bubbleBg.replace('#', '').toLowerCase();
  if (hex.length < 6) return BURGUNDY;
  const r = parseInt(hex.slice(0, 2), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Warm (red-dominant) backgrounds -> navy details. Cool (blue-dominant) -> burgundy.
  return r > b + 20 ? NAVY : BURGUNDY;
}

function FileMenu({
  fileName, onDownload, colors, iconColor,
}: {
  fileName: string;
  onDownload: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  iconColor: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 rounded transition-colors flex items-center justify-center"
        style={{ background: open ? 'rgba(128,0,32,0.15)' : 'transparent', border: 'none', cursor: 'pointer' }}
        title="Download"
        aria-label="File menu"
      >
        <MoreVertical size={16} color={iconColor} strokeWidth={2.5} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[10]" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1 z-[20] rounded-lg shadow-lg py-1 min-w-[130px]"
            style={{ background: colors.bgCard, border: `1px solid ${colors.borderLight}` }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setOpen(false); onDownload(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left hover:opacity-80 transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: colors.textPrimary }}
            >
              <Download size={14} color={iconColor} />
              Download
            </button>
          </div>
        </>
      )}
    </div>
  );
}
