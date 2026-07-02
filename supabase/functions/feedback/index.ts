import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
const resendApiKey = Deno.env.get("RESEND_API_KEY") as string;
const adminEmail = "tminus.planner@gmail.com";

const MAX_MESSAGE = 2000;
const MAX_SUBJECT = 120;
const VALID_TYPES = ["suggestion", "bug_report", "feature_request", "general"];
const VALID_STATUSES = ["new", "reviewed", "planned", "fixed", "archived"];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + "tminus-salt-v1");
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
  ipHash: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
  if (userId) {
    const { count } = await admin
      .from("feedback_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= 5) return { allowed: false, reason: "Rate limit: max 5 feedback messages per hour." };
  } else if (ipHash) {
    const { count } = await admin
      .from("feedback_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= 2) return { allowed: false, reason: "Rate limit: max 2 guest feedback messages per hour." };
  }
  return { allowed: true };
}

// ─── Submit feedback ──────────────────────────────────────────────────────────
async function submitFeedback(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const feedbackType = typeof body.feedback_type === "string" ? body.feedback_type.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const contactEmail = typeof body.contact_email === "string" ? body.contact_email.trim() : "";

  if (!VALID_TYPES.includes(feedbackType)) return json({ error: "Invalid feedback type." }, 400);
  if (!subject || subject.length > MAX_SUBJECT) return json({ error: "Subject is required (max 120 chars)." }, 400);
  if (!message || message.length > MAX_MESSAGE) return json({ error: "Message is required (max 2000 chars)." }, 400);
  if (contactEmail && !isValidEmail(contactEmail)) return json({ error: "Invalid contact email." }, 400);

  let userId: string | null = null;
  let username: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    const jwt = authHeader.replace("Bearer ", "");
    const anon = createClient(supabaseUrl, anonKey);
    const { data: userData } = await anon.auth.getUser(jwt);
    if (userData.user) {
      userId = userData.user.id;
      const { data: profile } = await anon.from("profiles").select("username").eq("id", userId).maybeSingle();
      username = profile?.username || null;
    }
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ipHash = userId ? null : await hashIP(clientIp);

  const rateCheck = await checkRateLimit(admin, userId, ipHash);
  if (!rateCheck.allowed) return json({ error: rateCheck.reason }, 429);

  console.log("[feedback] Inserting feedback from:", username || "guest", "type:", feedbackType);

  const { data: feedback, error: insertErr } = await admin
    .from("feedback_messages")
    .insert({
      user_id: userId,
      username,
      contact_email: contactEmail || null,
      feedback_type: feedbackType,
      subject,
      message,
      status: "new",
    })
    .select()
    .single();

  if (insertErr || !feedback) {
    console.error("[feedback] Insert failed:", insertErr?.message || "no data returned");
    return json({ error: "Could not save feedback. Please try again." }, 500);
  }

  console.log("[feedback] Saved successfully, id:", feedback.id);

  await admin.from("feedback_rate_limits").insert({ user_id: userId, ip_hash: ipHash });

  // Send email notification
  let emailSent = false;
  let emailError: string | null = null;
  try {
    console.log("[feedback] Attempting to send email notification...");
    emailSent = await sendFeedbackEmail(feedback);
    if (!emailSent) {
      emailError = "RESEND_API_KEY is missing or invalid. Email notification cannot be sent.";
      console.warn("[feedback] Email not sent:", emailError);
    } else {
      console.log("[feedback] Email sent successfully to:", adminEmail);
    }
  } catch (err) {
    emailError = (err as Error).message;
    console.error("[feedback] Email send error:", emailError);
  }

  // Record email status in the database
  await admin.from("feedback_messages")
    .update({ email_sent: emailSent, email_error: emailError })
    .eq("id", feedback.id);

  return json({
    ok: true,
    saved: true,
    email_sent: emailSent,
    email_error: emailError,
    feedback_id: feedback.id,
  }, 201);
}

// ─── Send email notification via Resend ───────────────────────────────────────
async function sendFeedbackEmail(feedback: Record<string, unknown>): Promise<boolean> {
  if (!resendApiKey) {
    console.log("[feedback] RESEND_API_KEY not configured — skipping email notification");
    return false;
  }

  const typeLabels: Record<string, string> = {
    suggestion: "Suggestion",
    bug_report: "Bug Report",
    feature_request: "Feature Request",
    general: "General Feedback",
  };

  const typeLabel = typeLabels[feedback.feedback_type as string] || "Feedback";
  const submittedAt = new Date(feedback.created_at as string).toLocaleString("en-US", { timeZone: "UTC" });
  const username = feedback.username ? `@${feedback.username}` : "Guest (not logged in)";
  const contactEmail = feedback.contact_email ? String(feedback.contact_email) : "Not provided";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #7B1C3E; margin-bottom: 8px;">New T Minus Feedback: ${typeLabel}</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 4px 0; color: #6B6B6B; width: 120px;">Type:</td><td style="padding: 4px 0; color: #1B2A4A; font-weight: 600;">${typeLabel}</td></tr>
        <tr><td style="padding: 4px 0; color: #6B6B6B;">From:</td><td style="padding: 4px 0; color: #1B2A4A;">${username}</td></tr>
        <tr><td style="padding: 4px 0; color: #6B6B6B;">Contact email:</td><td style="padding: 4px 0; color: #1B2A4A;">${contactEmail}</td></tr>
        <tr><td style="padding: 4px 0; color: #6B6B6B;">Submitted:</td><td style="padding: 4px 0; color: #1B2A4A;">${submittedAt} UTC</td></tr>
      </table>
      <h3 style="color: #1B2A4A; margin-top: 20px; margin-bottom: 4px;">Subject</h3>
      <p style="color: #1B2A4A; font-size: 15px; margin: 0 0 16px;">${escapeHtml(feedback.subject as string)}</p>
      <h3 style="color: #1B2A4A; margin: 0 0 4px;">Message</h3>
      <div style="background: #F8F9FC; border-radius: 8px; padding: 16px; white-space: pre-wrap; color: #1B2A4A; font-size: 14px; line-height: 1.6;">${escapeHtml(feedback.message as string)}</div>
      <p style="margin-top: 24px; color: #9CA3AF; font-size: 12px;">
        You can view and reply to this feedback in the admin Feedback Inbox inside the T Minus website.
      </p>
    </div>
  `;

  const textBody = `New T Minus Feedback: ${typeLabel}\n\nType: ${typeLabel}\nFrom: ${username}\nContact email: ${contactEmail}\nSubmitted: ${submittedAt} UTC\n\nSubject: ${feedback.subject}\n\nMessage:\n${feedback.message}\n\nYou can view and reply to this feedback in the admin Feedback Inbox inside the T Minus website.`;

  console.log("[feedback] Calling Resend API...");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "T Minus Feedback <onboarding@resend.dev>",
      to: adminEmail,
      subject: `New T Minus Feedback: ${typeLabel} - ${feedback.subject}`,
      html,
      text: textBody,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown");
    console.error("[feedback] Resend API error:", res.status, errText);
    return false;
  }

  console.log("[feedback] Resend API returned success");
  return true;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Admin: reply to feedback ────────────────────────────────────────────────
async function replyToFeedback(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized." }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const anon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
  if (uErr || !userData.user) return json({ error: "Unauthorized." }, 401);
  const adminId = userData.user.id;

  const { data: adminProfile } = await anon.from("profiles").select("is_admin").eq("id", adminId).maybeSingle();
  if (!adminProfile?.is_admin) return json({ error: "Forbidden. Admin only." }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const feedbackId = typeof body.feedback_id === "string" ? body.feedback_id : "";
  const replyMessage = typeof body.reply_message === "string" ? body.reply_message.trim() : "";

  if (!feedbackId) return json({ error: "Feedback ID is required." }, 400);
  if (!replyMessage || replyMessage.length > 2000) return json({ error: "Reply message is required (max 2000 chars)." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: feedback, error: fbErr } = await admin
    .from("feedback_messages")
    .select("user_id, username, subject")
    .eq("id", feedbackId)
    .maybeSingle();

  if (fbErr || !feedback) return json({ error: "Feedback not found." }, 404);

  const { data: reply, error: replyErr } = await admin
    .from("feedback_replies")
    .insert({
      feedback_id: feedbackId,
      admin_user_id: adminId,
      recipient_user_id: feedback.user_id || null,
      reply_message: replyMessage,
    })
    .select()
    .single();

  if (replyErr || !reply) return json({ error: "Could not save reply." }, 500);

  if (feedback.user_id) {
    await admin.from("feedback_notifications").insert({
      user_id: feedback.user_id,
      feedback_id: feedbackId,
      reply_id: reply.id,
      type: "feedback_reply",
      read: false,
    });
  }

  await admin.from("feedback_messages")
    .update({ status: "reviewed", updated_at: new Date().toISOString() })
    .eq("id", feedbackId);

  return json({ ok: true, reply_id: reply.id }, 201);
}

// ─── Admin: update feedback status ───────────────────────────────────────────
async function updateStatus(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized." }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const anon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
  if (uErr || !userData.user) return json({ error: "Unauthorized." }, 401);

  const { data: adminProfile } = await anon.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
  if (!adminProfile?.is_admin) return json({ error: "Forbidden. Admin only." }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const feedbackId = typeof body.feedback_id === "string" ? body.feedback_id : "";
  const newStatus = typeof body.status === "string" ? body.status.trim() : "";

  if (!feedbackId) return json({ error: "Feedback ID is required." }, 400);
  if (!VALID_STATUSES.includes(newStatus)) return json({ error: "Invalid status." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from("feedback_messages")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", feedbackId);

  if (error) return json({ error: "Could not update status." }, 500);

  return json({ ok: true }, 200);
}

// ─── Admin: retry email for a feedback message ────────────────────────────────
async function retryEmail(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized." }, 401);
  const jwt = authHeader.replace("Bearer ", "");

  const anon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: uErr } = await anon.auth.getUser(jwt);
  if (uErr || !userData.user) return json({ error: "Unauthorized." }, 401);

  const { data: adminProfile } = await anon.from("profiles").select("is_admin").eq("id", userData.user.id).maybeSingle();
  if (!adminProfile?.is_admin) return json({ error: "Forbidden. Admin only." }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const feedbackId = typeof body.feedback_id === "string" ? body.feedback_id : "";
  if (!feedbackId) return json({ error: "Feedback ID is required." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: feedback, error: fbErr } = await admin
    .from("feedback_messages")
    .select("*")
    .eq("id", feedbackId)
    .maybeSingle();

  if (fbErr || !feedback) return json({ error: "Feedback not found." }, 404);

  let emailSent = false;
  let emailError: string | null = null;
  try {
    emailSent = await sendFeedbackEmail(feedback);
    if (!emailSent) {
      emailError = "RESEND_API_KEY is missing or invalid. Email notification cannot be sent.";
    }
  } catch (err) {
    emailError = (err as Error).message;
  }

  await admin.from("feedback_messages")
    .update({ email_sent: emailSent, email_error: emailError })
    .eq("id", feedbackId);

  return json({ ok: true, email_sent: emailSent, email_error: emailError }, 200);
}

// ─── Router ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");

  try {
    if (path.endsWith("/submit") && req.method === "POST") {
      return await submitFeedback(req);
    }
    if (path.endsWith("/reply") && req.method === "POST") {
      return await replyToFeedback(req);
    }
    if (path.endsWith("/status") && req.method === "POST") {
      return await updateStatus(req);
    }
    if (path.endsWith("/retry-email") && req.method === "POST") {
      return await retryEmail(req);
    }
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error("[feedback] Unhandled error:", (err as Error).message);
    return json({ error: (err as Error).message || "Server error." }, 500);
  }
});
