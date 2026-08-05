CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.courses (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL,
  playlist_url text,
  playlist_id text,
  status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chunks (
  id bigserial PRIMARY KEY,
  course_id text NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  start_sec integer NOT NULL DEFAULT 0,
  text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_course_id_idx ON public.chunks(course_id);
CREATE UNIQUE INDEX IF NOT EXISTS chunks_source_position_idx
  ON public.chunks(course_id, video_id, start_sec);
