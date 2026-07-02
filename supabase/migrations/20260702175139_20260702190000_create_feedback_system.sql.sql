/*
# Feedback & Suggestions System

## Overview
Creates a secure, private feedback system where users can submit suggestions, bug
reports, feature requests, and general feedback. The site owner (admin) receives
an email notification, can view all feedback in an admin inbox, reply to users,
and users receive in-app notifications about replies.

## New Tables

### feedback_messages
Stores user-submitted feedback. Each row represents one feedback message.
- id (uuid PK)
- user_id (uuid, nullable — null for guest submissions; FK auth.users ON DELETE CASCADE)
- username (text, nullable — snapshot of username at submission time)
- contact_email (text, nullable — optional reply email the user provides)
- feedback_type (text NOT NULL, CHECK: suggestion|bug_report|feature_request|general)
- subject (text NOT NULL, 1-120 chars)
- message (text NOT NULL, 1-2000 chars)
- status (text NOT NULL DEFAULT 'new', CHECK: new|reviewed|planned|fixed|archived)
- created_at (timestamptz DEFAULT now())
- updated_at (timestamptz DEFAULT now())

### feedback_replies
Stores admin replies to feedback. Each reply is linked to a feedback message.
- id (uuid PK)
- feedback_id (uuid NOT NULL, FK feedback_messages ON DELETE CASCADE)
- admin_user_id (uuid NOT NULL, FK auth.users)
- recipient_user_id (uuid, nullable — null for guest feedback; used for notification targeting)
- reply_message (text NOT NULL, 1-2000 chars)
- created_at (timestamptz DEFAULT now())
- read_at (timestamptz, nullable — set when user reads the reply)

### feedback_notifications
Stores in-app notifications for feedback replies. Shown in the notification bell.
- id (uuid PK)
- user_id (uuid NOT NULL — the recipient of the reply)
- feedback_id (uuid NOT NULL, FK feedback_messages ON DELETE CASCADE)
- reply_id (uuid NOT NULL, FK feedback_replies ON DELETE CASCADE)
- type (text NOT NULL DEFAULT 'feedback_reply')
- read (boolean NOT NULL DEFAULT false)
- created_at (timestamptz DEFAULT now())

## Modified Tables

### profiles
- Adds is_admin boolean column (DEFAULT false) to identify the site owner.
  Set to true for the admin user (dr_house / 6c8c8d02-5eaf-4a97-9d73-855d254979ad).
  This is used by RLS policies to grant admin access to feedback tables.

## Security — RLS Policies

### feedback_messages
- INSERT: authenticated users can insert their own (user_id = auth.uid());
  anon users can insert with null user_id (guest feedback).
- SELECT: users can only see their own feedback (user_id = auth.uid());
  admin (is_admin = true) can see all feedback.
- UPDATE: only admin can update (status changes). Users cannot update.
- DELETE: only admin can delete.

### feedback_replies
- INSERT: only admin can insert replies.
- SELECT: users can see replies where recipient_user_id = auth.uid();
  admin can see all replies.
- UPDATE: users can update read_at on their own replies.
- DELETE: only admin can delete.

### feedback_notifications
- INSERT: only admin can insert (done via edge function with service role).
- SELECT: users can only see their own notifications (user_id = auth.uid()).
- UPDATE: users can mark their own notifications as read.
- DELETE: users can delete their own notifications.

## Rate Limiting
A feedback_rate_limits table tracks submissions per user per hour:
- id (uuid PK)
- user_id (uuid, nullable — null for anon/guest)
- created_at (timestamptz DEFAULT now())
- Index on (user_id, created_at) for fast lookups.
RLS: users can only insert their own rate limit rows; admin can read all.
The edge function checks this table before accepting feedback (max 5/hour for
logged-in users, max 2/hour for guests identified by IP).

## Important Notes
1. Admin is identified by profiles.is_admin = true. Only one user has this flag.
2. Guest feedback is allowed (user_id = null) so unauthenticated users can submit.
3. Email notifications are sent via a Supabase Edge Function (server-side only).
4. No email API keys, SMTP credentials, or service role keys are exposed to frontend.
5. Users can only see their own feedback and replies — never other users'.
6. The feedback_replies.recipient_user_id is set by the edge function when admin
   replies, extracted from the original feedback_messages.user_id.
7. feedback_notifications are inserted by the edge function using the service role
   key, so they bypass RLS. The RLS policies on feedback_notifications only control
   SELECT/UPDATE/DELETE by users.
*/
-- ─── Add is_admin to profiles ────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Set the site owner as admin
UPDATE profiles SET is_admin = true WHERE id = '6c8c8d02-5eaf-4a97-9d73-855d254979ad';

