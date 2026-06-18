// Retrieval client for evals. Reuses the same path as the production API:
// embed the query with OpenAI, then invoke SearchChunksFn (pgvector search).
// This avoids needing direct VPC/DB access from a laptop.

import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { requireEnv } from './env';
import type { EvalChunk } from './types';

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  return (_openai ??= new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') }));
}

const lambda = new LambdaClient({});

export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

export async function searchChunks(input: {
  courseId: string;
  query: string;
  limit: number;
}): Promise<EvalChunk[]> {
  const embedding = await embed(input.query);

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: requireEnv('SEARCH_CHUNKS_FUNCTION_NAME'),
      Payload: Buffer.from(
        JSON.stringify({
          courseId: input.courseId,
          embedding,
          limit: input.limit,
        }),
      ),
    }),
  );

  const raw = response.Payload
    ? new TextDecoder().decode(response.Payload)
    : '';
  const parsed = raw ? JSON.parse(raw) : {};

  if (response.FunctionError) {
    throw new Error(
      `SearchChunksFn failed: ${response.FunctionError} ${raw}`,
    );
  }

  return (parsed.results ?? []) as EvalChunk[];
}
