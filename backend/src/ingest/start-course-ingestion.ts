import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPlaylistVideos, extractPlaylistId } from '../youtube/playlist';
import { fetchTranscriptFromSearchApi } from '../transcripts/searchapi-transcripts';
import { processTranscript } from './process-transcript';

const s3 = new S3Client({});

export async function startCourseIngestion(input: {
  courseId: string;
  playlistUrl: string;
}) {
  const playlistId = extractPlaylistId(input.playlistUrl);
  const videoIds = (await getPlaylistVideos(input.playlistUrl)).slice(0, 3);

  const results = [];

  for (const videoId of videoIds) {
    try {
      const segments = await fetchTranscriptFromSearchApi(videoId);

      if (!segments?.length) {
        results.push({
          videoId,
          status: 'NO_TRANSCRIPT',
        });
        continue;
      }

      const key = `playlists/${playlistId}/transcripts/${videoId}.json`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.RAW_BUCKET!,
          Key: key,
          Body: JSON.stringify({
            courseId: input.courseId,
            playlistId,
            videoId,
            segments,
          }),
          ContentType: 'application/json',
        }),
      );

      // const processed = await processTranscript({
      //   courseId: input.courseId,
      //   playlistId,
      //   videoId,
      // });

      results.push({
        videoId,
        status: 'OK',
        key,
        segmentCount: segments.length,
      });
    } catch (e: any) {
      results.push({
        videoId,
        status: 'ERROR',
        error: String(e?.message ?? e),
      });
    }
  }

  return {
    playlistId,
    videoIds,
    results,
  };
}