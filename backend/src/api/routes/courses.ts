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
  loadQuizManifest,
  updateChapterQuizStatus,
} from '../../storage/course-artifacts';

import { callCourseMetadata } from '../../courses/course-metadata-client';

import {
  getCourseProgress,
  getCourseMistakes,
} from '../../storage/study-state';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';

export const courses = new Hono();
const lambda = new LambdaClient({});

const Input = z.object({
  playlistUrl: z.string().url(),
});

function courseAccessDeniedResponse(c: any) {
  return c.json(
    {
      error: 'COURSE_NOT_FOUND',
      message: 'Course not found or you do not have access.',
    },
    404,
  );
}

async function requireCourseAccess(c: any, courseId: string) {
  const userId = await getCurrentUserId(c);

  const result = await callCourseMetadata({
    action: 'getForUser',
    courseId,
    userId,
  });

  if (!result.course) {
    throw new Error('COURSE_ACCESS_DENIED');
  }

  return { userId, course: result.course };
}

courses.post('/', async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);
  const userId = await getCurrentUserId(c);
  const courseId = randomUUID();

  console.log('[POST /courses]', { courseId, userId });

  await callCourseMetadata({
    action: 'upsert',
    courseId,
    userId,
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
          userId,
        }),
      ),
    }),
  );

  console.log('[POST /courses] GenerateCourseFn invoked async', { courseId });

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
  const userId = await getCurrentUserId(c);

  const result = await callCourseMetadata({
    action: 'list',
    userId,
  });

  return c.json(result);
});

courses.get('/:courseId/status', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const { course } = await requireCourseAccess(c, courseId);

    return c.json({
      courseId,
      status: course.status,
      title: course.title,
      errorMessage: course.errorMessage,
      updatedAt: course.updatedAt,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json({ error: 'COURSE_NOT_FOUND' }, 404);
  }
});

courses.get('/:courseId/weak-concepts', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const { userId } = await requireCourseAccess(c, courseId);

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
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
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

  try {
    const { userId } = await requireCourseAccess(c, courseId);

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
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
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

  try {
    const { userId } = await requireCourseAccess(c, courseId);

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
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json(
      {
        error: 'PROGRESS_NOT_AVAILABLE',
        message: e.message ?? 'Could not load course progress.',
      },
      404,
    );
  }
});

courses.get('/:courseId/quizzes/:chapterId', async (c) => {
  const courseId = c.req.param('courseId');
  const chapterId = c.req.param('chapterId');

  try {
    await requireCourseAccess(c, courseId);

    const quiz = await loadQuiz(courseId, chapterId);

    return c.json({
      courseId,
      chapterId,
      quiz,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json(
      {
        error: 'QUIZ_NOT_FOUND',
        message: `No saved quiz found for ${courseId}/${chapterId}`,
      },
      404,
    );
  }
});

courses.get('/:courseId/quiz-status', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    await requireCourseAccess(c, courseId);

    const outline = await loadOutline(courseId);
    const chapterIds = (outline.chapters ?? []).map((ch: any) => ch.id);
    const manifest = await loadQuizManifest(courseId, chapterIds);

    const chapters = chapterIds.map((id: string) => {
      const record = manifest.chapters[id];
      return {
        chapterId: id,
        status: record.status,
        questionCount: record.questionCount,
        errorMessage: record.errorMessage,
        updatedAt: record.updatedAt,
      };
    });

    return c.json({ courseId, chapters });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json(
      {
        error: 'QUIZ_STATUS_NOT_AVAILABLE',
        message: e.message ?? 'Could not load quiz status.',
      },
      404,
    );
  }
});

courses.post('/:courseId/chapters/:chapterId/quiz/retry', async (c) => {
  const courseId = c.req.param('courseId');
  const chapterId = c.req.param('chapterId');

  try {
    await requireCourseAccess(c, courseId);

    const outline = await loadOutline(courseId);
    const exists = (outline.chapters ?? []).some((ch: any) => ch.id === chapterId);
    if (!exists) {
      return c.json({ error: 'CHAPTER_NOT_FOUND' }, 404);
    }

    await updateChapterQuizStatus(courseId, chapterId, { status: 'GENERATING' });

    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.GENERATE_CHAPTER_QUIZ_FUNCTION_NAME!,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(JSON.stringify({ courseId, chapterId })),
      }),
    );

    console.log('[POST quiz/retry] queued', { courseId, chapterId });

    return c.json({ courseId, chapterId, status: 'GENERATING' }, 202);
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json(
      {
        error: 'QUIZ_RETRY_FAILED',
        message: e.message ?? 'Could not start quiz generation.',
      },
      500,
    );
  }
});

courses.get('/:courseId', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const { course } = await requireCourseAccess(c, courseId);
    const outline = await loadOutline(courseId);

    return c.json({
      courseId,
      metadata: course,
      outline,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return courseAccessDeniedResponse(c);
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
        message: `No saved course found for ${courseId}`,
      },
      404,
    );
  }
});
