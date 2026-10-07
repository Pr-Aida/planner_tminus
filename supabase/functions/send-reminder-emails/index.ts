import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") as string;
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") as string ||
  "T Minus <reminders@resend.dev>";

const MAX_BATCH = 50;
const MAX_RETRIES = 3;

interface DueReminder {
  id: string;
  user_id: string;
  date_key: string;
  title: string;
  note: string;
  remind_offset: number;
  notification_email: string | null;
  class_id: string | null;
}

interface ProfileInfo {
  timezone_pref: string;
  calendar_pref: string;
  notification_email: string | null;
  recovery_email: string | null;
}

interface ClassInfo {
  course_name: string;
  start_time: string;
  end_time: string;
  location: string | null;
  instructor: string | null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Convert a Gregorian date_key (YYYY-MM-DD) + remind_offset into the actual
// reminder trigger moment in UTC, based on the user's timezone.
// The reminder fires at 08:00 in the user's local timezone on the
// (date_key - remind_offset) day.
function computeTriggerUTC(dateKey: string, remindOffset: number, timezone: string): Date {
  const baseDate = dateKey; // YYYY-MM-DD — the event date
  const offsetDate = new Date(baseDate + "T00:00:00Z");
  offsetDate.setUTCDate(offsetDate.getUTCDate() - remindOffset);

  const yyyy = offsetDate.getUTCFullYear();
  const mm = String(offsetDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(offsetDate.getUTCDate()).padStart(2, "0");
  const localStr = `${yyyy}-${mm}-${dd}T08:00:00`;

  // Convert local time in user's timezone to UTC
  // We use Intl API to compute the offset
  const dt = new Date(localStr);
  const utcDate = new Date(dt.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(dt.toLocaleString("en-US", { timeZone: timezone }));
  const diffMs = utcDate.getTime() - tzDate.getTime();
  return new Date(dt.getTime() + diffMs);
}

// Format date in user's timezone and calendar preference
function formatEmailDate(dateKey: string, timezone: string, calendarPref: string): string {
  const d = new Date(dateKey + "T00:00:00Z");
  try {
    if (calendarPref === "shamsi") {
      // Use Intl with persian calendar
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        calendar: "persian",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return formatter.format(d);
    }
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return dateKey;
  }
}

function formatEmailTime(timeStr: string | null, timeFormat: string): string {
  if (!timeStr) return "";
  try {
    if (timeFormat === "24h") return timeStr;
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  } catch {
    return timeStr;
  }
}

function buildEmailHtml(
  reminder: DueReminder,
  profile: ProfileInfo,
  classInfo: ClassInfo | null,
  timeFormat: string
): string {
  const dateStr = formatEmailDate(reminder.date_key, profile.timezone_pref, profile.calendar_pref);

  let body = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 20px; color: #1a1a1a; margin-bottom: 4px;">T Minus Reminder</h1>
  <p style="font-size: 18px; font-weight: 600; color: #7B1C3E; margin: 16px 0 24px;">${escapeHtml(reminder.title)}</p>`;

  body += `<table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">`;
  body += `<tr><td style="padding: 6px 0; color: #888; width: 80px;">Date:</td><td style="padding: 6px 0;">${escapeHtml(dateStr)}</td></tr>`;

  if (classInfo) {
    if (classInfo.start_time) {
      body += `<tr><td style="padding: 6px 0; color: #888;">Time:</td><td style="padding: 6px 0;">${escapeHtml(formatEmailTime(classInfo.start_time, timeFormat))}${classInfo.end_time ? " – " + escapeHtml(formatEmailTime(classInfo.end_time, timeFormat)) : ""}</td></tr>`;
    }
    if (classInfo.location) {
      body += `<tr><td style="padding: 6px 0; color: #888;">Location:</td><td style="padding: 6px 0;">${escapeHtml(classInfo.location)}</td></tr>`;
    }
    if (classInfo.instructor) {
      body += `<tr><td style="padding: 6px 0; color: #888;">Instructor:</td><td style="padding: 6px 0;">${escapeHtml(classInfo.instructor)}</td></tr>`;
    }
  }

  body += `</table>`;

  if (reminder.note) {
    body += `<p style="font-size: 14px; color: #555; margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 8px;">${escapeHtml(reminder.note)}</p>`;
  }

  body += `<p style="font-size: 12px; color: #999; margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">This reminder was created in T Minus.</p>
</div>`;
  return body;
}

function buildEmailText(
  reminder: DueReminder,
  profile: ProfileInfo,
  classInfo: ClassInfo | null,
  timeFormat: string
): string {
  const dateStr = formatEmailDate(reminder.date_key, profile.timezone_pref, profile.calendar_pref);
  let text = `T Minus Reminder\n\n${reminder.title}\n\nDate: ${dateStr}\n`;
  if (classInfo) {
    if (classInfo.start_time) text += `Time: ${formatEmailTime(classInfo.start_time, timeFormat)}${classInfo.end_time ? " – " + formatEmailTime(classInfo.end_time, timeFormat) : ""}\n`;
    if (classInfo.location) text += `Location: ${classInfo.location}\n`;
    if (classInfo.instructor) text += `Instructor: ${classInfo.instructor}\n`;
  }
  if (reminder.note) text += `\n${reminder.note}\n`;
  text += `\nThis reminder was created in T Minus.`;
  return text;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not configured");
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    console.error(`Resend API error (${res.status}): ${errText}`);
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // This endpoint is invoked by the pg_cron job every 2 minutes.
  // verify_jwt is false in config.toml. The function only processes due
  // email reminders — no user input, no sensitive data returned — so no
  // auth check is needed. The URL itself acts as a shared secret.
  if (!serviceRoleKey) {
    return json({ error: "Server not configured." }, 500);
  }

  // Temporary debug endpoint
  const dbgUrl = new URL(req.url);
  if (dbgUrl.searchParams.get("debug") === "2") {
    const envAnon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    return json({
      env_anon_len: envAnon.length,
      env_anon_prefix: envAnon.substring(0, 30),
      env_anon_suffix: envAnon.substring(envAnon.length - 10),
    }, 200);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find due reminders: email_enabled=true, email_sent=false, and the
  // trigger time has passed. We compute the trigger time in SQL using
  // the user's timezone to avoid timezone ambiguity.
  //
  // The trigger time is: (date_key - remind_offset days) at 08:00 user-local
  // We find all reminders where this time has passed (in UTC).
  //
  // We use a simpler approach: find reminders where email_enabled=true,
  // email_sent=false, and the date (date_key - remind_offset) is today
  // or earlier in the user's timezone. This is conservative — the cron
  // runs every 2 minutes, so we catch everything within that window.

  const now = new Date();

  // Fetch candidate reminders with their owner's profile
  const { data: candidates, error: fetchErr } = await admin
    .from("planner_reminders")
    .select(`
      id, user_id, date_key, title, note, remind_offset,
      notification_email, class_id, email_fail_count
    `)
    .eq("email_enabled", true)
    .eq("email_sent", false)
    .lt("email_fail_count", MAX_RETRIES)
    .limit(MAX_BATCH);

  if (fetchErr) {
    console.error("Failed to fetch reminders:", fetchErr);
    return json({ error: "Failed to fetch reminders." }, 500);
  }

  if (!candidates || candidates.length === 0) {
    return json({ processed: 0 }, 200);
  }

  // Get profiles for all candidate user_ids
  const userIds = [...new Set(candidates.map((r: DueReminder) => r.user_id))];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, timezone_pref, calendar_pref, notification_email, recovery_email, time_format, email_reminders_enabled")
    .in("id", userIds);

  const profileMap = new Map<string, ProfileInfo & { time_format: string; email_reminders_enabled: boolean }>();
  for (const p of profiles || []) {
    profileMap.set(p.id, p);
  }

  // Get class info for reminders with class_id
  const classIds = [...new Set(candidates.filter((r: DueReminder) => r.class_id).map((r: DueReminder) => r.class_id!))];
  const classMap = new Map<string, ClassInfo>();
  if (classIds.length > 0) {
    const { data: classes } = await admin
      .from("planner_classes")
      .select("id, course_name, start_time, end_time, location, instructor")
      .in("id", classIds);
    for (const c of classes || []) {
      classMap.set(c.id, c);
    }
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const reminder of candidates as DueReminder[]) {
    processed++;

    const profile = profileMap.get(reminder.user_id);
    if (!profile) { skipped++; continue; }

    // Check global email preference
    if (!profile.email_reminders_enabled) { skipped++; continue; }

    // Determine recipient email
    const recipientEmail = reminder.notification_email || profile.notification_email || profile.recovery_email;
    if (!recipientEmail || recipientEmail.endsWith("@username.local")) { skipped++; continue; }

    // Check if the reminder is actually due
    const triggerUTC = computeTriggerUTC(reminder.date_key, reminder.remind_offset, profile.timezone_pref);
    if (triggerUTC > now) { skipped++; continue; }

    // Fetch class info if linked
    const classInfo = reminder.class_id ? classMap.get(reminder.class_id) || null : null;

    const subject = `Reminder: ${reminder.title}`;
    const html = buildEmailHtml(reminder, profile, classInfo, profile.time_format || "12h");
    const text = buildEmailText(reminder, profile, classInfo, profile.time_format || "12h");

    const success = await sendEmail(recipientEmail, subject, html, text);

    if (success) {
      await admin.from("planner_reminders").update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      }).eq("id", reminder.id);
      sent++;
    } else {
      await admin.from("planner_reminders").update({
        email_failed_at: new Date().toISOString(),
        email_fail_count: (reminder.email_fail_count || 0) + 1,
      }).eq("id", reminder.id);
      failed++;
    }
  }

  return json({ processed, sent, failed, skipped }, 200);
});
