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

export async function fetchChatMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('room_chat_messages')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) {
    console.error('[Chat] fetch failed:', error);
    return [];
  }

  const rows = (data || []) as unknown as ChatRow[];
  if (rows.length === 0) return [];

  // Fetch profiles via SECURITY DEFINER RPC to bypass RLS safely.
  // This returns only safe fields: id, username, display_name, avatar_url.
  const { data: profiles } = await supabase.rpc('get_room_member_profiles', { p_room_id: roomId });

  const profileMap = new Map<string, ProfileRow>();
  ((profiles || []) as unknown as ProfileRow[]).forEach(p => profileMap.set(p.id, p));

  const messages = rows.map(r => {
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
  });

  // Resolve attachments for non-text messages
  const attachmentIds = messages
    .filter(m => m.attachment_id && !m.is_deleted)
    .map(m => m.attachment_id!) as string[];

  if (attachmentIds.length > 0) {
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
          // Get signed URL for the attachment
          const url = await getSignedUrl(file.storage_bucket, file.storage_path);
          m.attachment_url = url;
        }
      }
    }
  }

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
    return { ok: false, error: msgErr?.message || 'Failed to send message.' };
  }

  const messageId = msgData.id;

  // 2. Upload the file (this also inserts the uploaded_files metadata)
  const { uploadRoomChatFile } = await import('./files');
  const result = await uploadRoomChatFile(file, userId, roomId, messageId);
  if (!result.ok || !result.file) {
    return { ok: false, error: result.error || 'File upload failed.' };
  }

  // 3. Update the message with the attachment_id
  const { error: updateErr } = await supabase
    .from('room_chat_messages')
    .update({ attachment_id: result.file.id })
    .eq('id', messageId);

  if (updateErr) {
    // The message exists but attachment link failed. Clean up the file.
    const { deleteFile } = await import('./files');
    await deleteFile(result.file.id);
    return { ok: false, error: 'Could not link attachment to message.' };
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

  // Soft-delete the message (so other members see "Message deleted")
  const { error } = await supabase
    .from('room_chat_messages')
    .update({ is_deleted: true, message: '', attachment_id: null })
    .eq('id', messageId);

  if (error) {
    console.error('[Chat] delete failed:', error);
    return { ok: false, error: error.message };
  }

  // Clean up the attachment file from storage + soft-delete metadata
  if (attachmentId) {
    const { deleteFile } = await import('./files');
    await deleteFile(attachmentId);
  }

  return { ok: true };
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
