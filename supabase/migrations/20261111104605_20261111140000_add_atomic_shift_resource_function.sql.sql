/*
# Add atomic shift_resource_completed function

1. New Functions
- `shift_resource_completed(resource_uuid, delta_int)` — atomically increments
  the `completed` column of a progress resource by `delta`, clamped to [0, total]
  (or [0, infinity) when total = 0). Returns the new completed value, or NULL on
  missing resource. This replaces the read-then-write pattern that caused race
  conditions where progress values could reset or double-count when two
  mutations hit the same resource concurrently.

2. Security
- SECURITY DEFINER, schema-internal, search_path safe.
- Executable by `authenticated` (the app's only role for progress writes).
- Revoked from PUBLIC/anon.
*/

CREATE OR REPLACE FUNCTION internal.shift_resource_completed(p_resource_id uuid, p_delta int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = internal, public
AS $$
DECLARE
  new_completed int;
  r_total int;
BEGIN
  SELECT total INTO r_total FROM planner_progress_resources WHERE id = p_resource_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  -- Clamp: >= 0, and <= total when total > 0
  IF r_total > 0 THEN
    new_completed := LEAST(r_total, GREATEST(0, COALESCE((
      SELECT completed FROM planner_progress_resources WHERE id = p_resource_id
    ), 0) + p_delta));
  ELSE
    new_completed := GREATEST(0, COALESCE((
      SELECT completed FROM planner_progress_resources WHERE id = p_resource_id
    ), 0) + p_delta);
  END IF;
  UPDATE planner_progress_resources SET completed = new_completed, updated_at = now()
    WHERE id = p_resource_id;
  RETURN new_completed;
END;
$$;

REVOKE EXECUTE ON FUNCTION internal.shift_resource_completed(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION internal.shift_resource_completed(uuid, int) TO authenticated;