-- ─── feedback_messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  contact_email text,
  feedback_type text NOT NULL CHECK (feedback_type IN ('suggestion','bug_report','feature_request','general')),
  subject text NOT NULL CHECK (length(trim(subject)) >= 1 AND length(subject) <= 120),
  message text NOT NULL CHECK (length(trim(message)) >= 1 AND length(message) <= 2000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewed','planned','fixed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert_own" ON feedback_messages;
CREATE POLICY "feedback_insert_own" ON feedback_messages FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feedback_insert_guest" ON feedback_messages;
CREATE POLICY "feedback_insert_guest" ON feedback_messages FOR INSERT
  TO anon WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "feedback_select_own" ON feedback_messages;
CREATE POLICY "feedback_select_own" ON feedback_messages FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "feedback_select_admin" ON feedback_messages;
CREATE POLICY "feedback_select_admin" ON feedback_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS "feedback_update_admin" ON feedback_messages;
CREATE POLICY "feedback_update_admin" ON feedback_messages FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS "feedback_delete_admin" ON feedback_messages;
CREATE POLICY "feedback_delete_admin" ON feedback_messages FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ─── feedback_replies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback_messages(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  reply_message text NOT NULL CHECK (length(trim(reply_message)) >= 1 AND length(reply_message) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

ALTER TABLE feedback_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "replies_insert_admin" ON feedback_replies;
CREATE POLICY "replies_insert_admin" ON feedback_replies FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS "replies_select_own" ON feedback_replies;
CREATE POLICY "replies_select_own" ON feedback_replies FOR SELECT
  TO authenticated USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "replies_select_admin" ON feedback_replies;
CREATE POLICY "replies_select_admin" ON feedback_replies FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

DROP POLICY IF EXISTS "replies_update_own_read" ON feedback_replies;
CREATE POLICY "replies_update_own_read" ON feedback_replies FOR UPDATE
  TO authenticated USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "replies_delete_admin" ON feedback_replies;
CREATE POLICY "replies_delete_admin" ON feedback_replies FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ─── feedback_notifications ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES feedback_messages(id) ON DELETE CASCADE,
  reply_id uuid NOT NULL REFERENCES feedback_replies(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'feedback_reply',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE feedback_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_notif_select_own" ON feedback_notifications;
CREATE POLICY "fb_notif_select_own" ON feedback_notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "fb_notif_update_own" ON feedback_notifications;
CREATE POLICY "fb_notif_update_own" ON feedback_notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "fb_notif_delete_own" ON feedback_notifications;
CREATE POLICY "fb_notif_delete_own" ON feedback_notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ─── feedback_rate_limits ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_rate_user ON feedback_rate_limits (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_rate_ip ON feedback_rate_limits (ip_hash, created_at);

ALTER TABLE feedback_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_insert_own" ON feedback_rate_limits;
CREATE POLICY "rate_insert_own" ON feedback_rate_limits FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "rate_insert_guest" ON feedback_rate_limits;
CREATE POLICY "rate_insert_guest" ON feedback_rate_limits FOR INSERT
  TO anon WITH CHECK (user_id IS NULL);

DROP POLICY IF EXISTS "rate_select_admin" ON feedback_rate_limits;
CREATE POLICY "rate_select_admin" ON feedback_rate_limits FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
  );

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_feedback_messages_user ON feedback_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_messages_status ON feedback_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_recipient ON feedback_replies (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_replies_feedback ON feedback_replies (feedback_id, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_notifications_user ON feedback_notifications (user_id, read, created_at DESC);
