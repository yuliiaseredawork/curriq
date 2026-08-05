import {
  getCourseMetadata,
  getCourseMetadataForUser,
  listCourses,
  listStuckCourses,
  updateCourseStatus,
  transitionCourseStatus,
  findCourseBySourceKey,
  exportCoursesForUser,
  deleteCoursesForUser,
  upsertCourse,
  type SourceType,
} from "../storage/courses-repository";

type CourseStatus =
  "CREATED" | "INGESTING" | "PROCESSING" | "OUTLINING" | "READY" | "FAILED";

type Event =
  | {
      action: "upsert";
      courseId: string;
      userId: string;
      title: string;
      playlistUrl?: string | null;
      playlistId?: string;
      status: CourseStatus;
      errorMessage?: string | null;
      sourceType?: SourceType;
      sourceUrl?: string | null;
      sourceFileKey?: string | null;
      sourceFileName?: string | null;
      sourceKey?: string | null;
      targetDate?: string | null;
    }
  | {
      action: "updateStatus";
      courseId: string;
      status: CourseStatus;
      errorMessage?: string | null;
    }
  | {
      action: "transitionStatus";
      courseId: string;
      fromStatus: CourseStatus;
      toStatus: CourseStatus;
      errorMessage?: string | null;
    }
  | {
      action: "findBySourceKey";
      userId: string;
      sourceKey: string;
    }
  | {
      action: "list";
      userId: string;
    }
  | {
      action: "get";
      courseId: string;
    }
  | {
      action: "getForUser";
      courseId: string;
      userId: string;
    }
  | { action: "listStuck"; olderThanMinutes: number }
  | { action: "exportUser"; userId: string }
  | { action: "deleteUser"; userId: string };

export const handler = async (event: Event) => {
  if (event.action === "upsert") {
    await upsertCourse(event);

    return {
      status: "OK",
      courseId: event.courseId,
    };
  }

  if (event.action === "updateStatus") {
    await updateCourseStatus({
      courseId: event.courseId,
      status: event.status,
      errorMessage: event.errorMessage ?? null,
    });

    return {
      status: "OK",
      courseId: event.courseId,
    };
  }

  if (event.action === "transitionStatus") {
    const transitioned = await transitionCourseStatus({
      courseId: event.courseId,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      errorMessage: event.errorMessage ?? null,
    });

    return {
      status: "OK",
      courseId: event.courseId,
      transitioned,
    };
  }

  if (event.action === "findBySourceKey") {
    return {
      course: await findCourseBySourceKey({
        userId: event.userId,
        sourceKey: event.sourceKey,
      }),
    };
  }

  if (event.action === "list") {
    return {
      courses: await listCourses(event.userId),
    };
  }

  if (event.action === "get") {
    return {
      course: await getCourseMetadata(event.courseId),
    };
  }

  if (event.action === "getForUser") {
    return {
      course: await getCourseMetadataForUser({
        courseId: event.courseId,
        userId: event.userId,
      }),
    };
  }

  if (event.action === "listStuck") {
    return { courses: await listStuckCourses(event.olderThanMinutes) };
  }

  if (event.action === "exportUser") {
    return { courses: await exportCoursesForUser(event.userId) };
  }

  if (event.action === "deleteUser") {
    return { courses: await deleteCoursesForUser(event.userId) };
  }

  throw new Error("Unsupported action");
};
