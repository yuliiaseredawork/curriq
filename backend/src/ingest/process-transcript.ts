import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

type Segment = {
  text: string;
  offset?: number;
  start?: number;
};

function chunk(segments: Segment[]) {
  const result: { text: string; start: number }[] = [];
  let acc = '';
  let start = segments[0]?.offset ?? segments[0]?.start ?? 0;

  for (const segment of segments) {
    const text = segment.text ?? '';

    if ((acc + ' ' + text).length > 1600) {
      if (acc.trim()) result.push({ text: acc.trim(), start });
      acc = text;
      start = segment.offset ?? segment.start ?? 0;
    } else {
      acc += ' ' + text;
    }
  }

  if (acc.trim()) result.push({ text: acc.trim(), start });

  return result;
}

async function getDbConfig() {
  const secret = await secrets.send(
    new GetSecretValueCommand({
      SecretId: process.env.DB_SECRET_ARN!,
    }),
  );

  return JSON.parse(secret.SecretString!);
}

export async function processTranscript(input: {
  courseId: string;
  playlistId: string;
  videoId: string;
}) {
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.RAW_BUCKET!,
      Key: `playlists/${input.playlistId}/transcripts/${input.videoId}.json`,
    }),
  );

  const { segments } = JSON.parse(await obj.Body!.transformToString());
  const chunks = chunk(segments);
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
      await client.query(
        `
        INSERT INTO public.chunks(course_id, video_id, start_sec, text, embedding)
        VALUES ($1, $2, $3, $4, NULL)
        `,
        [input.courseId, input.videoId, Math.round(c.start), c.text],
      );
    }
  } finally {
    await client.end();
  }

  return {
    videoId: input.videoId,
    chunks: chunks.length,
  };
}

export const handler = async (event: {
  courseId: string;
  playlistId: string;
  videoId: string;
}) => {
  return processTranscript(event);
};