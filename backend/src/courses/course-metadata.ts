import {
  getCourseMetadata,
  getCourseMetadataForUser,
  listCourses,
  updateCourseStatus,
  upsertCourse,
  runMigrations,
  type SourceType,
} from '../storage/courses-repository';

type CourseStatus =
  | 'CREATED'
  | 'INGESTING'
  | 'PROCESSING'
  | 'OUTLINING'
  | 'READY'
  | 'FAILED';

type Event =
  | {
      action: 'upsert';
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
  }
  | { action: 'migrate' }
  | {
      action: 'updateStatus';
      courseId: string;
      status: CourseStatus;
      errorMessage?: string | null;
    }
  | {
      action: 'list';
      userId: string;
    }
  | {
      action: 'get';
      courseId: string;
    }
  | {
      action: 'getForUser';
      courseId: string;
      userId: string;
    };

export const handler = async (event: Event) => {
  if (event.action === 'migrate') {
    await runMigrations();
    return { status: 'OK', migrated: true };
  }

  if (event.action === 'upsert') {
    await upsertCourse(event);

    return {
      status: 'OK',
      courseId: event.courseId,
    };
  }

  if (event.action === 'updateStatus') {
    await updateCourseStatus({
      courseId: event.courseId,
      status: event.status,
      errorMessage: event.errorMessage ?? null,
    });
    
    return {
      status: 'OK',
      courseId: event.courseId,
    };
  }

  if (event.action === 'list') {
    return {
      courses: await listCourses(event.userId),
    };
  }

  if (event.action === 'get') {
    return {
      course: await getCourseMetadata(event.courseId),
    };
  }

  if (event.action === 'getForUser') {
    return {
      course: await getCourseMetadataForUser({
        courseId: event.courseId,
        userId: event.userId,
      }),
    };
  }

  throw new Error('Unsupported action');
};