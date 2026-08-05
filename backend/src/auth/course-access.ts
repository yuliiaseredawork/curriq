import { getCurrentUserId, UnauthorizedError } from "./current-user";
import { callCourseMetadata } from "../courses/course-metadata-client";

export class CourseAccessDeniedError extends Error {
  constructor() {
    super("COURSE_ACCESS_DENIED");
    this.name = "CourseAccessDeniedError";
  }
}

export async function requireCourseAccess(c: any, courseId: string) {
  const userId = await getCurrentUserId(c);
  const result = await callCourseMetadata({
    action: "getForUser",
    courseId,
    userId,
  });
  if (!result.course) throw new CourseAccessDeniedError();
  return { userId, course: result.course };
}

export function isAccessError(error: unknown): boolean {
  return (
    error instanceof CourseAccessDeniedError ||
    (error instanceof Error && error.message === "COURSE_ACCESS_DENIED")
  );
}

export function courseAccessDeniedResponse(c: any) {
  return c.json(
    {
      error: "COURSE_NOT_FOUND",
      message: "Course not found or you do not have access.",
    },
    404,
  );
}

export { UnauthorizedError };
