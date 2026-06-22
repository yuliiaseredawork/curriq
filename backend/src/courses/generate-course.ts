import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
} from '@aws-sdk/client-lambda';
import OpenAI from 'openai';

import { startCourseIngestion } from '../ingest/start-course-ingestion';
import { parseYouTubeUrl } from '../youtube/parse-youtube-url';
import { saveCourseManifest, saveOutline } from '../storage/course-artifacts';
import { generateOutlineFromChunks } from '../agents/outliner';
import { callCourseMetadata } from './course-metadata-client';

const lambda = new LambdaClient({});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return res.data[0].embedding;
}

async function invokeJson(functionName: string, payload: unknown) {
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  const text = new TextDecoder().decode(res.Payload);
  const parsed = text ? JSON.parse(text) : null;

  if (res.FunctionError) {
    throw new Error(JSON.stringify(parsed));
  }

  return parsed;
}

/**
 * Kick off background quiz generation for every chapter (fire-and-forget).
 * The course is already READY once the outline is saved; quiz generation
 * tracks its own per-chapter status, so failures here never fail the course.
 */
async function fanOutChapterQuizzes(
  courseId: string,
  chapters: Array<{ id: string }>,
) {
  const fnName = process.env.GENERATE_CHAPTER_QUIZ_FUNCTION_NAME;
  if (!fnName) {
    console.warn('[generate-course] GENERATE_CHAPTER_QUIZ_FUNCTION_NAME not set; skipping quiz fan-out', { courseId });
    return;
  }

  for (const chapter of chapters) {
    try {
      await lambda.send(
        new InvokeCommand({
          FunctionName: fnName,
          InvocationType: InvocationType.Event,
          Payload: Buffer.from(
            JSON.stringify({ courseId, chapterId: chapter.id }),
          ),
        }),
      );
      console.log('[generate-course] quiz generation queued', { courseId, chapterId: chapter.id });
    } catch (e: any) {
      console.error('[generate-course] failed to queue chapter quiz', {
        courseId,
        chapterId: chapter.id,
        error: String(e?.message ?? e),
      });
    }
  }
}

async function searchChunks(input: {
  courseId: string;
  query: string;
  limit: number;
}) {
  const embedding = await embed(input.query);

  return invokeJson(process.env.SEARCH_CHUNKS_FUNCTION_NAME!, {
    courseId: input.courseId,
    embedding,
    limit: input.limit,
  });
}

export const handler = async (event: {
  courseId: string;
  userId: string;
  sourceType?: 'YOUTUBE_PLAYLIST' | 'YOUTUBE_VIDEO';
  sourceUrl?: string;
  playlistUrl?: string; // legacy alias for sourceUrl
  playlistId?: string;
  videoId?: string;
}) => {
  const { courseId, userId } = event;
  const sourceUrl = event.sourceUrl ?? event.playlistUrl!;
  const parsed = event.sourceType
    ? { sourceType: event.sourceType, playlistId: event.playlistId, videoId: event.videoId }
    : parseYouTubeUrl(sourceUrl);

  console.log('[generate-course] start', { courseId, userId, sourceType: parsed.sourceType });

  try {
    console.log('[generate-course] status → INGESTING', { courseId });
    await callCourseMetadata({
      action: 'updateStatus',
      courseId,
      status: 'INGESTING',
    });

    const ingestion = await startCourseIngestion({
      courseId,
      sourceType: parsed.sourceType,
      sourceUrl,
      playlistId: parsed.playlistId,
      videoId: parsed.videoId,
    });

    console.log('[generate-course] ingestion complete', {
      courseId,
      playlistId: ingestion.playlistId,
      videoCount: ingestion.videoIds.length,
      results: ingestion.results.map((r: any) => ({ videoId: r.videoId, status: r.status })),
    });

    const okTranscripts = ingestion.results.filter((r: any) => r.status === 'OK');
    if (parsed.sourceType === 'YOUTUBE_VIDEO' && okTranscripts.length === 0) {
      throw new Error('Could not load transcript for this video.');
    }

    const manifest = {
      courseId,
      sourceType: parsed.sourceType,
      sourceUrl,
      playlistUrl: sourceUrl, // legacy field
      playlistId: ingestion.playlistId,
      videoIds: ingestion.videoIds,
      transcripts: okTranscripts.map((r: any) => ({
        videoId: r.videoId,
        key: r.key,
        segmentCount: r.segmentCount,
      })),
      createdAt: new Date().toISOString(),
    };

    await saveCourseManifest(courseId, manifest);

    console.log('[generate-course] status → PROCESSING', { courseId, transcriptCount: manifest.transcripts.length });
    await callCourseMetadata({
      action: 'updateStatus',
      courseId,
      status: 'PROCESSING',
    });

    for (const transcript of manifest.transcripts) {
      const payload = {
        courseId,
        playlistId: manifest.playlistId,
        videoId: transcript.videoId,
      };

      console.log('[generate-course] embedding transcript', { courseId, videoId: transcript.videoId });
      await invokeJson(
        process.env.EMBED_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );

      console.log('[generate-course] processing transcript', { courseId, videoId: transcript.videoId });
      await invokeJson(
        process.env.PROCESS_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );
    }

    console.log('[generate-course] status → OUTLINING', { courseId });
    await callCourseMetadata({
      action: 'updateStatus',
      courseId,
      status: 'OUTLINING',
    });

    const search = await searchChunks({
      courseId,
      query: 'main topics and concepts in this course',
      limit: 6,
    });

    console.log('[generate-course] search results', { courseId, count: search.results?.length ?? 0 });

    if (!search.results?.length) {
      throw new Error('No embedded chunks found after processing.');
    }

    const outline = await generateOutlineFromChunks(search.results);

    console.log('[generate-course] outline generated', { courseId, title: outline.title, chapters: outline.chapters.length });

    await saveOutline(courseId, outline);

    await callCourseMetadata({
      action: 'upsert',
      courseId,
      userId,
      title: outline.title,
      playlistUrl: sourceUrl,
      playlistId: manifest.playlistId,
      status: 'READY',
      sourceType: parsed.sourceType,
      sourceUrl,
    });

    console.log('[generate-course] status → READY', { courseId, userId });

    // Course is READY (outline available). Generate quizzes in the background
    // without blocking — per-chapter status is tracked separately.
    await fanOutChapterQuizzes(courseId, outline.chapters);

    return {
      courseId,
      status: 'READY',
      title: outline.title,
    };
  } catch (e: any) {
    const errorMessage = String(e?.message ?? e);
    console.error('[generate-course] FAILED', { courseId, userId, error: errorMessage });

    try {
      await callCourseMetadata({
        action: 'updateStatus',
        courseId,
        status: 'FAILED',
        errorMessage,
      });
    } catch (metaErr: any) {
      console.error('[generate-course] could not update status to FAILED', {
        courseId,
        metaError: String(metaErr?.message ?? metaErr),
      });
    }

    throw e;
  }
};