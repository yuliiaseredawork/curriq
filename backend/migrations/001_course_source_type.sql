-- Multi-source course support (YouTube + PDF).
-- Idempotent; also applied programmatically via the courseMetadata Lambda's
-- `migrate` action (see backend/src/storage/courses-repository.ts runMigrations()).
--
-- Apply manually (from the bastion / a VPC host with DB access):
--   psql "$DATABASE_URL" -f backend/migrations/001_course_source_type.sql

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_file_key text,
  ADD COLUMN IF NOT EXISTS source_file_name text;

-- PDF courses have no playlist URL.
ALTER TABLE public.courses ALTER COLUMN playlist_url DROP NOT NULL;

-- Backfill existing (YouTube) courses.
UPDATE public.courses
SET source_type = 'YOUTUBE_PLAYLIST'
WHERE source_type IS NULL;
