import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

import {
  loadPractice,
  savePractice,
} from '../../storage/course-artifacts';
import { generatePractice } from '../../agents/practice-writer';

const Input = z.object({
  courseId: z.string(),
  concept: z.string().min(2),
  limit: z.number().int().min(1).max(10).optional(),
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

async function searchChunks(input: {
  courseId: string;
  query: string;
  limit: number;
}) {
  const embedding = await embed(input.query);

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(
        JSON.stringify({
          courseId: input.courseId,
          embedding,
          limit: input.limit,
        }),
      ),
    }),
  );

  const payload = JSON.parse(
    new TextDecoder().decode(response.Payload),
  );

  if (response.FunctionError) {
    throw new Error(JSON.stringify(payload));
  }

  return payload;
}

export const practice = new Hono();

practice.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);

  const practiceId = randomUUID();

  const search = await searchChunks({
    courseId: input.courseId,
    query: input.concept,
    limit: input.limit ?? 5,
  });

  if (!search.results?.length) {
    return c.json(
      {
        error: 'NO_CHUNKS_FOUND',
        message: `No relevant chunks found for concept: ${input.concept}`,
      },
      404,
    );
  }

  const generated = await generatePractice({
    practiceId,
    concept: input.concept,
    chunks: search.results,
  });

  const saved = await savePractice(
    input.courseId,
    practiceId,
    generated,
  );

  return c.json({
    courseId: input.courseId,
    practiceId,
    concept: input.concept,
    practice: generated,
    saved,
  });
});

practice.get('/:courseId/:practiceId', async (c) => {
  const courseId = c.req.param('courseId');
  const practiceId = c.req.param('practiceId');

  try {
    const practice = await loadPractice(courseId, practiceId);

    return c.json({
      courseId,
      practiceId,
      practice,
    });
  } catch {
    return c.json(
      {
        error: 'PRACTICE_NOT_FOUND',
        message: `No practice found for ${courseId}/${practiceId}`,
      },
      404,
    );
  }
});