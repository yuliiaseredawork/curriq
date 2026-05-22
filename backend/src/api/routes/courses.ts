import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { startCourseIngestion } from '../../ingest/start-course-ingestion';

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

  return c.json({
    courseId,
    status: 'INGESTION_STARTED',
    playlistUrl: input.playlistUrl,
    ingestion,
  });
});