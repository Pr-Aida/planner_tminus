import { supabase } from './supabase';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeChatResponse {
  content: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  stop_reason: string | null;
}

export async function sendClaudeChat(
  messages: ChatMessage[],
  options?: { system?: string; maxTokens?: number },
): Promise<ClaudeChatResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY as string}`,
  };
  if (token) headers['x-user-token'] = token;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claude-chat`;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      system: options?.system,
      max_tokens: options?.maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(typeof err.error === 'string' ? err.error : 'Request failed');
  }

  const data = await res.json() as ClaudeChatResponse;
  if (typeof data.content !== 'string') {
    throw new Error('Unexpected response from AI service.');
  }
  return data;
}
