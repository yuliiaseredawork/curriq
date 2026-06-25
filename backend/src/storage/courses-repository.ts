import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const secrets = new SecretsManagerClient({});

async function getDbConfig() {
  const secret = await secrets.send(
    new GetSecretValueCommand({
      SecretId: process.env.DB_SECRET_ARN!,
    }),
  );

  return JSON.parse(secret.SecretString!);
}

async function createClient() {
  const db = await getDbConfig();

  const client = new Client({
    host: db.host,
    port: db.port,
    database: db.dbname,
    user: db.username,
    password: db.password,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  return client;
}

type CourseStatus =
  | 'CREATED'
  | 'INGESTING'
  | 'PROCESSING'
  | 'OUTLINING'
  | 'READY'
  | 'FAILED';

export type SourceType = 'YOUTUBE_PLAYLIST' | 'YOUTUBE_VIDEO' | 'PDF';

/**
 * Idempotent schema migration for multi-source support. Adds the source_*
 * columns if missing and backfills existing (YouTube) courses. Safe to run
 * repeatedly. Invoked via the courseMetadata Lambda's `migrate` action.
 */
export async function runMigrations() {
  const client = await createClient();
  try {
    await client.query(`
      ALTER TABLE public.courses
        ADD COLUMN IF NOT EXISTS source_type text,
        ADD COLUMN IF NOT EXISTS source_url text,
        ADD COLUMN IF NOT EXISTS source_file_key text,
        ADD COLUMN IF NOT EXISTS source_file_name text,
        ADD COLUMN IF NOT EXISTS source_key text,
        ADD COLUMN IF NOT EXISTS target_date timestamptz;
    `);
    // Per-user dedup lookup by source key.
    await client.query(`
      CREATE INDEX IF NOT EXISTS courses_user_source_key_idx
        ON public.courses (user_id, source_key);
    `);
    // PDF courses have no playlist — relax the legacy NOT NULL constraint.
    await client.query(`
      ALTER TABLE public.courses ALTER COLUMN playlist_url DROP NOT NULL;
    `);
    await client.query(`
      UPDATE public.courses
      SET source_type = 'YOUTUBE_PLAYLIST'
      WHERE source_type IS NULL;
    `);
  } finally {
    await client.end();
  }
}

export async function upsertCourse(input: {
  courseId: string;
  userId: string;
  title: string;
  playlistUrl?: string | null;
  playlistId?: string;
  status: CourseStatus;
  errorMessage?: string | null;
  sourceType?: SourceType;
  sourceUrl?: string | null;
  sourceFileKey?: string | null;
  sourceFileName?: string | null;
  sourceKey?: string | null;
  targetDate?: string | null;
}) {
  const client = await createClient();

  try {
    await client.query(
      `
      INSERT INTO public.courses (
        id,
        user_id,
        title,
        playlist_url,
        playlist_id,
        status,
        error_message,
        source_type,
        source_url,
        source_file_key,
        source_file_name,
        source_key,
        target_date,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        playlist_url = EXCLUDED.playlist_url,
        playlist_id = EXCLUDED.playlist_id,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = now(),
        user_id = EXCLUDED.user_id,
        -- Preserve existing source_* / target_date when a caller doesn't
        -- provide them (e.g. the READY upsert) so they're never clobbered.
        source_type = COALESCE(EXCLUDED.source_type, public.courses.source_type),
        source_url = COALESCE(EXCLUDED.source_url, public.courses.source_url),
        source_file_key = COALESCE(EXCLUDED.source_file_key, public.courses.source_file_key),
        source_file_name = COALESCE(EXCLUDED.source_file_name, public.courses.source_file_name),
        source_key = COALESCE(EXCLUDED.source_key, public.courses.source_key),
        target_date = COALESCE(EXCLUDED.target_date, public.courses.target_date)
      `,
      [
        input.courseId,
        input.userId,
        input.title,
        input.playlistUrl ?? null,
        input.playlistId ?? null,
        input.status,
        input.errorMessage ?? null,
        input.sourceType ?? null,
        input.sourceUrl ?? input.playlistUrl ?? null,
        input.sourceFileKey ?? null,
        input.sourceFileName ?? null,
        input.sourceKey ?? null,
        input.targetDate ?? null,
      ],
    );
  } finally {
    await client.end();
  }
}

/**
 * Find a non-FAILED course for this user with the given source key (for dedup).
 * FAILED courses are intentionally excluded so a user can re-create after a
 * failure. Scoped to userId — dedup is per-user only.
 */
export async function findCourseBySourceKey(input: {
  userId: string;
  sourceKey: string;
}): Promise<{ courseId: string; title: string } | null> {
  const client = await createClient();
  try {
    const result = await client.query(
      `
      SELECT id, title
      FROM public.courses
      WHERE user_id = $1
        AND source_key = $2
        AND status <> 'FAILED'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [input.userId, input.sourceKey],
    );
    const r = result.rows[0];
    return r ? { courseId: r.id, title: r.title } : null;
  } finally {
    await client.end();
  }
}

export async function updateCourseStatus(input: {
  courseId: string;
  status: CourseStatus;
  errorMessage?: string | null;
}) {
  const client = await createClient();

  try {
    await client.query(
      `
      UPDATE public.courses
      SET status = $2,
          error_message = $3,
          updated_at = now()
      WHERE id = $1
      `,
      [input.courseId, input.status, input.errorMessage ?? null],
    );
  } finally {
    await client.end();
  }
}

/**
 * Atomically transition a course only if it is currently in `fromStatus`.
 * Returns true iff a row was updated. Used by retry to guard against a
 * double-click double-invoke: only the request that actually flips FAILED ->
 * CREATED proceeds to re-run the pipeline.
 */
export async function transitionCourseStatus(input: {
  courseId: string;
  fromStatus: CourseStatus;
  toStatus: CourseStatus;
  errorMessage?: string | null;
}): Promise<boolean> {
  const client = await createClient();
  try {
    const result = await client.query(
      `
      UPDATE public.courses
      SET status = $3,
          error_message = $4,
          updated_at = now()
      WHERE id = $1
        AND status = $2
      `,
      [input.courseId, input.fromStatus, input.toStatus, input.errorMessage ?? null],
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    await client.end();
  }
}

export async function listCourses(userId: string) {
  const client = await createClient();

  try {
    const result = await client.query(
      `
      SELECT
        id,
        user_id,
        title,
        playlist_url,
        playlist_id,
        status,
        error_message,
        source_type,
        source_url,
        source_file_name,
        target_date,
        created_at,
        updated_at
      FROM public.courses
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId],
    );

    return result.rows.map((r) => ({
      courseId: r.id,
      title: r.title,
      playlistUrl: r.playlist_url,
      playlistId: r.playlist_id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      errorMessage: r.error_message,
      userId: r.user_id,
      sourceType: r.source_type ?? 'YOUTUBE_PLAYLIST',
      sourceUrl: r.source_url,
      sourceFileName: r.source_file_name,
      targetDate: r.target_date,
    }));
  } finally {
    await client.end();
  }
}

export async function getCourseMetadata(courseId: string) {
  const client = await createClient();

  try {
    const result = await client.query(
      `
      SELECT
        id,
        title,
        playlist_url,
        playlist_id,
        status,
        created_at,
        updated_at
      FROM public.courses
      WHERE id = $1
      `,
      [courseId],
    );

    const r = result.rows[0];

    if (!r) return null;

    return {
      courseId: r.id,
      title: r.title,
      playlistUrl: r.playlist_url,
      playlistId: r.playlist_id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } finally {
    await client.end();
  }
}

export async function getCourseMetadataForUser(input: {
  courseId: string;
  userId: string;
}) {
  const client = await createClient();

  try {
    const result = await client.query(
      `
      SELECT
        id,
        user_id,
        title,
        playlist_url,
        playlist_id,
        status,
        error_message,
        source_type,
        source_url,
        source_file_key,
        source_file_name,
        target_date,
        created_at,
        updated_at
      FROM public.courses
      WHERE id = $1
        AND user_id = $2
      `,
      [input.courseId, input.userId],
    );

    const r = result.rows[0];

    if (!r) return null;

    return {
      courseId: r.id,
      userId: r.user_id,
      title: r.title,
      playlistUrl: r.playlist_url,
      playlistId: r.playlist_id,
      status: r.status,
      errorMessage: r.error_message,
      sourceType: r.source_type ?? 'YOUTUBE_PLAYLIST',
      sourceUrl: r.source_url,
      sourceFileKey: r.source_file_key,
      sourceFileName: r.source_file_name,
      targetDate: r.target_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } finally {
    await client.end();
  }
}