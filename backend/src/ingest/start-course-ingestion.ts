import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPlaylistVideos, extractPlaylistId } from '../youtube/playlist';
import { parseYouTubeUrl } from '../youtube/parse-youtube-url';
import { fetchTranscriptFromSearchApi } from '../transcripts/searchapi-transcripts';

const s3 = new S3Client({});

/**
 * Ingest transcripts for a YouTube source (playlist or single video).
 *
 * `sourceId` identifies the RAW transcript key namespace:
 *   - playlist     → the playlist id
 *   - single video → `single-video-<videoId>` (synthetic, documented)
 * It is returned as `playlistId` so the rest of the pipeline (manifest +
 * embed/process) is unchanged.
 */
export async function startCourseIngestion(input: {
  courseId: string;
  sourceType?: 'YOUTUBE_PLAYLIST' | 'YOUTUBE_VIDEO';
  sourceUrl?: string;
  playlistUrl?: string; // legacy alias for sourceUrl
  playlistId?: string;
  videoId?: string;
}) {
  const url = input.sourceUrl ?? input.playlistUrl;
  const parsed = input.sourceType
    ? { sourceType: input.sourceType, playlistId: input.playlistId, videoId: input.videoId }
    : parseYouTubeUrl(url!);

  let sourceId: string;
  let videoIds: string[];

  if (parsed.sourceType === 'YOUTUBE_VIDEO') {
    const videoId = parsed.videoId ?? parseYouTubeUrl(url!).videoId!;
    videoIds = [videoId];
    sourceId = `single-video-${videoId}`;
  } else {
    sourceId = parsed.playlistId ?? extractPlaylistId(url!);
    videoIds = (await getPlaylistVideos(url!)).slice(0, 3);
  }

  const playlistId = sourceId;
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