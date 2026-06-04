import { Hono } from 'hono';
import { z } from 'zod';
import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { generateOutlineFromChunks } from '../../agents/outliner';
import { saveOutline } from '../../storage/course-artifacts';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import { loadCourseManifest } from '../../storage/course-artifacts';

const Input = z.object({
  courseId: z.string(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const lambda = new LambdaClient({});

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });

  return res.data[0].embedding;
}

export const outline = new Hono();

outline.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);

  const query = input.query ?? 'main topics and concepts in this course';
  const embedding = await embed(query);

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(
        JSON.stringify({
          courseId: input.courseId,
          embedding,
          limit: input.limit ?? 10,
        }),
      ),
    }),
  );

  const payload = JSON.parse(
    new TextDecoder().decode(response.Payload),
  );

  if (!payload.results?.length) {
    return c.json(
      {
        error: 'NO_CHUNKS_FOUND',
        message: 'No embedded chunks found for this course.',
      },
      404,
    );
  }

  const generated = await generateOutlineFromChunks(payload.results);
  const saved = await saveOutline(input.courseId, generated);
  const manifest = await loadCourseManifest(input.courseId);

  await callCourseMetadata({
    action: 'upsert',
    courseId: input.courseId,
    title: generated.title,
    playlistUrl: manifest.playlistUrl,
    playlistId: manifest.playlistId,
    status: 'READY',
  });

  return c.json({
    courseId: input.courseId,
    outline: generated,
    sourceChunkCount: payload.results.length,
    saved,
  });
});