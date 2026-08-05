-- Multi-source course support (YouTube + PDF).
-- Applied automatically by the versioned migration custom resource.
--
-- Apply manually (from the bastion / a VPC host with DB access):
--   psql "$DATABASE_URL" -f backend/migrations/001_course_source_type.sql

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_file_key text,
  ADD COLUMN IF NOT EXISTS source_file_name text,
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS target_date timestamptz;

CREATE INDEX IF NOT EXISTS courses_user_source_key_idx
  ON public.courses (user_id, source_key);

-- PDF courses have no playlist URL.
ALTER TABLE public.courses ALTER COLUMN playlist_url DROP NOT NULL;

-- Backfill existing (YouTube) courses.
UPDATE public.courses
SET source_type = 'YOUTUBE_PLAYLIST'
WHERE source_type IS NULL;
