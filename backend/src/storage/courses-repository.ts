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

export async function upsertCourse(input: {
  courseId: string;
  title: string;
  playlistUrl: string;
  playlistId?: string;
  status: 'CREATED' | 'PROCESSING' | 'READY' | 'FAILED';
}) {
  const client = await createClient();

  try {
    await client.query(
      `
      INSERT INTO public.courses (
        id,
        title,
        playlist_url,
        playlist_id,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now(), now())
      ON CONFLICT (id)
      DO UPDATE SET
        title = EXCLUDED.title,
        playlist_url = EXCLUDED.playlist_url,
        playlist_id = EXCLUDED.playlist_id,
        status = EXCLUDED.status,
        updated_at = now()
      `,
      [
        input.courseId,
        input.title,
        input.playlistUrl,
        input.playlistId ?? null,
        input.status,
      ],
    );
  } finally {
    await client.end();
  }
}

export async function updateCourseStatus(input: {
  courseId: string;
  status: 'CREATED' | 'PROCESSING' | 'READY' | 'FAILED';
}) {
  const client = await createClient();

  try {
    await client.query(
      `
      UPDATE public.courses
      SET status = $2,
          updated_at = now()
      WHERE id = $1
      `,
      [input.courseId, input.status],
    );
  } finally {
    await client.end();
  }
}

export async function listCourses() {
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
      ORDER BY created_at DESC
      LIMIT 50
      `,
    );

    return result.rows.map((r) => ({
      courseId: r.id,
      title: r.title,
      playlistUrl: r.playlist_url,
      playlistId: r.playlist_id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
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