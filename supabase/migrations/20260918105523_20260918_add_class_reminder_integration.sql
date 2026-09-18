/*
# Add reminder integration to class schedule

1. Add `reminder_offset` to `planner_classes` (nullable smallint) — stores the selected reminder offset for the class (null = no reminder, 0 = on the day, 1/3/7 = days before)
2. Add `class_id` to `planner_reminders` (nullable uuid, references planner_classes with cascade delete) — links reminders to their originating class
3. Index on class_id for efficient lookup/deletion
4. No RLS changes needed — both tables already have owner-scoped RLS, and class_id is just a nullable FK
*/

ALTER TABLE planner_classes ADD COLUMN IF NOT EXISTS reminder_offset smallint;

ALTER TABLE planner_reminders ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES planner_classes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_planner_reminders_class_id ON planner_reminders(class_id) WHERE class_id IS NOT NULL;
