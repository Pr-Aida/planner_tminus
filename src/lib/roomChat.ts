import { supabase } from './supabase';
import { fetchFileById, getSignedUrl, type UploadedFile, type FileType } from './files';

export type MessageType = 'text' | 'image' | 'pdf' | 'audio' | 'file';

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  attachment_id: string | null;
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  // Resolved attachment data (fetched separately)
  attachment?: {
    id: string;
    file_type: FileType;
    original_file_name: string;
    file_size: number;
    mime_type: string;
  } | null;
  attachment_url?: string | null;
}

interface ChatRow {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  attachment_id: string | null;
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
}

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

const MAX_MESSAGE = 1000;
const PAGE_SIZE = 50;
const INITIAL_LOAD_LIMIT = 200;

// In-memory cache of member profiles per room. Cleared when the room changes.
// This avoids re-fetching profiles on every realtime message insert.
const profileCache = new Map<string, Map<string, ProfileRow>>();

async function getRoomProfileMap(roomId: string): Promise<Map<string, ProfileRow>> {
  const cached = profileCache.get(roomId);
  if (cached) return cached;
  const { data: profiles } = await supabase.rpc('get_room_member_profiles', { p_room_id: roomId });
  const map = new Map<string, ProfileRow>();
  ((profiles || []) as unknown as ProfileRow[]).forEach(p => map.set(p.id, p));
  profileCache.set(roomId, map);
  return map;
}

/** Clear the profile cache for a room (call on room switch / unmount). */
export function clearChatCache(roomId?: string): void {
  if (roomId) {
    profileCache.delete(roomId);
  } else {
    profileCache.clear();
  }
}

function rowToMessage(r: ChatRow, profileMap: Map<string, ProfileRow>): ChatMessage {
  const p = profileMap.get(r.user_id);
  return {
    id: r.id,
    room_id: r.room_id,
    user_id: r.user_id,
    message: r.is_deleted ? '' : r.message,
    message_type: r.message_type || 'text',
    attachment_id: r.attachment_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_deleted: r.is_deleted,
    username: p?.username,
    display_name: p?.display_name,
    avatar_url: p?.avatar_url,
    attachment: null as ChatMessage['attachment'],
    attachment_url: null as string | null,
  };
}

async function resolveAttachments(messages: ChatMessage[]): Promise<void> {
  const attachmentIds = messages
    .filter(m => m.attachment_id && !m.is_deleted)
    .map(m => m.attachment_id!) as string[];
  if (attachmentIds.length === 0) return;

  const fileMap = new Map<string, UploadedFile>();
  await Promise.all(attachmentIds.map(async (fid) => {
    const file = await fetchFileById(fid);
    if (file) fileMap.set(fid, file);
  }));

  for (const m of messages) {
    if (m.attachment_id && !m.is_deleted) {
      const file = fileMap.get(m.attachment_id);
      if (file) {
        m.attachment = {
          id: file.id,
          file_type: file.file_type,
          original_file_name: file.original_file_name,
          file_size: file.file_size,
          mime_type: file.mime_type,
        };
        const url = await getSignedUrl(file.storage_bucket, file.storage_path);
        m.attachment_url = url;
      }
    }
  }
}

export async function fetchChatMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('room_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(INITIAL_LOAD_LIMIT);

  if (error) {
    console.error('[Chat] fetch failed:', error);
    return [];
  }

  const rows = (data || []) as unknown as ChatRow[];
  if (rows.length === 0) return [];

  const profileMap = await getRoomProfileMap(roomId);
  const messages = rows.map(r => rowToMessage(r, profileMap));
  await resolveAttachments(messages);
  return messages;
}

/**
 * Fetch only messages newer than the given ISO timestamp.
 * Used by realtime handlers to avoid refetching the entire message list.
 * Returns new messages with profiles + attachments resolved.
 */
