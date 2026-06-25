import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import { pdfSourceKey, dedupDecision } from '../../courses/source-key';

export const coursesPdf = new Hono();

const s3 = new S3Client({});
const lambda = new LambdaClient({});

const UploadUrlInput = z.object({
  fileName: z.string().min(1),
  contentType: z.string().optional(),
});

const CompleteInput = z.object({
  fileName: z.string().min(1),
});

// The PDF is uploaded to a per-user staging key. The course row is NOT created
// here — we don't yet have the bytes, so we can't compute the content hash for
// dedup. Deferring row creation to /complete means a duplicate is blocked before
// any course exists (no placeholder row to clean up).
function stagingKey(userId: string, courseId: string) {
  return `pdf-uploads/${userId}/${courseId}.pdf`;
}

// POST /courses/pdf/upload-url — reserve a course id + presigned PUT for the PDF.
coursesPdf.post('/pdf/upload-url', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const input = UploadUrlInput.parse(await c.req.json());

    const courseId = randomUUID();
    const fileKey = stagingKey(userId, courseId);

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: process.env.RAW_BUCKET!,
        Key: fileKey,
        ContentType: input.contentType ?? 'application/pdf',
      }),
      { expiresIn: 900 },
    );

    console.log('[POST /courses/pdf/upload-url]', { courseId, userId, fileKey });

    return c.json({ courseId, uploadUrl, fileKey, status: 'AWAITING_UPLOAD' });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json(
      { error: 'UPLOAD_URL_FAILED', message: e.message ?? 'Could not create upload URL.' },
      500,
    );
  }
});

// POST /courses/:courseId/pdf/complete — hash the uploaded PDF, dedup, then
// create the course row and start background generation.
coursesPdf.post('/:courseId/pdf/complete', async (c) => {
  const courseId = c.req.param('courseId');
  try {
    const userId = await getCurrentUserId(c);
    const { fileName } = CompleteInput.parse(await c.req.json());

    // Rebuild the staging key from the authenticated userId — a user can only
    // complete their own upload (ownership enforced by the key path).
    const fileKey = stagingKey(userId, courseId);

    let bytes: Uint8Array;
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: process.env.RAW_BUCKET!, Key: fileKey }),
      );
      bytes = await obj.Body!.transformToByteArray();
    } catch {
      return c.json(
        { error: 'UPLOAD_NOT_FOUND', message: 'Upload not found. Please upload the file again.' },
        404,
      );
    }

    // Per-user dedup: block a second course from the same file content.
    const sourceKey = pdfSourceKey(bytes);
    const existing = await callCourseMetadata({ action: 'findBySourceKey', userId, sourceKey });
    const decision = dedupDecision(existing?.course);
    if (decision.duplicate) {
      return c.json(
        {
          error: 'DUPLICATE_SOURCE',
          message: 'You already have a course from this file.',
          existingCourseId: decision.existingCourseId,
          existingTitle: decision.existingTitle,
        },
        409,
      );
    }

    await callCourseMetadata({
      action: 'upsert',
      courseId,
      userId,
      title: fileName,
      status: 'CREATED',
      sourceType: 'PDF',
      sourceFileKey: fileKey,
      sourceFileName: fileName,
      sourceKey,
    });

    await lambda.send(
      new InvokeCommand({
        FunctionName: process.env.GENERATE_COURSE_FROM_PDF_FUNCTION_NAME!,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(JSON.stringify({ courseId, userId, fileKey, fileName })),
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
