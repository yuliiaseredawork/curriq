// Background quiz generation for a single chapter.
// Invoked (async / Event) once per chapter after the course outline is saved,
// and by the manual retry endpoint. Tracks status via per-chapter status
// objects so parallel invocations never clobber each other.

import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

import { generateQuiz } from '../agents/quiz-writer';
import {
  loadOutline,
  saveQuiz,
  updateChapterQuizStatus,
} from '../storage/course-artifacts';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
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

  const raw = response.Payload
    ? new TextDecoder().decode(response.Payload)
    : '';
  if (response.FunctionError) {
    throw new Error(`SearchChunksFn failed: ${response.FunctionError} ${raw}`);
  }
  return raw ? JSON.parse(raw) : { results: [] };
}

export const handler = async (event: {
  courseId: string;
  chapterId: string;
}) => {
  const { courseId, chapterId } = event;
  console.log('[generate-chapter-quiz] start', { courseId, chapterId });

  try {
    await updateChapterQuizStatus(courseId, chapterId, { status: 'GENERATING' });
    console.log('[generate-chapter-quiz] status → GENERATING', { courseId, chapterId });

    const outline = await loadOutline(courseId);
    const chapter = outline.chapters?.find((ch: any) => ch.id === chapterId);
    if (!chapter) {
      throw new Error(`Chapter ${chapterId} not found in outline`);
    }

    const query = [
      chapter.title,
      chapter.summary,
      ...(chapter.learning_objectives ?? []),
    ].join('\n');

    const search = await searchChunks({ courseId, query, limit: 10 });
    if (!search.results?.length) {
      throw new Error('No source chunks found for chapter');
    }

    const quiz = await generateQuiz({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      learningObjectives: chapter.learning_objectives ?? [],
      chunks: search.results,
    });

    await saveQuiz(courseId, chapterId, quiz);
    await updateChapterQuizStatus(courseId, chapterId, {
      status: 'READY',
      questionCount: quiz.questions.length,
    });

    console.log('[generate-chapter-quiz] status → READY', {
      courseId,
      chapterId,
      questionCount: quiz.questions.length,
    });

    return { courseId, chapterId, status: 'READY', questionCount: quiz.questions.length };
  } catch (e: any) {
    const errorMessage = String(e?.message ?? e);
    console.error('[generate-chapter-quiz] status → FAILED', {
      courseId,
      chapterId,
      error: errorMessage,
    });

    try {
      await updateChapterQuizStatus(courseId, chapterId, {
        status: 'FAILED',
        errorMessage,
      });
    } catch (statusErr: any) {
      console.error('[generate-chapter-quiz] could not write FAILED status', {
        courseId,
        chapterId,
        statusError: String(statusErr?.message ?? statusErr),
      });
    }

    throw e;
  }
};
