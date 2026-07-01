-- Add last_seen_update_version to profiles for What's New tracking
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen_version text NOT NULL DEFAULT '0';
