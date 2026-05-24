import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';

const s3 = new S3Client({});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type Segment = {
  text: string;
  offset?: number;
  start?: number;
};

type Chunk = {
  text: string;
  start: number;
};

function chunk(segments: Segment[]): Chunk[] {
  const result: Chunk[] = [];

  let acc = '';
  let start = Number(segments[0]?.offset ?? segments[0]?.start ?? 0) || 0;

  for (const segment of segments) {
    const text = segment.text ?? '';

    if ((acc + ' ' + text).length > 1600) {
      if (acc.trim()) {
        result.push({ text: acc.trim(), start });
      }

      acc = text;
      start = Number(segment.offset ?? segment.start ?? 0) || 0;
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
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return res.data[0].embedding;
}

export const handler = async (event: {
  courseId: string;
  playlistId: string;
  videoId: string;
}) => {
  const rawObj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.RAW_BUCKET!,
      Key: `playlists/${event.playlistId}/transcripts/${event.videoId}.json`,
    }),
  );

  const { segments } = JSON.parse(await rawObj.Body!.transformToString());

  const chunks = chunk(segments);

  const embeddedChunks = [];

  for (const c of chunks) {
    const embedding = await embed(c.text);

    embeddedChunks.push({
      courseId: event.courseId,
      playlistId: event.playlistId,
      videoId: event.videoId,
      startSec: Math.round(c.start),
      text: c.text,
      embedding,
    });
  }

  const key = `courses/${event.courseId}/videos/${event.videoId}/chunks.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: JSON.stringify({
        courseId: event.courseId,
        playlistId: event.playlistId,
        videoId: event.videoId,
        chunks: embeddedChunks,
      }),
      ContentType: 'application/json',
    }),
  );

  return {
    videoId: event.videoId,
    chunks: embeddedChunks.length,
    key,
  };
};