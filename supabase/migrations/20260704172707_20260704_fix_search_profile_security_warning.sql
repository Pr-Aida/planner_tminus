/*
# Fix search_profile_by_username security warnings

1. Security Changes
   - REVOKE EXECUTE on search_profile_by_username from PUBLIC and anon.
   - This eliminates the Supabase security warning about anon/public being
     able to execute a SECURITY DEFINER function.
   - Only authenticated users can execute the function (GRANT already exists).
   - The function already validates auth.uid() IS NULL internally and raises
     a 42501 exception if the caller is not authenticated.
   - No changes to the function body or return columns — only ACL changes.

2. Why SECURITY DEFINER is necessary
   - The profiles table has RLS: SELECT policy is `auth.uid() = id`, meaning
     users can only read their own profile row.
   - A SECURITY INVOKER function would inherit the caller's RLS and return
     zero rows for other users — making search impossible.
   - SECURITY DEFINER bypasses RLS so the function can search all profiles,
     but it only returns safe public fields (id, username, display_name,
     avatar_url) and validates auth.uid() internally.

3. Fields returned (unchanged, all safe public fields)
   - id (uuid)
   - username (text)
   - display_name (text)
   - avatar_url (text, nullable)
   - No email, is_admin, or private fields are returned.
*/

REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_profile_by_username(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_profile_by_username(text) TO authenticated;
