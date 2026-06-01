import { Hono } from 'hono';
import { z } from 'zod';
import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

import { loadOutline, saveQuiz } from '../../storage/course-artifacts';
import { generateQuiz } from '../../agents/quiz-writer';

const Input = z.object({
  courseId: z.string(),
  chapterId: z.string().optional(),
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

  return JSON.parse(new TextDecoder().decode(response.Payload));
}

export const quizzes = new Hono();

quizzes.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);

  const outline = await loadOutline(input.courseId);

  const chapters = input.chapterId
    ? outline.chapters.filter((ch: any) => ch.id === input.chapterId)
    : outline.chapters;

  if (!chapters.length) {
    return c.json(
      {
        error: 'CHAPTER_NOT_FOUND',
        message: 'No matching chapter found in outline.',
      },
      404,
    );
  }

  const results = [];

  for (const chapter of chapters) {
    const query = [
      chapter.title,
      chapter.summary,
      ...(chapter.learning_objectives ?? []),
    ].join('\n');

    const search = await searchChunks({
      courseId: input.courseId,
      query,
      limit: input.limit ?? 10,
    });

    if (!search.results?.length) {
      results.push({
        chapterId: chapter.id,
        status: 'NO_CHUNKS_FOUND',
      });
      continue;
    }

    const quiz = await generateQuiz({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      learningObjectives: chapter.learning_objectives,
      chunks: search.results,
    });

    const saved = await saveQuiz(input.courseId, chapter.id, quiz);

    results.push({
      chapterId: chapter.id,
      status: 'OK',
      questionCount: quiz.questions.length,
      saved,
      quiz,
    });
  }

  return c.json({
    courseId: input.courseId,
    results,
  });
});