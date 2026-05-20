import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getPlaylistVideos } from '../../youtube/playlist';

const CreateCourseInput = z.object({
  playlistUrl: z.string().url(),
});

export const courses = new Hono();

courses.post('/', async (c) => {
  const body = await c.req.json();
  const input = CreateCourseInput.parse(body);

  const courseId = randomUUID();
  const videoIds = await getPlaylistVideos(input.playlistUrl);

  return c.json({
    courseId,
    status: 'CREATED',
    playlistUrl: input.playlistUrl,
    videoIds,
    next: 'fetch transcripts',
  });
});