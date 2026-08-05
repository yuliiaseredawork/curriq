import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

import { getCurrentUserId, UnauthorizedError } from "../../auth/current-user";
import { callCourseMetadata } from "../../courses/course-metadata-client";
import { pdfSourceKey, dedupDecision } from "../../courses/source-key";
import { enqueueCourseJob } from "../../jobs/course-jobs";

type RouteEnv = { Variables: { correlationId: string } };
export const coursesPdf = new Hono<RouteEnv>();

const s3 = new S3Client({});
const MAX_PDF_BYTES = Number(process.env.MAX_PDF_BYTES ?? 20 * 1024 * 1024);
const PDF_CONTENT_TYPE = "application/pdf";

const UploadUrlInput = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (name) => name.toLowerCase().endsWith(".pdf"),
      "Only .pdf files are accepted",
    ),
  contentType: z.literal(PDF_CONTENT_TYPE).default(PDF_CONTENT_TYPE),
});

const CompleteInput = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (name) => name.toLowerCase().endsWith(".pdf"),
      "Only .pdf files are accepted",
    ),
});

// The PDF is uploaded to a per-user staging key. The course row is NOT created
// here — we don't yet have the bytes, so we can't compute the content hash for
// dedup. Deferring row creation to /complete means a duplicate is blocked before
// any course exists (no placeholder row to clean up).
function stagingKey(userId: string, courseId: string) {
  return `pdf-uploads/${userId}/${courseId}.pdf`;
}

// POST /courses/pdf/upload-url — reserve a course id + presigned PUT for the PDF.
coursesPdf.post("/pdf/upload-url", async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const input = UploadUrlInput.parse(await c.req.json());

    const courseId = randomUUID();
    const fileKey = stagingKey(userId, courseId);

    const upload = await createPresignedPost(s3, {
      Bucket: process.env.RAW_BUCKET!,
      Key: fileKey,
      Expires: 900,
      Fields: { "Content-Type": input.contentType },
      Conditions: [
        ["content-length-range", 1, MAX_PDF_BYTES],
        ["eq", "$Content-Type", PDF_CONTENT_TYPE],
      ],
    });

    console.log(JSON.stringify({ event: "pdf.upload_url_created", courseId }));

    return c.json({
      courseId,
      upload,
      maximumBytes: MAX_PDF_BYTES,
      status: "AWAITING_UPLOAD",
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json(
      {
        error: "UPLOAD_URL_FAILED",
        message: e.message ?? "Could not create upload URL.",
      },
      500,
    );
  }
});

// POST /courses/:courseId/pdf/complete — hash the uploaded PDF, dedup, then
// create the course row and start background generation.
coursesPdf.post("/:courseId/pdf/complete", async (c) => {
  const courseId = c.req.param("courseId");
  try {
    const userId = await getCurrentUserId(c);
    const { fileName } = CompleteInput.parse(await c.req.json());

    // Rebuild the staging key from the authenticated userId — a user can only
    // complete their own upload (ownership enforced by the key path).
    const fileKey = stagingKey(userId, courseId);

    let bytes: Uint8Array;
    try {
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: process.env.RAW_BUCKET!,
          Key: fileKey,
        }),
      );
      if (!head.ContentLength || head.ContentLength > MAX_PDF_BYTES) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.RAW_BUCKET!,
            Key: fileKey,
          }),
        );
        return c.json(
          { error: "PDF_TOO_LARGE", maximumBytes: MAX_PDF_BYTES },
          413,
        );
      }
      if ((head.ContentType ?? "").toLowerCase() !== PDF_CONTENT_TYPE) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.RAW_BUCKET!,
            Key: fileKey,
          }),
        );
        return c.json({ error: "INVALID_PDF_MIME_TYPE" }, 415);
      }

      if (process.env.REQUIRE_MALWARE_SCAN !== "false") {
        const tags = await s3.send(
          new GetObjectTaggingCommand({
            Bucket: process.env.RAW_BUCKET!,
            Key: fileKey,
          }),
        );
        const scanStatus = tags.TagSet?.find(
          (tag) => tag.Key === "GuardDutyMalwareScanStatus",
        )?.Value;
        if (scanStatus && scanStatus !== "NO_THREATS_FOUND") {
          await s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.RAW_BUCKET!,
              Key: fileKey,
            }),
          );
          return c.json({ error: "UPLOAD_REJECTED_BY_MALWARE_SCAN" }, 422);
        }
        if (!scanStatus) {
          c.header("Retry-After", "5");
          return c.json({ error: "MALWARE_SCAN_PENDING" }, 425);
        }
      }

      const obj = await s3.send(
        new GetObjectCommand({ Bucket: process.env.RAW_BUCKET!, Key: fileKey }),
      );
      bytes = await obj.Body!.transformToByteArray();
    } catch {
      return c.json(
        {
          error: "UPLOAD_NOT_FOUND",
          message: "Upload not found. Please upload the file again.",
        },
        404,
      );
    }

    const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
    if (signature !== "%PDF-") {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.RAW_BUCKET!,
          Key: fileKey,
        }),
      );
      return c.json({ error: "INVALID_PDF_SIGNATURE" }, 415);
    }

    // Per-user dedup: block a second course from the same file content.
    const sourceKey = pdfSourceKey(bytes);
    const existing = await callCourseMetadata({
      action: "findBySourceKey",
      userId,
      sourceKey,
    });
    const decision = dedupDecision(existing?.course);
    if (decision.duplicate) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.RAW_BUCKET!,
          Key: fileKey,
        }),
      );
      return c.json(
        {
          error: "DUPLICATE_SOURCE",
          message: "You already have a course from this file.",
          existingCourseId: decision.existingCourseId,
          existingTitle: decision.existingTitle,
        },
        409,
      );
    }

    await callCourseMetadata({
      action: "upsert",
      courseId,
      userId,
      title: fileName,
      status: "CREATED",
      sourceType: "PDF",
      sourceFileKey: fileKey,
      sourceFileName: fileName,
      sourceKey,
    });

    await enqueueCourseJob({
      kind: "PDF",
      courseId,
      userId,
      fileKey,
      fileName,
      correlationId: c.get("correlationId"),
    });

    console.log(JSON.stringify({ event: "pdf.processing_queued", courseId }));

    return c.json({ courseId, status: "PROCESSING" }, 202);
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json(
      {
        error: "PDF_PROCESS_FAILED",
        message: e.message ?? "Could not start PDF processing.",
      },
      500,
    );
  }
});
