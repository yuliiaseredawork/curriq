import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { startCourseIngestion } from '../../ingest/start-course-ingestion';
import { loadOutline } from '../../storage/course-artifacts';
import { loadQuiz } from '../../storage/course-artifacts';
import { saveCourseManifest } from '../../storage/course-artifacts';

const CreateCourseInput = z.object({
  playlistUrl: z.string().url(),
});

export const courses = new Hono();

courses.post('/', async (c) => {
  const body = await c.req.json();
  const input = CreateCourseInput.parse(body);

  const courseId = randomUUID();

  const ingestion = await startCourseIngestion({
    courseId,
    playlistUrl: input.playlistUrl,
  });

  const manifest = {
    courseId,
    playlistUrl: input.playlistUrl,
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

  const savedManifest = await saveCourseManifest(courseId, manifest);

  return c.json({
    courseId,
    status: 'INGESTION_STARTED',
    playlistUrl: input.playlistUrl,
    ingestion,
    manifest: savedManifest,
  });
});

courses.get('/:courseId', async (c) => {
  const courseId = c.req.param('courseId');

  try {
    const outline = await loadOutline(courseId);

    return c.json({
      courseId,
      outline,
    });
  } catch (e: any) {
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
        message: `No saved outline found for course ${courseId}`,
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