export async function fetchNewChatMessages(roomId: string, sinceIso: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('room_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .gt('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(PAGE_SIZE);

  if (error) {
    console.error('[Chat] fetch new failed:', error);
    return [];
  }

  const rows = (data || []) as unknown as ChatRow[];
  if (rows.length === 0) return [];

  const profileMap = await getRoomProfileMap(roomId);
  const messages = rows.map(r => rowToMessage(r, profileMap));
  await resolveAttachments(messages);
  return messages;
}

/**
 * Re-fetch specific messages by ID (with attachments resolved).
 * Used by realtime handlers when a message's attachment_id is updated
 * after the initial insert — the message already exists in state but
 * needs its attachment data refreshed.
 */
export async function refreshMessagesByIds(roomId: string, messageIds: string[]): Promise<ChatMessage[]> {
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('room_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .in('id', messageIds)
    .eq('is_deleted', false);

  if (error) {
    console.error('[Chat] refresh by id failed:', error);
    return [];
  }

  const rows = (data || []) as unknown as ChatRow[];
  if (rows.length === 0) return [];

  const profileMap = await getRoomProfileMap(roomId);
  const messages = rows.map(r => rowToMessage(r, profileMap));
  await resolveAttachments(messages);
  return messages;
}

/**
 * Fetch older messages for pagination (load more history).
 * Returns messages older than the given ISO timestamp, in ascending order.
 */
export async function fetchOlderChatMessages(roomId: string, beforeIso: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('room_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .lt('created_at', beforeIso)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error('[Chat] fetch older failed:', error);
    return [];
  }

  const rows = (data || []) as unknown as ChatRow[];
  if (rows.length === 0) return [];

  const profileMap = await getRoomProfileMap(roomId);
  const messages = rows.map(r => rowToMessage(r, profileMap)).reverse();
  await resolveAttachments(messages);
  return messages;
}

export async function sendChatMessage(roomId: string, message: string): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: 'Message cannot be empty.' };
  if (trimmed.length > MAX_MESSAGE) return { ok: false, error: `Message too long (max ${MAX_MESSAGE} chars).` };

  const { data, error } = await supabase
    .from('room_chat_messages')
    .insert({ room_id: roomId, message: trimmed, message_type: 'text' })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('[Chat] send failed:', error);
    return { ok: false, error: error?.message || 'Failed to send message.' };
  }

  return { ok: true, messageId: data.id };
}

/**
 * Send a chat message with a file attachment.
 * Flow: insert message (text + message_type) → upload file (needs message_id) → update message with attachment_id.
 * If file upload fails, the text message remains but attachment_id stays null.
 * If file upload succeeds but metadata fails, the storage file is cleaned up by uploadRoomChatFile.
 */
export async function sendChatMessageWithAttachment(
  roomId: string,
  message: string,
  file: File,
  userId: string,
  messageType: MessageType,
): Promise<{ ok: boolean; error?: string }> {
  // 1. Insert the message with the correct message_type
  const { data: msgData, error: msgErr } = await supabase
    .from('room_chat_messages')
    .insert({
      room_id: roomId,
      message: message.trim() || file.name,
      message_type: messageType,
    })
    .select('id')
    .maybeSingle();

  if (msgErr || !msgData) {
    console.error('[chat] message insert failed:', { msgErr, msgData, messageType, fileName: file.name });
    return { ok: false, error: `Chat message insert failed: ${msgErr?.message || 'No data returned'}` };
  }

  const messageId = msgData.id;

  // 2. Upload the file (this also inserts the uploaded_files metadata)
  const { uploadRoomChatFile } = await import('./files');
  const result = await uploadRoomChatFile(file, userId, roomId, messageId);
  if (!result.ok || !result.file) {
    // Upload failed — delete the orphaned message row so we don't leave
    // a broken message with no attachment in the chat.
    console.error('[chat] upload failed:', result.error, { fileName: file.name, fileType: file.type, fileSize: file.size });
    await supabase.from('room_chat_messages').delete().eq('id', messageId);
    return { ok: false, error: result.error || 'Storage upload failed.' };
  }

  // 3. Update the message with the attachment_id
  const { error: updateErr } = await supabase
    .from('room_chat_messages')
    .update({ attachment_id: result.file.id })
    .eq('id', messageId);

  if (updateErr) {
    // The message exists but attachment link failed. Clean up the file and message.
    console.error('[chat] attachment link failed:', updateErr);
    const { deleteFile } = await import('./files');
    await deleteFile(result.file.id);
    await supabase.from('room_chat_messages').delete().eq('id', messageId);
    return { ok: false, error: `Could not link attachment: ${updateErr.message}` };
  }

  return { ok: true };
}

