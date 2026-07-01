-- Create covers bucket for hero/cover images (cross-device sync)
INSERT INTO storage.buckets (id, name, public)
VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "covers_owner_read" ON storage.objects;
CREATE POLICY "covers_owner_read" ON storage.objects FOR SELECT
  TO authenticated USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "covers_owner_insert" ON storage.objects;
CREATE POLICY "covers_owner_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "covers_owner_update" ON storage.objects;
CREATE POLICY "covers_owner_update" ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "covers_owner_delete" ON storage.objects;
CREATE POLICY "covers_owner_delete" ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
