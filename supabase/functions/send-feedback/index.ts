import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FEEDBACK_TO = "tminus.planner@gmail.com";
const FEEDBACK_FROM = "T Minus Feedback <feedback@tminus.app>";
const MAX_LEN = 2000;
const MAX_REPLY_LEN = 2000;
const DAILY_LIMIT = 5;

const typeLabel: Record<string, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  question: "Question",
  other: "Other",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(s: string): string {
  return s.slice(0, MAX_LEN * 2).replace(/<[^>]*>/g, "").trim();
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data } = await anon.auth.getUser(auth.replace("Bearer ", ""));
  return data.user;
}

async function isAdmin(userId: string): Promise<boolean> {
  const admin = adminClient();
  const { data } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_admin === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");
  const action = path.split("/").pop() || "";

  try {
    if (req.method === "POST" && (action === "send-feedback" || action === "index" || path.endsWith("/send-feedback"))) {
      return await handleSubmit(req);
    }
    if (req.method === "POST" && action === "reply") return await handleReply(req);
    if (req.method === "GET" && action === "list") return await handleList(req);
    if (req.method === "POST" && action === "delete") return await handleDelete(req);
    if (req.method === "POST" && action === "cleanup") return await handleCleanup(req);
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.log("[send-feedback] unhandled_error=" + (err as Error).message);
    return json({ error: "Internal error." }, 500);
  }
});

// ── Submit feedback ──
async function handleSubmit(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: "Sign in to submit feedback." }, 401);

  const body = await req.json().catch(() => ({}));
  const feedbackType = typeof body.feedback_type === "string" ? body.feedback_type : "other";
  const message = typeof body.message === "string" ? sanitizeText(body.message) : "";
  const contactEmail = (typeof body.optional_contact_email === "string" && body.optional_contact_email
    ? String(body.optional_contact_email).trim().slice(0, 254)
    : null) || (typeof body.contact_email === "string" && body.contact_email
    ? String(body.contact_email).trim().slice(0, 254)
    : null);
  const pageRoute = typeof body.page_route === "string" ? String(body.page_route).slice(0, 200) : null;

  if (!message) return json({ error: "Message cannot be empty." }, 400);
  if (message.length > MAX_LEN) return json({ error: `Message must be ${MAX_LEN} characters or fewer.` }, 400);

  const admin = adminClient();

  // Rate limit: max 5 per user per day.
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", today + "T00:00:00Z");
  if ((count ?? 0) >= DAILY_LIMIT) return json({ error: "Daily feedback limit reached (5/day)." }, 429);

  const { data: inserted, error: insErr } = await admin
    .from("feedback")
    .insert({
      user_id: user.id,
      feedback_type: feedbackType,
      message,
      optional_contact_email: contactEmail,
      page_route: pageRoute,
      status: "new",
    })
    .select("id")
    .single();
  if (insErr) return json({ error: "Could not save feedback." }, 500);

  // Email notification to admin inbox.
  let emailOk = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  console.log("[feedback-email] key_present=" + (!!resendKey) + " from=" + FEEDBACK_FROM + " to=" + FEEDBACK_TO + " attempted=" + (!!resendKey));
  if (resendKey) {
    const senders = [FEEDBACK_FROM, "T Minus Feedback <onboarding@resend.dev>"];
    for (const from of senders) {
      try {
        const emailText = `New ${typeLabel[feedbackType] || feedbackType} from ${user.email || "a user"}:\n\n${message}${contactEmail ? `\n\nContact email: ${contactEmail}` : ""}`;
        const emailHtml = `<p>New <b>${typeLabel[feedbackType] || feedbackType}</b> from ${user.email || "a user"}:</p><blockquote>${message.replace(/</g, "&lt;")}</blockquote>${contactEmail ? `<p>Contact email: ${contactEmail.replace(/</g, "&lt;")}</p>` : ""}`;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: FEEDBACK_TO,
            reply_to: contactEmail || undefined,
            subject: `[T Minus Feedback] ${typeLabel[feedbackType] || feedbackType}`,
            text: emailText,
            html: emailHtml,
          }),
        });
        console.log("[feedback-email] from=" + from + " resend_status=" + r.status + " ok=" + r.ok);
        if (!r.ok) {
          const errText = await r.text().catch(() => "");
          console.log("[feedback-email] resend_error_body=" + errText.slice(0, 500));
        }
        if (r.ok) { emailOk = true; break; }
      } catch (err) {
        console.log("[feedback-email] from=" + from + " fetch_exception=" + (err as Error).message);
      }
    }
  } else {
    console.log("[feedback-email] RESEND_API_KEY is not set in edge function secrets");
  }

  console.log("[feedback-email] result=" + (emailOk ? "sent" : "failed"));
  return json({ ok: true, status: emailOk ? "sent" : "saved_only", id: (inserted as { id: string }).id }, 200);
}

