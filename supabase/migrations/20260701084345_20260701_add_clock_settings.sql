-- Add clock settings columns to profiles for dual-clock header sync across devices
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clock1_tz     text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS clock1_label  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clock1_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS clock2_tz     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clock2_label  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clock2_visible boolean NOT NULL DEFAULT false;
