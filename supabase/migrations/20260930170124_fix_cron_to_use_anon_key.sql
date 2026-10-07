-- Unschedule the old cron job that used SUPABASE_SERVICE_ROLE_KEY (which doesn't exist in vault)
SELECT cron.unschedule('process-email-reminders');

-- Reschedule with the anon key from vault
SELECT cron.schedule(
  'process-email-reminders',
  '*/2 * * * *',
  $NET$
    SELECT net.http_post(
      url := 'https://nlnswacdfodyssfetevb.supabase.co/functions/v1/send-reminder-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_ANON_KEY' LIMIT 1)
      ),
      body := '{}'::jsonb
    );
  $NET$
);
