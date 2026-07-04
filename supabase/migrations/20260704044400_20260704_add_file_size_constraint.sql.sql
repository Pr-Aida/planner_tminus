-- Add DB-level file size limit (max 15MB) as defense-in-depth
-- Frontend already enforces 5MB for images/audio, 10MB for PDFs/files
ALTER TABLE public.uploaded_files
  ADD CONSTRAINT uploaded_files_file_size_check
  CHECK (file_size >= 0 AND file_size <= 15728640); -- 15 MB
