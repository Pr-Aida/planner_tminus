-- Enable realtime for study room tables
ALTER PUBLICATION supabase_realtime ADD TABLE study_room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE room_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE room_study_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE study_room_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE study_room_join_requests;