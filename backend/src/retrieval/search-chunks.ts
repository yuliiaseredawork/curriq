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

export const handler = async (event: {
  courseId: string;
  embedding: number[];
  limit?: number;
}) => {
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

  try {
    const result = await client.query(
      `
      SELECT
        id,
        course_id,
        video_id,
        start_sec,
        text,
        embedding <=> $1::vector AS distance
      FROM public.chunks
      WHERE course_id = $2
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [
        `[${event.embedding.join(',')}]`,
        event.courseId,
        event.limit ?? 5,
      ],
    );

    return {
      results: result.rows,
    };
  } finally {
    await client.end();
  }
};