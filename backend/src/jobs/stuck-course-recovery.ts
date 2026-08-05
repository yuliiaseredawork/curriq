import { callCourseMetadata } from "../courses/course-metadata-client";
import { enqueueCourseJob, type CourseJob } from "./course-jobs";
import { logger } from "../observability/logger";

export async function handler() {
  const result = await callCourseMetadata({
    action: "listStuck",
    olderThanMinutes: 30,
  });
  let recovered = 0;

  for (const course of result.courses ?? []) {
    const transition = await callCourseMetadata({
      action: "transitionStatus",
      courseId: course.courseId,
      fromStatus: course.status,
      toStatus: "CREATED",
      errorMessage: null,
    });
    if (!transition.transitioned) continue;

    let job: CourseJob;
    if (course.sourceType === "PDF") {
      if (!course.sourceFileKey) continue;
      job = {
        kind: "PDF",
        courseId: course.courseId,
        userId: course.userId,
        fileKey: course.sourceFileKey,
        fileName: course.sourceFileName ?? "document.pdf",
      };
    } else {
      if (!course.sourceUrl) continue;
      job = {
        kind: "YOUTUBE",
        courseId: course.courseId,
        userId: course.userId,
        sourceType: course.sourceType,
        sourceUrl: course.sourceUrl,
        playlistId: course.playlistId ?? undefined,
      };
    }
    await enqueueCourseJob(job);
    recovered += 1;
  }

  logger.info("course_recovery.complete", { recovered });
  return { recovered };
}
