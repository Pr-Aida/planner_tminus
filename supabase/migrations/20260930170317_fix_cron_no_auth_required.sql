-- Unschedule the old cron job
SELECT cron.unschedule('process-email-reminders');

-- Reschedule without auth header — the edge function no longer requires auth
SELECT cron.schedule(
  'process-email-reminders',
  '*/2 * * * *',
  $NET$
    SELECT net.http_post(
      url := 'https://nlnswacdfodyssfetevb.supabase.co/functions/v1/send-reminder-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $NET$
);
