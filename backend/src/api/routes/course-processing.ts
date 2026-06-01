import { Hono } from 'hono';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { loadCourseManifest } from '../../storage/course-artifacts';

const lambda = new LambdaClient({});

export const courseProcessing = new Hono();

async function invokeJson(functionName: string, payload: unknown) {
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  const text = new TextDecoder().decode(res.Payload);

  const parsed = text ? JSON.parse(text) : null;

  if (res.FunctionError) {
    throw new Error(JSON.stringify(parsed));
  }

  return parsed;
}

courseProcessing.post('/:courseId/process', async (c) => {
  const courseId = c.req.param('courseId');

  const manifest = await loadCourseManifest(courseId);

  const transcripts = manifest.transcripts ?? [];

  if (!transcripts.length) {
    return c.json(
      {
        error: 'NO_TRANSCRIPTS_FOUND',
        message: 'No successful transcripts found for this course.',
      },
      404,
    );
  }

  const results = [];

  for (const transcript of transcripts) {
    const payload = {
      courseId,
      playlistId: manifest.playlistId,
      videoId: transcript.videoId,
    };

    try {
      const embedded = await invokeJson(
        process.env.EMBED_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );

      const processed = await invokeJson(
        process.env.PROCESS_TRANSCRIPT_FUNCTION_NAME!,
        payload,
      );

      results.push({
        videoId: transcript.videoId,
        status: 'OK',
        embedded,
        processed,
      });
    } catch (e: any) {
      results.push({
        videoId: transcript.videoId,
        status: 'ERROR',
        error: String(e?.message ?? e),
      });
    }
  }

  return c.json({
    courseId,
    status: results.some((r) => r.status === 'OK') ? 'PROCESSED' : 'FAILED',
    results,
  });
});