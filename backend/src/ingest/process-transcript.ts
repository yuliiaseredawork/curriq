import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const s3 = new S3Client({});
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
  playlistId: string;
  videoId: string;
}) => {
  const processedKey = `courses/${event.courseId}/videos/${event.videoId}/chunks.json`;

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: processedKey,
    }),
  );

  const { chunks } = JSON.parse(await obj.Body!.transformToString());

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
    for (const c of chunks) {
      const startSec = Number.isFinite(Number(c.start))
      ? Math.round(Number(c.start))
      : 0;

      await client.query(
        `
        INSERT INTO public.chunks(course_id, video_id, start_sec, text, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
        `,
        [
          event.courseId,
          event.videoId,
          startSec,
          c.text,
          `[${c.embedding.join(',')}]`,
        ],
      );
    }
  } finally {
    await client.end();
  }

  return {
    videoId: event.videoId,
    chunks: chunks.length,
  };
};