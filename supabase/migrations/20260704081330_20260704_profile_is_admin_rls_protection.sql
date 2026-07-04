-- Additional INSERT protection: ensure new profiles cannot set is_admin = true
-- This is defense in depth - the edge function uses service role which bypasses RLS,
-- but if any client-side insert were possible, this would block it.

-- Update the insert policy to explicitly check is_admin is not true
DROP POLICY IF EXISTS insert_own_profile ON profiles;

CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id AND (is_admin IS NULL OR is_admin = false));

-- Also update the update policy to explicitly exclude is_admin from client updates
-- The trigger handles the enforcement, but this adds RLS-level documentation
DROP POLICY IF EXISTS update_own_profile ON profiles;

CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND (
      -- Allow update only if is_admin is not being changed
      is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
      OR is_admin IS NULL
      OR is_admin = false
    )
  );

COMMENT ON POLICY "insert_own_profile" ON profiles IS 'Users can only insert their own profile with is_admin=false or null';
COMMENT ON POLICY "update_own_profile" ON profiles IS 'Users can only update their own profile, cannot modify is_admin flag';
