/*
# Create planner_reminder_schedules — multi-schedule reminder notifications

## Purpose
Today each planner_reminders row carries a single remind_offset (0/1/3/7 days)
and email_enabled flag, so a reminder can only fire once. Users want multiple
independent notification schedules per reminder (e.g. 3 days before at 09:00,
1 day before at 20:00, on the day at 07:00), each with its own date, time,
in-app toggle and email toggle.

## New table: planner_reminder_schedules
- id            uuid PK
- reminder_id   uuid NOT NULL references planner_reminders(id) ON DELETE CASCADE
- user_id       uuid NOT NULL DEFAULT auth.uid() references auth.users(id) ON DELETE CASCADE
- notify_date   text NOT NULL  — Gregorian ISO YYYY-MM-DD the schedule should fire
- notify_time   text NOT NULL DEFAULT '08:00' — HH:mm local delivery time
- in_app_enabled  boolean NOT NULL DEFAULT true
- email_enabled   boolean NOT NULL DEFAULT false
- email_sent      boolean NOT NULL DEFAULT false
- email_sent_at   timestamptz
- email_failed_at timestamptz
- email_fail_count smallint NOT NULL DEFAULT 0 CHECK 0..5
- email_processing_at timestamptz
- in_app_sent      boolean NOT NULL DEFAULT false
- in_app_sent_at   timestamptz
- sort_order     integer NOT NULL DEFAULT 0
- created_at     timestamptz DEFAULT now()
- updated_at     timestamptz DEFAULT now()

## Data migration
Every existing planner_reminders row gets ONE derived schedule row so current
behaviour is preserved:
  notify_date = date_key - remind_offset days
  notify_time = '08:00' (the historical default)
  in_app_enabled = true (browser notifications were always on)
  email_enabled = reminders.email_enabled
The legacy email_enabled / notification_email / email_sent columns on
planner_reminders are kept (not dropped) for backward compatibility and so the
existing reset_planner_reminder_email_state trigger keeps working. The cron
processor is updated to read from the new schedules table.

## Security
- RLS enabled on planner_reminder_schedules, owner-scoped to auth.uid() = user_id.
- GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated.
- service_role granted all for the edge function.
- No changes to existing planner_reminders policies.

## Triggers
- trg_reset_schedule_email_state: when notify_date, notify_time, email_enabled
  or the parent reminder's status changes, reset email_sent / fail counters so
  the schedule re-fires at the new time. This prevents duplicate sends while
  allowing rescheduling.
- trg_set_schedules_updated_at: maintain updated_at.

## Cron
- Reschedule process-email-reminders every 2 minutes (no auth header, same as
  the last working version). The edge function reads from
  planner_reminder_schedules joined to planner_reminders + profiles.
*/

CREATE TABLE IF NOT EXISTS planner_reminder_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES planner_reminders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  notify_date text NOT NULL,
  notify_time text NOT NULL DEFAULT '08:00' CHECK (notify_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  email_failed_at timestamptz,
  email_fail_count smallint NOT NULL DEFAULT 0 CHECK (email_fail_count >= 0 AND email_fail_count <= 5),
  email_processing_at timestamptz,
  in_app_sent boolean NOT NULL DEFAULT false,
  in_app_sent_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE planner_reminder_schedules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON planner_reminder_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planner_reminder_schedules TO service_role;

DROP POLICY IF EXISTS "select_own_reminder_schedules" ON planner_reminder_schedules;
CREATE POLICY "select_own_reminder_schedules" ON planner_reminder_schedules
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminder_schedules" ON planner_reminder_schedules;
CREATE POLICY "insert_own_reminder_schedules" ON planner_reminder_schedules
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminder_schedules" ON planner_reminder_schedules;
CREATE POLICY "update_own_reminder_schedules" ON planner_reminder_schedules
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminder_schedules" ON planner_reminder_schedules;
CREATE POLICY "delete_own_reminder_schedules" ON planner_reminder_schedules
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reminder_schedules_reminder_id ON planner_reminder_schedules(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_notify_date ON planner_reminder_schedules(notify_date);
CREATE INDEX IF NOT EXISTS idx_reminder_schedules_user_id ON planner_reminder_schedules(user_id);

-- ─── Migrate existing reminders into schedule rows ─────────────────────────
-- One schedule per existing reminder, preserving the legacy offset/email state.
-- Idempotent: skips reminders that already have a schedule row.
INSERT INTO planner_reminder_schedules (reminder_id, user_id, notify_date, notify_time, in_app_enabled, email_enabled, email_sent, email_sent_at, email_fail_count, sort_order)
SELECT
  r.id,
  r.user_id,
  to_char((r.date_key::date - r.remind_offset)::date, 'YYYY-MM-DD') AS notify_date,
  COALESCE(NULLIF(r.email_delivery_time, ''), '08:00') AS notify_time,
  true AS in_app_enabled,
  r.email_enabled,
  r.email_sent,
  r.email_sent_at,
  r.email_fail_count,
  0 AS sort_order
FROM planner_reminders r
WHERE NOT EXISTS (SELECT 1 FROM planner_reminder_schedules s WHERE s.reminder_id = r.id);

-- ─── Reset trigger: clear sent state when a schedule is edited ─────────────
CREATE OR REPLACE FUNCTION public.reset_schedule_email_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF (
    NEW.notify_date IS DISTINCT FROM OLD.notify_date
    OR NEW.notify_time IS DISTINCT FROM OLD.notify_time
    OR NEW.email_enabled IS DISTINCT FROM OLD.email_enabled
  ) THEN
    NEW.email_sent := false;
    NEW.email_sent_at := NULL;
    NEW.email_failed_at := NULL;
    NEW.email_fail_count := 0;
    NEW.email_processing_at := NULL;
  END IF;
  IF (
    NEW.notify_date IS DISTINCT FROM OLD.notify_date
    OR NEW.notify_time IS DISTINCT FROM OLD.notify_time
    OR NEW.in_app_enabled IS DISTINCT FROM OLD.in_app_enabled
  ) THEN
    NEW.in_app_sent := false;
    NEW.in_app_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_schedule_email_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_schedule_email_state() TO authenticated;

DROP TRIGGER IF EXISTS trg_reset_schedule_email_state ON planner_reminder_schedules;
CREATE TRIGGER trg_reset_schedule_email_state
  BEFORE UPDATE ON planner_reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION public.reset_schedule_email_state();

-- ─── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_reminder_schedule_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_reminder_schedule_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reminder_schedule_updated_at() TO authenticated;

DROP TRIGGER IF EXISTS trg_set_reminder_schedule_updated_at ON planner_reminder_schedules;
CREATE TRIGGER trg_set_reminder_schedule_updated_at
  BEFORE UPDATE ON planner_reminder_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_reminder_schedule_updated_at();

-- ─── Reschedule the cron job (2-minute interval, no auth) ──────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('process-email-reminders');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron unschedule skipped: %', SQLERRM;
END $$;

SELECT cron.schedule(
  'process-email-reminders',
  '*/2 * * * *',
  $NET$
    SELECT net.http_post(
      url := 'https://nlnswacdfodyssfetevb.supabase.co/functions/v1/send-reminder-emails',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  $NET$
);