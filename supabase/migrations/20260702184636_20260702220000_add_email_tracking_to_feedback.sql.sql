/*
# Add email tracking columns to feedback_messages

Tracks whether the email notification was sent for each feedback message,
so the admin can see which messages had email failures.

No data is lost — columns are added with defaults.
*/
ALTER TABLE feedback_messages
  ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_error text DEFAULT null;
