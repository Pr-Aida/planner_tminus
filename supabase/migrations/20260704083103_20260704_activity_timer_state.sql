-- Activity timer state storage
-- Allows timer state to persist across page refreshes

CREATE TABLE IF NOT EXISTS activity_timer_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_name text NOT NULL,
  started_at timestamptz NOT NULL,
  accumulated_seconds integer NOT NULL DEFAULT 0,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_timer_state_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE activity_timer_state ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see/manage their own timer state
CREATE POLICY "select_own_timer" ON activity_timer_state
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "insert_own_timer" ON activity_timer_state
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own_timer" ON activity_timer_state
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "delete_own_timer" ON activity_timer_state
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE activity_timer_state IS 'Stores active timer state for activity tracking. One timer per user. Private - user can only access their own timer.';
