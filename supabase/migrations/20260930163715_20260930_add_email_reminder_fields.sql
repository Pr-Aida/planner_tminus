-- Add email reminder fields to planner_reminders
ALTER TABLE planner_reminders
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_fail_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_email text;

-- Add email reminder preferences to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_reminders_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_email text;

-- When email_enabled is set on a reminder, auto-fill notification_email from
-- the user's profile if the caller didn't supply one.
CREATE OR REPLACE FUNCTION fill_reminder_notification_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email_enabled AND NEW.notification_email IS NULL THEN
    SELECT p.notification_email INTO NEW.notification_email
    FROM profiles p WHERE p.id = NEW.user_id;
    -- If profile has no notification_email, fall back to recovery_email
    IF NEW.notification_email IS NULL THEN
      SELECT p.recovery_email INTO NEW.notification_email
      FROM profiles p WHERE p.id = NEW.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fill_reminder_notification_email() FROM anon;
GRANT EXECUTE ON FUNCTION fill_reminder_notification_email() TO authenticated;

DROP TRIGGER IF EXISTS trg_fill_reminder_email ON planner_reminders;
CREATE TRIGGER trg_fill_reminder_email
  BEFORE INSERT OR UPDATE OF email_enabled, notification_email ON planner_reminders
  FOR EACH ROW EXECUTE FUNCTION fill_reminder_notification_email();

-- Grant update on new columns (RLS already restricts rows to owner)
-- The existing UPDATE policy covers all columns, so no new policy needed.

-- Create cron job to process email reminders every 2 minutes.
-- It calls the edge function which does the actual email sending.
-- We use pg_net's http_post to invoke the edge function securely.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The edge function URL and auth are set via cron.job arguments.
-- We use the Supabase service role key stored in vault/secret.
-- First, store the edge function URL as a setting the cron job can use.
-- The cron job invokes the 'send-reminder-emails' edge function.

DO $$
BEGIN
  -- Schedule the email reminder processor every 2 minutes
  -- Uses net.http_post to call the edge function with service role key
  PERFORM cron.schedule(
    'process-email-reminders',
    '*/2 * * * *',
    $NET$
      SELECT net.http_post(
        url := 'https://nlnswacdfodyssfetevb.supabase.co/functions/v1/send-reminder-emails',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
    $NET$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Cron job already exists or could not be created: %', SQLERRM;
END $$;
