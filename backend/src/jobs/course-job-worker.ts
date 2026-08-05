import type { SQSBatchResponse, SQSEvent } from "aws-lambda";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { ChangeMessageVisibilityCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { CourseJob } from "./course-jobs";
import { logger } from "../observability/logger";
import { callCourseMetadata } from "../courses/course-metadata-client";

const lambda = new LambdaClient({});
const sqs = new SQSClient({});

async function invoke(functionName: string, payload: unknown) {
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  if (response.FunctionError) {
    const detail = response.Payload
      ? new TextDecoder().decode(response.Payload)
      : response.FunctionError;
    throw new Error(`COURSE_JOB_FAILED:${detail}`);
  }
}

async function processJob(job: CourseJob) {
  logger.info("course_job.started", {
    correlationId: job.correlationId,
    courseId: job.courseId,
    kind: job.kind,
  });
  const metadata = await callCourseMetadata({
    action: "getForUser",
    courseId: job.courseId,
    userId: job.userId,
  });
  if (!metadata.course) throw new Error("COURSE_JOB_OWNER_MISMATCH");
  if (metadata.course.status === "READY") {
    logger.info("course_job.idempotent_skip", { courseId: job.courseId });
    return;
  }
  if (job.kind === "PDF") {
    await invoke(process.env.GENERATE_COURSE_FROM_PDF_FUNCTION_NAME!, job);
    return;
  }
  await invoke(process.env.GENERATE_COURSE_FUNCTION_NAME!, {
    ...job,
    playlistUrl: job.sourceUrl,
  });
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchResponse["batchItemFailures"] = [];
  for (const record of event.Records) {
    let correlationId: string | undefined;
    try {
      const job = JSON.parse(record.body) as CourseJob;
      correlationId = job.correlationId;
      await processJob(job);
      logger.info("course_job.completed", {
        messageId: record.messageId,
        correlationId,
        courseId: job.courseId,
      });
    } catch (error) {
      const receiveCount = Number(
        record.attributes.ApproximateReceiveCount ?? 1,
      );
      const retryAfterSeconds = Math.min(15 * 60, 30 * 2 ** (receiveCount - 1));
      if (process.env.COURSE_JOBS_QUEUE_URL) {
        await sqs
          .send(
            new ChangeMessageVisibilityCommand({
              QueueUrl: process.env.COURSE_JOBS_QUEUE_URL,
              ReceiptHandle: record.receiptHandle,
              VisibilityTimeout: retryAfterSeconds,
            }),
          )
          .catch(() => undefined);
      }
      logger.error("course_job.failed", {
        messageId: record.messageId,
        correlationId,
        receiveCount,
        retryAfterSeconds,
        error: error instanceof Error ? error.message : String(error),
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };
}
