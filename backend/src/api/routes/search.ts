import { Hono } from 'hono';
import { z } from 'zod';
import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const Input = z.object({
  courseId: z.string(),
  query: z.string().min(2),
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

export const search = new Hono();

search.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);

  const embedding = await embed(input.query);

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(
        JSON.stringify({
          courseId: input.courseId,
          embedding,
          limit: input.limit ?? 5,
        }),
      ),
    }),
  );

  const payload = JSON.parse(
    new TextDecoder().decode(response.Payload),
  );

  return c.json({
    query: input.query,
    ...payload,
  });
});