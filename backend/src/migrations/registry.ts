export type Migration = {
  version: string;
  description: string;
  sql: string;
};

/** Append-only registry. Never edit a migration after it has shipped. */
export const migrations: Migration[] = [
  {
    version: "000",
    description: "initial course and vector schema",
    sql: `
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
    `,
  },
  {
    version: "001",
    description: "multi-source course support",
    sql: `
      ALTER TABLE public.courses
        ADD COLUMN IF NOT EXISTS source_type text,
        ADD COLUMN IF NOT EXISTS source_url text,
        ADD COLUMN IF NOT EXISTS source_file_key text,
        ADD COLUMN IF NOT EXISTS source_file_name text,
        ADD COLUMN IF NOT EXISTS source_key text,
        ADD COLUMN IF NOT EXISTS target_date timestamptz;
      ALTER TABLE public.courses ALTER COLUMN playlist_url DROP NOT NULL;
      CREATE INDEX IF NOT EXISTS courses_user_source_key_idx
        ON public.courses (user_id, source_key);
      UPDATE public.courses
      SET source_type = 'YOUTUBE_PLAYLIST'
      WHERE source_type IS NULL;
    `,
  },
  {
    version: "002",
    description: "operational and ownership indexes",
    sql: `
      CREATE INDEX IF NOT EXISTS courses_user_created_idx
        ON public.courses (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS courses_stuck_idx
        ON public.courses (updated_at)
        WHERE status IN ('CREATED', 'INGESTING', 'PROCESSING', 'OUTLINING');
    `,
  },
];

export const latestMigrationVersion = migrations.at(-1)?.version ?? "none";
