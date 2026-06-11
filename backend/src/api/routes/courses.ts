import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import {
  LambdaClient,
  InvocationType,
  InvokeCommand,
} from '@aws-sdk/client-lambda';

import {
  loadOutline,
  loadQuiz,
} from '../../storage/course-artifacts';

import { callCourseMetadata } from '../../courses/course-metadata-client';

import {
  getCourseProgress,
  getCourseMistakes,
} from '../../storage/study-state';

export const courses = new Hono();
const lambda = new LambdaClient({});

const Input = z.object({
  playlistUrl: z.string().url(),
});

courses.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);

  const courseId = randomUUID();

  await callCourseMetadata({
    action: 'upsert',
    courseId,
    title: 'Generating course...',
    playlistUrl: input.playlistUrl,
    status: 'CREATED',
  });

  await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.GENERATE_COURSE_FUNCTION_NAME!,
      InvocationType: InvocationType.Event,
      Payload: Buffer.from(
        JSON.stringify({
          courseId,
          playlistUrl: input.playlistUrl,
        }),
      ),
    }),
  );

  return c.json(
    {
      courseId,
      status: 'PROCESSING',
      playlistUrl: input.playlistUrl,
    },
    202,
  );
});

courses.get('/', async (c) => {
  const result = await callCourseMetadata({
    action: 'list',
  });

  return c.json(result);
});

courses.get('/:courseId/status', async (c) => {
  const courseId = c.req.param('courseId');

  const result = await callCourseMetadata({
    action: 'get',
    courseId,
  });

  if (!result.course) {
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
      },
      404,
    );
  }

  return c.json({
    courseId,
    status: result.course.status,
    title: result.course.title,
    errorMessage: result.course.errorMessage,
    updatedAt: result.course.updatedAt,
  });
});

courses.get('/:courseId/weak-concepts', async (c) => {
  const courseId = c.req.param('courseId');
  const userId = c.req.query('userId') ?? 'demo-user';

  try {
    const mistakes = await getCourseMistakes({
      userId,
      courseId,
    });

    const counts = new Map<string, number>();

    for (const mistake of mistakes) {
      const tags = mistake.conceptTags ?? [];

      for (const tag of tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    const weakConcepts = Array.from(counts.entries())
      .map(([concept, mistakeCount]) => ({
        concept,
        mistakeCount,
      }))
      .sort((a, b) => b.mistakeCount - a.mistakeCount)
      .slice(0, 5);

    return c.json({
      courseId,
      userId,
      weakConcepts,
    });
  } catch (e: any) {
    return c.json(
      {
        error: 'WEAK_CONCEPTS_NOT_AVAILABLE',
        message: e.message ?? 'Could not load weak concepts.',
      },
      404,
    );
  }
});

courses.get('/:courseId/resume', async (c) => {
  const courseId = c.req.param('courseId');
  const userId = c.req.query('userId') ?? 'demo-user';

  try {
    const outline = await loadOutline(courseId);

    const progressItems = await getCourseProgress({
      userId,
      courseId,
    });

    const answeredByChapter = new Map<string, Set<string>>();

    for (const item of progressItems) {
      if (!answeredByChapter.has(item.chapterId)) {
        answeredByChapter.set(item.chapterId, new Set());
      }

      answeredByChapter.get(item.chapterId)!.add(item.questionId);
    }

    for (const chapter of outline.chapters) {
      let quiz;

      try {
        quiz = await loadQuiz(courseId, chapter.id);
      } catch {
        return c.json({
          status: 'QUIZ_NOT_READY',
          courseId,
          chapterId: chapter.id,
          message: 'Quiz is not generated for the next chapter yet.',
        });
      }

      const answeredQuestions =
        answeredByChapter.get(chapter.id) ?? new Set<string>();

      const nextQuestion = quiz.questions.find(
        (q: any) => !answeredQuestions.has(q.id),
      );

      if (nextQuestion) {
        return c.json({
          status: 'CONTINUE',
          courseId,
          chapterId: chapter.id,
          questionId: nextQuestion.id,
          answeredQuestions: answeredQuestions.size,
          totalQuestions: quiz.questions.length,
        });
      }
    }

    return c.json({
      status: 'COMPLETED',
      courseId,
      message: 'All generated quizzes are completed.',
    });
  } catch (e: any) {
    return c.json(
      {
        error: 'RESUME_NOT_AVAILABLE',
        message: e.message ?? 'Could not calculate resume state.',
      },
      404,
    );
  }
});

courses.get('/:courseId/progress', async (c) => {
  const courseId = c.req.param('courseId');
  const userId = c.req.query('userId') ?? 'demo-user';

  try {
    const course = await loadOutline(courseId);
    const progressItems = await getCourseProgress({
      userId,
      courseId,
    });

    const answeredByChapter = new Map<string, Set<string>>();

    for (const item of progressItems) {
      if (!answeredByChapter.has(item.chapterId)) {
        answeredByChapter.set(item.chapterId, new Set());
      }

      answeredByChapter.get(item.chapterId)!.add(item.questionId);
    }

    const chapters = [];

    let totalQuestions = 0;
    let answeredQuestions = 0;

    for (const chapter of course.chapters) {
      let quizQuestionsCount = 0;

      try {
        const quiz = await loadQuiz(courseId, chapter.id);
        quizQuestionsCount = quiz.questions?.length ?? 0;
      } catch {
        quizQuestionsCount = 0;
      }

      const answeredCount = answeredByChapter.get(chapter.id)?.size ?? 0;

      totalQuestions += quizQuestionsCount;
      answeredQuestions += answeredCount;

      const completionPercent =
        quizQuestionsCount > 0
          ? Math.round((answeredCount / quizQuestionsCount) * 100)
          : 0;

      chapters.push({
        chapterId: chapter.id,
        title: chapter.title,
        answeredQuestions: answeredCount,
        totalQuestions: quizQuestionsCount,
        completionPercent,
        status:
          quizQuestionsCount === 0
            ? 'NOT_STARTED'
            : answeredCount >= quizQuestionsCount
              ? 'COMPLETED'
              : answeredCount > 0
                ? 'IN_PROGRESS'
                : 'NOT_STARTED',
      });
    }

    const completionPercent =
      totalQuestions > 0
        ? Math.round((answeredQuestions / totalQuestions) * 100)
        : 0;

    return c.json({
      courseId,
      userId,
      answeredQuestions,
      totalQuestions,
      completionPercent,
      chapters,
    });
  } catch (e: any) {
    return c.json(
      {
        error: 'PROGRESS_NOT_AVAILABLE',
        message: e.message ?? 'Could not load course progress.',
      },
      404,
    );
  }
});

courses.get('/:courseId', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const metadataResult = await callCourseMetadata({
      action: 'get',
      courseId,
    });

    const outline = await loadOutline(courseId);

    return c.json({
      courseId,
      metadata: metadataResult.course,
      outline,
    });
  } catch {
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
        message: `No saved course found for ${courseId}`,
      },
      404,
    );
  }
});

courses.get('/:courseId/quizzes/:chapterId', async (c) => {
  const courseId = c.req.param('courseId');
  const chapterId = c.req.param('chapterId');

  try {
    const quiz = await loadQuiz(courseId, chapterId);

    return c.json({
      courseId,
      chapterId,
      quiz,
    });
  } catch {
    return c.json(
      {
        error: 'QUIZ_NOT_FOUND',
        message: `No saved quiz found for ${courseId}/${chapterId}`,
      },
      404,
    );
  }
});