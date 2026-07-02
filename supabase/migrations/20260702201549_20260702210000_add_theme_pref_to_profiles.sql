/*
# Add theme preference column to profiles

1. Modified Tables
- `profiles`: Add `theme_pref` column (text, default 'light')
  - Stores the user's UI theme preference: 'light' or 'dark'
  - Persists across sessions and devices

2. Security
- No RLS policy changes needed — existing profiles policies already
  allow users to read/update their own row.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme_pref text NOT NULL DEFAULT 'light';
