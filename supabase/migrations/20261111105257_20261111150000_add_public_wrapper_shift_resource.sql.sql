/*
# Add public wrapper for shift_resource_completed

The atomic function was created in `internal` schema, but PostgREST only
exposes functions in the `public` schema. This creates a thin SECURITY DEFINER
wrapper in `public` that delegates to the internal function.

1. New Functions
- `public.shift_resource_completed(p_resource_id uuid, p_delta int)` — wrapper
  that calls `internal.shift_resource_completed`. SECURITY DEFINER, search_path
  safe, revoked from PUBLIC/anon, granted to authenticated.
*/

CREATE OR REPLACE FUNCTION public.shift_resource_completed(p_resource_id uuid, p_delta int)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.shift_resource_completed(p_resource_id, p_delta);
$$;

REVOKE EXECUTE ON FUNCTION public.shift_resource_completed(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_resource_completed(uuid, int) TO authenticated;
