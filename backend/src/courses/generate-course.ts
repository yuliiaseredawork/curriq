import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import OpenAI from 'openai';

import { startCourseIngestion } from '../ingest/start-course-ingestion';
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
  playlistUrl: string;
}) => {
  const { courseId, playlistUrl } = event;

  try {
    await callCourseMetadata({
      action: 'updateStatus',
      courseId,
      status: 'INGESTING',
    });

    const ingestion = await startCourseIngestion({
      courseId,
      playlistUrl,
    });

    const manifest = {
      courseId,
      playlistUrl,
      playlistId: ingestion.playlistId,
      videoIds: ingestion.videoIds,
      transcripts: ingestion.results
        .filter((r: any) => r.status === 'OK')
        .map((r: any) => ({
          videoId: r.videoId,
          key: r.key,
          segmentCount: r.segmentCount,
        })),
      createdAt: new Date().toISOString(),
    };

    await saveCourseManifest(courseId, manifest);

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

      await invokeJson(
        process.env.EMBED_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );

      await invokeJson(
        process.env.PROCESS_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );
    }

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

    if (!search.results?.length) {
      throw new Error('No embedded chunks found after processing.');
    }

    const outline = await generateOutlineFromChunks(search.results);
    await saveOutline(courseId, outline);

    await callCourseMetadata({
      action: 'upsert',
      courseId,
      title: outline.title,
      playlistUrl,
      playlistId: manifest.playlistId,
      status: 'READY',
    });

    return {
      courseId,
      status: 'READY',
      title: outline.title,
    };
  } catch (e: any) {
    await callCourseMetadata({
      action: 'updateStatus',
      courseId,
      status: 'FAILED',
      errorMessage: String(e?.message ?? e),
    });

    throw e;
  }
};