/*
# Add feedback_notifications to realtime publication

1. Changes
   - Add `public.feedback_notifications` table to the `supabase_realtime` publication.
   - This enables realtime INSERT/UPDATE/DELETE events for the feedback_notifications table,
     so the top-bar notification bell receives live updates when admin replies to feedback
     or when feedback is submitted (admin_notification type).

2. Security
   - No RLS changes. The table already has RLS enabled with ownership-scoped policies.
   - Realtime subscriptions are filtered by user_id on the client side.
   - Only the notification owner can read their own rows (RLS SELECT policy).
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_notifications;
