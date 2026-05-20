import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? 'us-west-2' });
const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});

const CHUNK_TARGET_CHARS = 1600;

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

    if ((acc + ' ' + text).length > CHUNK_TARGET_CHARS) {
      if (acc.trim()) {
        result.push({ text: acc.trim(), start });
      }

      acc = text;
      start = segment.offset ?? segment.start ?? 0;
    } else {
      acc += ' ' + text;
    }
  }

  if (acc.trim()) {
    result.push({ text: acc.trim(), start });
  }

  return result;
}

async function embed(text: string): Promise<number[]> {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: 'amazon.titan-embed-text-v2:0',
      body: JSON.stringify({
        inputText: text,
        dimensions: 1024,
        normalize: true,
      }),
      contentType: 'application/json',
      accept: 'application/json',
    }),
  );

  return JSON.parse(new TextDecoder().decode(res.body)).embedding;
}

async function getDbConfig() {
  const secret = await secrets.send(
    new GetSecretValueCommand({
      SecretId: process.env.DB_SECRET_ARN!,
    }),
  );

  return JSON.parse(secret.SecretString!);
}

export const handler = async (event: {
  videoId: string;
  playlistId: string;
  courseId: string;
}) => {
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.RAW_BUCKET!,
      Key: `playlists/${event.playlistId}/transcripts/${event.videoId}.json`,
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
    ssl: {
      rejectUnauthorized: false,
    },
  });

  await client.connect();

  try {
    for (const c of chunks) {
      const vector = await embed(c.text);

      await client.query(
        `
        INSERT INTO public.chunks(course_id, video_id, start_sec, text, embedding)
        VALUES ($1, $2, $3, $4, $5::vector)
        `,
        [
          event.courseId,
          event.videoId,
          Math.round(c.start),
          c.text,
          `[${vector.join(',')}]`,
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