export async function deleteChatMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  // Fetch the message to check for an attachment before deleting
  const { data: msg } = await supabase
    .from('room_chat_messages')
    .select('attachment_id')
    .eq('id', messageId)
    .maybeSingle();

  const attachmentId = (msg as unknown as { attachment_id: string | null } | null)?.attachment_id;

  // Hard-delete the message so it disappears completely from the chat
  const { error } = await supabase
    .from('room_chat_messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    console.error('[Chat] delete failed:', error);
    return { ok: false, error: error.message };
  }

  // Clean up the attachment file from storage + delete metadata
  if (attachmentId) {
    const { deleteFile } = await import('./files');
    await deleteFile(attachmentId);
  }

  return { ok: true };
}

// ─── Read receipts (persistent unread tracking) ──────────────────────────────

/**
 * Mark all messages in a room as read by updating (or creating) the user's
 * read receipt to the current time. Called when the user opens the Chat tab.
 */
export async function markRoomChatRead(roomId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('room_chat_read_receipts')
    .upsert(
      { room_id: roomId, user_id: undefined as never, last_read_at: now, updated_at: now },
      { onConflict: 'room_id,user_id' },
    );

  // user_id has DEFAULT auth.uid() so we omit it; upsert needs the column though.
  // If the above fails due to the undefined, try a manual insert-or-update.
  if (error) {
    // Try insert first
    const { error: insErr } = await supabase
      .from('room_chat_read_receipts')
      .insert({ room_id: roomId, last_read_at: now, updated_at: now });
    if (insErr) {
      // Row exists — update it
      await supabase
        .from('room_chat_read_receipts')
        .update({ last_read_at: now, updated_at: now })
        .eq('room_id', roomId);
    }
  }
}

/**
 * Get the number of unread chat messages for a user in a room.
 * Counts messages from other users with created_at > last_read_at.
 * If no read receipt exists, all messages from other users are unread.
 */
export async function getUnreadCount(roomId: string, userId: string): Promise<number> {
  // Fetch the user's read receipt
  const { data: receipt } = await supabase
    .from('room_chat_read_receipts')
    .select('last_read_at')
    .eq('room_id', roomId)
    .maybeSingle();

  const lastReadAt = (receipt as unknown as { last_read_at: string } | null)?.last_read_at;

  // Count messages from other users newer than last_read_at (and not deleted)
  let query = supabase
    .from('room_chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .neq('user_id', userId)
    .eq('is_deleted', false);

  if (lastReadAt) {
    query = query.gt('created_at', lastReadAt);
  }

  const { count, error } = await query;

  if (error) {
    console.error('[Chat] unread count failed:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Subscribe to chat message changes and read receipt changes for a room.
 * Calls onUnreadChange whenever messages or receipts change so the caller
 * can re-fetch the unread count.
 */
export function subscribeToChatUnread(
  roomId: string,
  userId: string,
  onUnreadChange: () => void,
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`chat_unread:${roomId}:${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'room_chat_messages',
      filter: `room_id=eq.${roomId}`,
    }, () => { onUnreadChange(); })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'room_chat_read_receipts',
      filter: `room_id=eq.${roomId}`,
    }, () => { onUnreadChange(); })
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

/**
 * Get a fresh signed download URL for a chat attachment.
 * Used when the cached attachment_url has expired (5-min TTL).
 * Does NOT create a duplicate file — just generates a temporary URL.
 */
export async function refreshAttachmentUrl(attachmentId: string): Promise<string | null> {
  const file = await fetchFileById(attachmentId);
  if (!file) return null;
  return getSignedUrl(file.storage_bucket, file.storage_path);
}

/**
 * Get a fresh signed download URL with download=true (forces browser download).
 */
export async function getAttachmentDownloadUrl(attachmentId: string): Promise<string | null> {
  const file = await fetchFileById(attachmentId);
  if (!file) return null;
  return getSignedUrl(file.storage_bucket, file.storage_path, true);
}

export function subscribeToChat(
  roomId: string,
  onNewMessage: () => void
): { unsubscribe: () => void } {
  const channel = supabase
    .channel(`chat:${roomId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'room_chat_messages',
      filter: `room_id=eq.${roomId}`,
    }, () => { onNewMessage(); })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'uploaded_files',
      filter: `room_id=eq.${roomId}`,
    }, () => { onNewMessage(); })
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
