/*
# Remove Feedback & Suggestions feature — database cleanup

Drops all 4 feedback-related tables. CASCADE handles dependent indexes and policies.
Does NOT touch any other tables, columns, or data.

Keeping profiles.is_admin column — it's harmless and may be useful for future admin features.
*/
DROP TABLE IF EXISTS feedback_notifications CASCADE;
DROP TABLE IF EXISTS feedback_replies CASCADE;
DROP TABLE IF EXISTS feedback_messages CASCADE;
DROP TABLE IF EXISTS feedback_rate_limits CASCADE;
