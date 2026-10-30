/*
# Enable realtime sync for Activity timer and drafts

## Plain-English summary
Adds the Activity timer table and the Activity drafts table to the realtime publication so that changes made on one device are pushed to other open devices.

## Changed tables
- `activity_timer_state`: added to the `supabase_realtime` publication.
- `activity_drafts`: added to the `supabase_realtime` publication.

## Security
- No policy or grant changes. Realtime delivers only rows that the subscribing user can already read under the existing owner-scoped RLS policies.

## Notes
1. Idempotent: each table is only added if it is not already in the publication.
2. No data is changed or removed.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_timer_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_timer_state;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_drafts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_drafts;
  END IF;
END $$;
