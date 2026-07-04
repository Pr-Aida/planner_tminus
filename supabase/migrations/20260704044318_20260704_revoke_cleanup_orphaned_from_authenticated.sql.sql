-- Revoke EXECUTE on cleanup_orphaned_storage_files from authenticated and anon
-- This function deletes storage objects and should only be callable by service_role/postgres
REVOKE EXECUTE ON FUNCTION public.cleanup_orphaned_storage_files() FROM authenticated, anon;
