import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';

export const coursesPdf = new Hono();

const s3 = new S3Client({});
const lambda = new LambdaClient({});

const UploadUrlInput = z.object({
  fileName: z.string().min(1),
  contentType: z.string().optional(),
});

// POST /courses/pdf/upload-url — reserve a course + presigned PUT URL for the PDF.
coursesPdf.post('/pdf/upload-url', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const input = UploadUrlInput.parse(await c.req.json());

    const courseId = randomUUID();
    const fileKey = `courses/${courseId}/source.pdf`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.RAW_BUCKET!,
        Key: fileKey,
        ContentType: input.contentType ?? 'application/pdf',
      }),
      { expiresIn: 900 },
    );

    await callCourseMetadata({
      action: 'upsert',
      courseId,
      userId,
      title: input.fileName,
      status: 'CREATED',
      sourceType: 'PDF',
      sourceFileKey: fileKey,
      sourceFileName: input.fileName,
    });

    console.log('[POST /courses/pdf/upload-url]', { courseId, userId, fileKey });

    return c.json({ courseId, uploadUrl, fileKey, status: 'CREATED' });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json(
      { error: 'UPLOAD_URL_FAILED', message: e.message ?? 'Could not create upload URL.' },
      500,
    );
  }
});

// POST /courses/:courseId/pdf/complete — start background PDF course generation.
coursesPdf.post('/:courseId/pdf/complete', async (c) => {
  const courseId = c.req.param('courseId');
  try {
    const userId = await getCurrentUserId(c);

    const ownership = await callCourseMetadata({ action: 'getForUser', courseId, userId });
    if (!ownership.course) {
      return c.json(
        { error: 'COURSE_NOT_FOUND', message: 'Course not found or you do not have access.' },
        404,
      );
    }

    const course = ownership.course;
    if (course.sourceType !== 'PDF' || !course.sourceFileKey) {
      return c.json(
        { error: 'NOT_A_PDF_COURSE', message: 'This course is not a PDF course.' },
        400,
      );
    }

    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.GENERATE_COURSE_FROM_PDF_FUNCTION_NAME!,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(
          JSON.stringify({
            courseId,
            userId,
            fileKey: course.sourceFileKey,
            fileName: course.sourceFileName ?? 'document.pdf',
          }),
        ),
      }),
    );

    console.log('[POST /courses/:courseId/pdf/complete] queued', { courseId, userId });

    return c.json({ courseId, status: 'PROCESSING' }, 202);
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json(
      { error: 'PDF_PROCESS_FAILED', message: e.message ?? 'Could not start PDF processing.' },
      500,
    );
  }
});
