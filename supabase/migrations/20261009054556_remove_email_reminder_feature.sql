-- Unschedule the email reminder cron job
SELECT cron.unschedule('process-email-reminders');

-- Drop the email reminder trigger
DROP TRIGGER IF EXISTS trg_fill_reminder_email ON planner_reminders;
DROP FUNCTION IF EXISTS fill_reminder_notification_email();

-- Remove email-reminder-specific columns from planner_reminders
ALTER TABLE planner_reminders
  DROP COLUMN IF EXISTS email_enabled,
  DROP COLUMN IF EXISTS email_sent,
  DROP COLUMN IF EXISTS email_sent_at,
  DROP COLUMN IF EXISTS email_failed_at,
  DROP COLUMN IF EXISTS email_fail_count,
  DROP COLUMN IF EXISTS notification_email;

-- Remove email-reminder-specific columns from profiles
ALTER TABLE profiles
  DROP COLUMN IF EXISTS email_reminders_enabled,
  DROP COLUMN IF EXISTS notification_email;

-- Clean up vault secrets that were only for email reminders
DELETE FROM vault.secrets WHERE name = 'SUPABASE_ANON_KEY';