// ── Admin: list all feedback ──
async function handleList(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized." }, 401);
  if (!(await isAdmin(user.id))) return json({ error: "Admin only." }, 403);

  const admin = adminClient();
  const { data, error } = await admin
    .from("feedback")
    .select("id, user_id, feedback_type, message, optional_contact_email, page_route, status, admin_reply, admin_reply_created_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return json({ error: "Could not load feedback." }, 500);
  return json({ items: data || [] }, 200);
}

// ── Admin: reply to feedback + create in-app notification ──
async function handleReply(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized." }, 401);
  if (!(await isAdmin(user.id))) return json({ error: "Admin only." }, 403);

  const body = await req.json().catch(() => ({}));
  const feedbackId = typeof body.feedback_id === "string" ? body.feedback_id : "";
  const reply = typeof body.reply === "string" ? sanitizeText(body.reply) : "";
  const newStatus = typeof body.status === "string" ? body.status : "";
  if (!feedbackId) return json({ error: "Missing feedback id." }, 400);
  if (!reply && !newStatus) return json({ error: "Reply or status update required." }, 400);
  if (reply && reply.length > MAX_REPLY_LEN) return json({ error: `Reply must be ${MAX_REPLY_LEN} characters or fewer.` }, 400);
  const validStatuses = new Set(["new", "reviewed", "resolved"]);
  if (newStatus && !validStatuses.has(newStatus)) return json({ error: "Invalid status." }, 400);

  const admin = adminClient();

  // Fetch the feedback to get user_id for the notification.
  const { data: fb } = await admin
    .from("feedback")
    .select("id, user_id, optional_contact_email, feedback_type")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return json({ error: "Feedback not found." }, 404);

  const update: Record<string, unknown> = {};
  if (reply) {
    update.admin_reply = reply;
    update.admin_reply_created_at = new Date().toISOString();
  }
  if (newStatus) update.status = newStatus;
  else if (reply) update.status = "reviewed";

  const { error } = await admin.from("feedback").update(update).eq("id", feedbackId);
  if (error) return json({ error: "Could not save reply." }, 500);

  // Create in-app notification for the feedback author.
  if (reply && (fb as { user_id: string | null }).user_id) {
    const targetUserId = (fb as { user_id: string | null }).user_id!;
    try {
      await admin.from("feedback_notifications").insert({
        user_id: targetUserId,
        feedback_id: feedbackId,
        type: "feedback_reply",
        message: "You have a new reply to your feedback.",
        read: false,
      });
      console.log("[feedback-reply] notification created for user=" + targetUserId.slice(0, 8) + "...");
    } catch (err) {
      console.log("[feedback-reply] notification insert failed: " + (err as Error).message);
      // non-fatal — reply is saved
    }

    // Optional: email the reply to the user's contact email.
    const contactEmail = (fb as { optional_contact_email: string | null }).optional_contact_email;
    if (contactEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: FEEDBACK_FROM,
              to: contactEmail,
              subject: `[T Minus] Reply to your feedback`,
              text: `Hi,\n\nYou received a reply to your feedback:\n\n"${reply}"\n\n— T Minus`,
              html: `<p>Hi,</p><p>You received a reply to your feedback:</p><blockquote>${reply.replace(/</g, "&lt;")}</blockquote><p>— T Minus</p>`,
            }),
          });
        } catch {
          // email failure is non-fatal
        }
      }
    }
  }

  return json({ ok: true }, 200);
}

// ── Delete feedback (user deletes own, or admin deletes any) ──
async function handleDelete(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized." }, 401);

  const body = await req.json().catch(() => ({}));
  const feedbackId = typeof body.feedback_id === "string" ? body.feedback_id : "";
  if (!feedbackId) return json({ error: "Missing feedback id." }, 400);

  const admin = adminClient();

  // Fetch the feedback to check ownership.
  const { data: fb } = await admin
    .from("feedback")
    .select("id, user_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return json({ error: "Feedback not found." }, 404);

  const isOwner = (fb as { user_id: string }).user_id === user.id;
  const adminAccess = await isAdmin(user.id);
  if (!isOwner && !adminAccess) return json({ error: "Not allowed." }, 403);

  // Delete related feedback notifications first, then the feedback row.
  await admin.from("feedback_notifications").delete().eq("feedback_id", feedbackId);
  await admin.from("feedback").delete().eq("id", feedbackId);

  return json({ ok: true }, 200);
}

// ── Cleanup: delete feedback older than 30 days + related notifications ──
async function handleCleanup(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: "Unauthorized." }, 401);
  if (!(await isAdmin(user.id))) return json({ error: "Admin only." }, 403);

  const admin = adminClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Get IDs of old feedback to delete their notifications.
  const { data: old } = await admin
    .from("feedback")
    .select("id")
    .lt("created_at", cutoff);
  if (old && old.length > 0) {
    const ids = (old as { id: string }[]).map(r => r.id);
    await admin.from("feedback_notifications").delete().in("feedback_id", ids);
  }
  await admin.from("feedback").delete().lt("created_at", cutoff);

  return json({ ok: true, deleted: old?.length || 0 }, 200);
}
