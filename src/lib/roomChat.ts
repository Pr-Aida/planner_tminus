import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
  created_at: string;
  updated_at: string | null;
  is_deleted: boolean;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
}

interface ChatRow {
  id: string;
  room_id: string;
  user_id: string;
  message: string;
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

  return rows.map(r => {
    const p = profileMap.get(r.user_id);
    return {
      id: r.id,
      room_id: r.room_id,
      user_id: r.user_id,
      message: r.is_deleted ? '' : r.message,
      created_at: r.created_at,
      updated_at: r.updated_at,
      is_deleted: r.is_deleted,
      username: p?.username,
      display_name: p?.display_name,
      avatar_url: p?.avatar_url,
    };
  });
}

export async function sendChatMessage(roomId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = message.trim();
  if (!trimmed) return { ok: false, error: 'Message cannot be empty.' };
  if (trimmed.length > MAX_MESSAGE) return { ok: false, error: `Message too long (max ${MAX_MESSAGE} chars).` };

  const { error } = await supabase
    .from('room_chat_messages')
    .insert({ room_id: roomId, message: trimmed });

  if (error) {
    console.error('[Chat] send failed:', error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function deleteChatMessage(messageId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('room_chat_messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    console.error('[Chat] delete failed:', error);
    return { ok: false, error: error.message };
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
    .subscribe();

  return {
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
