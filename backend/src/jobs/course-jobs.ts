import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});

export type CourseJob =
  | {
      kind: "YOUTUBE";
      courseId: string;
      userId: string;
      correlationId?: string;
      sourceType: "YOUTUBE_PLAYLIST" | "YOUTUBE_VIDEO";
      sourceUrl: string;
      playlistId?: string;
      videoId?: string;
    }
  | {
      kind: "PDF";
      courseId: string;
      userId: string;
      correlationId?: string;
      fileKey: string;
      fileName: string;
    };

export async function enqueueCourseJob(job: CourseJob): Promise<void> {
  const queueUrl = process.env.COURSE_JOBS_QUEUE_URL;
  if (!queueUrl) throw new Error("COURSE_JOBS_QUEUE_NOT_CONFIGURED");
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(job),
      MessageAttributes: {
        courseId: { DataType: "String", StringValue: job.courseId },
        jobKind: { DataType: "String", StringValue: job.kind },
        ...(job.correlationId
          ? {
              correlationId: {
                DataType: "String",
                StringValue: job.correlationId,
              },
            }
          : {}),
      },
    }),
  );
}
