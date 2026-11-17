/*
# Add email delivery time to planner reminders

1. Plain-English explanation
- Users can already attach an email to a reminder and pick how many days before
  (0 / 1 / 3 / 7) it should arrive. This change adds the ability to pick the TIME
  of day the email arrives (for example 08:30), interpreted in the user's own
  timezone from their profile.
- Existing reminders keep working exactly as before: if no time was chosen, the
  email is delivered at 08:00 local time, which was the previous behaviour.

2. Modified tables
- `planner_reminders`: adds one nullable column
  - `email_delivery_time` (text, nullable, e.g. "08:30"). Empty / NULL means
    "use the default 08:00". Format is validated by a CHECK constraint
    (HH:mm, 00:00-23:59). RLS policies are unchanged; ownership rules unchanged.

3. Security
- No policy changes. The column is only reachable through the existing
  owner-scoped RLS policies on `planner_reminders`.

4. Notes
- Additive only. No tables are recreated and no rows are touched.
*/

ALTER TABLE planner_reminders
  ADD COLUMN IF NOT EXISTS email_delivery_time text
  CHECK (email_delivery_time IS NULL OR email_delivery_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');