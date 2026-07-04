/*
# Create feedback table for Feedback & Support feature

1. Purpose
   Stores user/anonymous feedback (bug reports, suggestions, design feedback,
   feature requests, other) submitted from the Profile/Settings screen.
   Acts as a durable backup so feedback is never lost even if email delivery
   fails. The edge function `send-feedback` reads/writes here using the service
   role key; the frontend never reads from this table.

2. New Tables
   - `feedback`
     - `id` uuid PK (default gen_random_uuid())
     - `user_id` uuid NULLABLE — the authenticated submitter, null for anonymous
     - `feedback_type` text NOT NULL — one of: bug / suggestion / design / feature / other
     - `message` text NOT NULL — trimmed, 1..2000 chars
     - `optional_contact_email` text NULLABLE — user-supplied reply address
     - `page_route` text NULLABLE — the app route the user was on
     - `status` text NOT NULL DEFAULT 'new' — new / reviewed / resolved
     - `created_at` timestamptz NOT NULL DEFAULT now()
   - `feedback_rate_limits` (lightweight per-day counter)
     - `bucket_key` text PK — 'user:<uuid>' or 'anon:<ip-or-session>'
     - `day` date NOT NULL — the calendar day (UTC)
     - `count` int NOT NULL DEFAULT 0
     - `updated_at` timestamptz NOT NULL DEFAULT now()
     This table is written ONLY by the edge function (service role), never by
     the anon client, so it needs no RLS policies and no anon access.

3. Constraints
   - feedback.message length 1..2000 (CHECK)
   - feedback.feedback_type in allowed set (CHECK)
   - feedback.status in allowed set (CHECK)

4. Security (RLS)
   - RLS ENABLED on `feedback`.
   - INSERT policy for authenticated + anon: any signed-in or anonymous user
     may INSERT a feedback row. The edge function (service role) bypasses RLS,
     so this policy only governs the (unused) direct-client insert path; it is
     kept permissive for INSERT only because the edge function is the real
     gatekeeper and the frontend does not insert directly.
   - NO SELECT / UPDATE / DELETE policies for anon or authenticated. This means
     normal users CANNOT read other users' feedback, cannot list feedback, and
     cannot modify/delete it. Only the service role (edge function / future
     admin) can read it.
   - `feedback_rate_limits` has RLS ENABLED with NO policies, so it is fully
     locked from the anon client; only the service role can touch it.

5. Notes
   - No file uploads are supported in feedback.
   - No private planner data, habits, rooms, files, or messages are stored.
   - Only safe account context (user_id, display_name, username, page_route)
     is attached by the edge function at send time, not stored in the table
     beyond user_id (display_name/username are resolved at send time for the
     email body only, to avoid storing stale profile snapshots).
*/

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  feedback_type text NOT NULL,
  message text NOT NULL,
  optional_contact_email text,
  page_route text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_message_length CHECK (char_length(message) BETWEEN 1 AND 2000),
  CONSTRAINT feedback_type_valid CHECK (feedback_type IN ('bug','suggestion','design','feature','other')),
  CONSTRAINT feedback_status_valid CHECK (status IN ('new','reviewed','resolved'))
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- INSERT-only for the (rare) direct-client path. The edge function is the
-- real gatekeeper (rate limits, sanitization, email). No SELECT/UPDATE/DELETE
-- policies are created, so the table is read-invisible to normal users.
DROP POLICY IF EXISTS "insert_feedback" ON feedback;
CREATE POLICY "insert_feedback"
  ON feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  bucket_key text PRIMARY KEY,
  day date NOT NULL,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: fully locked from anon/authenticated; service role only.

-- Index for admin queries (future) and per-user lookups.
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback (user_id);
