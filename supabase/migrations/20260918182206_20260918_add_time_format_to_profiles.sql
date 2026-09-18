/*
# Add time_format preference to profiles

1. Changes
- Adds `time_format` column to `profiles` table.
- Stores user's global time display preference: '12h' or '24h'.
- Defaults to '12h' (12-hour AM/PM format).
- Follows the same pattern as `theme_pref` column.

2. Security
- No RLS changes needed — the column is accessed through existing profile policies.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS time_format text NOT NULL DEFAULT '12h';

-- Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_time_format_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_time_format_check
      CHECK (time_format IN ('12h', '24h'));
  END IF;
END $$;