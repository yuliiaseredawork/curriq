import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { createReusableClient } from "../storage/database";

const s3 = new S3Client({});

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

  const client = await createReusableClient();

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
          `[${c.embedding.join(",")}]`,
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
