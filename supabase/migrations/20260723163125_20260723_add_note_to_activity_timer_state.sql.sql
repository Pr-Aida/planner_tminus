-- Add optional note column to activity timer state
ALTER TABLE activity_timer_state
  ADD COLUMN IF NOT EXISTS activity_note text;
