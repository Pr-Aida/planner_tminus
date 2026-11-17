import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_TIME = "08:00";
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const MAX_FAIL = 5;
const FROM = "T Minus Reminders <reminders@tminus.app>";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

interface ScheduleRow {
  id: string;
  reminder_id: string;
  user_id: string;
  notify_date: string; // YYYY-MM-DD
  notify_time: string; // HH:mm
  email_enabled: boolean;
  email_sent: boolean;
  email_fail_count: number;
  email_processing_at: string | null;
  reminder_title: string;
  reminder_note: string;
  reminder_status: string;
  reminder_date_key: string;
  profile_timezone: string;
  profile_email_reminders_enabled: boolean;
  profile_notification_email: string | null;
  auth_email: string | null;
}

/**
 * Compute the UTC instant at which this schedule should fire, using the user's
 * IANA timezone. Returns null if the time is invalid or already in the past.
 */
function computeDeliveryUTC(s: ScheduleRow, now: Date): Date | null {
  const time = s.notify_time || DEFAULT_TIME;
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;

  const tz = s.profile_timezone || "UTC";
  // Build a wall-clock string in the user's timezone, then convert to UTC.
  const wallClock = `${s.notify_date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  try {
    // Intl.DateTimeFormat is the reliable DST-aware way to convert wall time → UTC in Deno.
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    // We need the offset at this wall time; compute by formatting the same instant.
    // First interpret wallClock as if it were UTC, then apply the tz offset.
    const asUTC = new Date(wallClock + "Z");
    const parts = dtf.formatToParts(asUTC);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const tzWall = `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;
    // If the formatted wall time differs from our input, there's an offset.
    // The offset in ms = asUTC - (tzWall interpreted as UTC).
    const tzAsUTC = new Date(tzWall + "Z").getTime();
    const offsetMs = asUTC.getTime() - tzAsUTC.getTime();
    const deliveryUTC = new Date(asUTC.getTime() - offsetMs);
    if (deliveryUTC.getTime() <= now.getTime()) return null; // past → skip
    return deliveryUTC;
  } catch {
    return null;
  }
}

async function sendEmail(to: string, title: string, dateLabel: string, note: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.log("[send-reminder-emails] RESEND_API_KEY not set");
    return false;
  }
  const subject = `Reminder: ${title} — ${dateLabel}`;
  const text = `This is your reminder for "${title}" on ${dateLabel}.\n\n${note ? note + "\n\n" : ""}— T Minus Planner`;
  const html = `<p>This is your reminder for <b>${title.replace(/</g, "&lt;")}</b> on ${dateLabel}.</p>${note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""}<p style="color:#888;font-size:12px">— T Minus Planner</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, text, html }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.log(`[send-reminder-emails] resend status=${r.status} body=${body.slice(0, 300)}`);
    }
    return r.ok;
  } catch (err) {
    console.log(`[send-reminder-emails] resend exception: ${(err as Error).message}`);
    return false;
  }
}

function dateLabel(dateKey: string): string {
  try {
    const d = new Date(dateKey + "T00:00:00Z");
    return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  } catch {
    return dateKey;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = adminClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const staleThreshold = new Date(now.getTime() - LOCK_TIMEOUT_MS).toISOString();

    // Select schedules that are due now, email-enabled, not yet sent, and whose
    // parent reminder is still pending and profile has email notifications on.
    const { data, error } = await supabase
      .from("planner_reminder_schedules")
      .select(`
        id, reminder_id, user_id, notify_date, notify_time,
        email_enabled, email_sent, email_fail_count, email_processing_at,
        reminder:planner_reminders ( title, note, status, date_key ),
        profile:profiles ( timezone_pref, email_reminders_enabled, notification_email )
      `)
      .eq("email_enabled", true)
      .eq("email_sent", false)
      .lte("email_fail_count", MAX_FAIL)
      .or(`email_processing_at.is.null,email_processing_at.lt.${staleThreshold}`)
      .order("notify_date", { ascending: true })
      .limit(50) as unknown as { data: ScheduleRow[] | null; error: any };

    if (error) {
      console.log("[send-reminder-emails] query error: " + error.message);
      return json({ ok: false, error: error.message }, 500);
    }

    if (!data || data.length === 0) {
      return json({ ok: true, sent: 0, checked: 0 });
    }

    // Also need the auth email for each user — fetch separately since we can't
    // easily join auth.users. Batch the user_ids.
    const userIds = [...new Set(data.map((s) => s.user_id))];
    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const emailMap: Record<string, string> = {};
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        if (u.email) emailMap[u.id] = u.email;
      }
    }

    let sentCount = 0;
    let checkedCount = 0;

    for (const row of data) {
      // Flatten the joined structure
      const s: ScheduleRow = {
        id: row.id,
        reminder_id: row.reminder_id,
        user_id: row.user_id,
        notify_date: row.notify_date,
        notify_time: row.notify_time,
        email_enabled: row.email_enabled,
        email_sent: row.email_sent,
        email_fail_count: row.email_fail_count,
        email_processing_at: row.email_processing_at,
        reminder_title: (row.reminder as any)?.title ?? "",
        reminder_note: (row.reminder as any)?.note ?? "",
        reminder_status: (row.reminder as any)?.status ?? "pending",
        reminder_date_key: (row.reminder as any)?.date_key ?? row.notify_date,
        profile_timezone: (row.profile as any)?.timezone_pref ?? "UTC",
        profile_email_reminders_enabled: (row.profile as any)?.email_reminders_enabled ?? false,
        profile_notification_email: (row.profile as any)?.notification_email ?? null,
        auth_email: emailMap[row.user_id] ?? null,
      };

      checkedCount++;

      // Skip if parent reminder is not pending
      if (s.reminder_status !== "pending") continue;
      // Skip if global email preference is off
      if (!s.profile_email_reminders_enabled) continue;

      const deliveryUTC = computeDeliveryUTC(s, now);
      if (!deliveryUTC) continue; // past or invalid

      // Determine recipient
      const recipient = s.profile_notification_email || s.auth_email;
      if (!recipient) {
        console.log(`[send-reminder-emails] no email for user ${s.user_id.slice(0, 8)}`);
        continue;
      }

      // Try to acquire a processing lock (optimistic, atomic)
      const { data: locked, error: lockErr } = await supabase
        .from("planner_reminder_schedules")
        .update({ email_processing_at: nowIso })
        .eq("id", s.id)
        .eq("email_sent", false)
        .or(`email_processing_at.is.null,email_processing_at.lt.${staleThreshold}`)
        .select("id")
        .maybeSingle();

      if (lockErr || !locked) continue; // someone else locked it

      // Send the email
      const ok = await sendEmail(recipient, s.reminder_title, dateLabel(s.reminder_date_key), s.reminder_note);

      if (ok) {
        await supabase
          .from("planner_reminder_schedules")
          .update({ email_sent: true, email_sent_at: new Date().toISOString(), email_processing_at: null })
          .eq("id", s.id);
        sentCount++;
      } else {
        await supabase
          .from("planner_reminder_schedules")
          .update({
            email_failed_at: new Date().toISOString(),
            email_fail_count: s.email_fail_count + 1,
            email_processing_at: null,
          })
          .eq("id", s.id);
      }
    }

    return json({ ok: true, sent: sentCount, checked: checkedCount });
  } catch (err) {
    console.log("[send-reminder-emails] unhandled: " + (err as Error).message);
    return json({ error: "Internal error." }, 500);
  }
});
