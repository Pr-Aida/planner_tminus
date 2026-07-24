import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 1024;
const MAX_MESSAGE_CHARS = 8000;
const MAX_MESSAGES = 40;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed. Use POST." }, 405);
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.error("[claude-chat] ANTHROPIC_API_KEY secret is not set.");
      return json({ error: "AI service is not configured. Add ANTHROPIC_API_KEY to edge function secrets." }, 503);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawMessages = body.messages;
    const systemPrompt = typeof body.system === "string" ? body.system.slice(0, 4000) : "";
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL;
    const maxTokens = typeof body.max_tokens === "number" && body.max_tokens > 0 && body.max_tokens <= 4096
      ? body.max_tokens
      : DEFAULT_MAX_TOKENS;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return json({ error: "messages must be a non-empty array." }, 400);
    }
    if (rawMessages.length > MAX_MESSAGES) {
      return json({ error: `Too many messages (max ${MAX_MESSAGES}).` }, 400);
    }

    const messages: ChatMessage[] = [];
    for (const m of rawMessages) {
      if (typeof m !== "object" || m === null) continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      const content = typeof m.content === "string" ? m.content.slice(0, MAX_MESSAGE_CHARS) : "";
      if (!content) continue;
      messages.push({ role, content });
    }
    if (messages.length === 0) {
      return json({ error: "No valid messages provided." }, 400);
    }

    const anthropicBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
    };
    if (systemPrompt) anthropicBody.system = systemPrompt;

    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "");
      console.error(`[claude-chat] Anthropic error ${anthropicRes.status}: ${errText.slice(0, 500)}`);
      const safeStatus = anthropicRes.status >= 400 && anthropicRes.status <= 499 ? 400 : 502;
      return json({ error: "Claude API request failed.", status: anthropicRes.status }, safeStatus);
    }

    const data = await anthropicRes.json();
    const replyText = Array.isArray(data.content) && data.content.length > 0
      ? data.content.map((b: { text?: string }) => b.text || "").join("")
      : "";

    return json({
      content: replyText,
      model: data.model || model,
      usage: data.usage || null,
      stop_reason: data.stop_reason || null,
    }, 200);
  } catch (err) {
    console.error("[claude-chat] unhandled_error=" + (err as Error).message);
    return json({ error: "Internal error." }, 500);
  }
});
