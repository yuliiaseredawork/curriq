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

export async function upsertCourse(input: {
  courseId: string;
  userId: string;
  title: string;
  playlistUrl: string;
  playlistId?: string;
  status: CourseStatus;
  errorMessage?: string | null;
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
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        playlist_url = EXCLUDED.playlist_url,
        playlist_id = EXCLUDED.playlist_id,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = now(),
        user_id = EXCLUDED.user_id
      `,
      [
        input.courseId,
        input.userId,
        input.title,
        input.playlistUrl,
        input.playlistId ?? null,
        input.status,
        input.errorMessage ?? null,
      ],
    );
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
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } finally {
    await client.end();
  }
}