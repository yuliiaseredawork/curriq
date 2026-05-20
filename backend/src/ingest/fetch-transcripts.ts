import { YoutubeTranscript } from 'youtube-transcript';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';

const Input = z.object({
  videoId: z.string(),
  playlistId: z.string(),
});

const s3 = new S3Client({});

export const handler = async (raw: unknown) => {
  const { videoId, playlistId } = Input.parse(raw);

  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: 'en',
    });

    if (!segments?.length) {
      return { videoId, status: 'NO_TRANSCRIPT' as const };
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.RAW_BUCKET!,
        Key: `playlists/${playlistId}/transcripts/${videoId}.json`,
        Body: JSON.stringify({ videoId, segments }),
        ContentType: 'application/json',
      }),
    );

    return {
      videoId,
      status: 'OK' as const,
      segmentCount: segments.length,
    };
  } catch (e: any) {
    return {
      videoId,
      status: 'ERROR' as const,
      error: String(e?.message ?? e),
    };
  }
};