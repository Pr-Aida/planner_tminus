/*
# Create university class schedule table

1. New Tables
- `planner_classes`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to authenticated user, references auth.users with cascade delete)
  - `course_name` (text, not null) — the class/course name
  - `day_of_week` (smallint, 0-6) — day of week index. For Shamsi: 0=Saturday...6=Friday. For Gregorian: 0=Monday...6=Sunday. Stored as the website's current week-day index.
  - `start_time` (text, not null) — HH:MM format
  - `end_time` (text, not null) — HH:MM format
  - `location` (text, nullable) — room/building
  - `instructor` (text, nullable) — teacher/professor name
  - `notes` (text, nullable) — optional notes
  - `color` (text, nullable) — optional hex color for the class card
  - `weekly_repeat` (boolean, default true) — whether the class repeats weekly
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

2. Security
- Enable RLS on `planner_classes`.
- Owner-scoped CRUD: each authenticated user can only access their own class schedule rows.
- 4 separate policies (select/insert/update/delete) scoped to `authenticated` with `auth.uid() = user_id`.

3. Notes
- `user_id` defaults to `auth.uid()` so frontend inserts omitting it still pass the WITH CHECK.
- `day_of_week` is a smallint 0-6. The frontend interprets it based on the user's calendar preference (Shamsi vs Gregorian) — the database stores a neutral index.
- Times are stored as text in HH:MM 24-hour format for simplicity and to avoid timezone ambiguity (these are weekly recurring time slots, not absolute timestamps).
*/

CREATE TABLE IF NOT EXISTS planner_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name text NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time text NOT NULL,
  end_time text NOT NULL,
  location text,
  instructor text,
  notes text,
  color text,
  weekly_repeat boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE planner_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_classes" ON planner_classes;
CREATE POLICY "select_own_classes"
ON planner_classes FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_classes" ON planner_classes;
CREATE POLICY "insert_own_classes"
ON planner_classes FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_classes" ON planner_classes;
CREATE POLICY "update_own_classes"
ON planner_classes FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_classes" ON planner_classes;
CREATE POLICY "delete_own_classes"
ON planner_classes FOR DELETE
TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_planner_classes_user_day ON planner_classes(user_id, day_of_week);
