-- Store the anon key in vault so the cron job can authenticate with the edge function
SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5sbnN3YWNkZm9keXNzZmV0ZXZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4NDE1MDYsImV4cCI6MjA5ODQxNzUwNn0.30YESun8ueQ8lSqiKI2kCuK8CHcoRaj8LW7qQ-QMniU',
  'SUPABASE_ANON_KEY'
);
