import {
  getCourseMetadata,
  listCourses,
  updateCourseStatus,
  upsertCourse,
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
      title: string;
      playlistUrl: string;
      playlistId?: string;
      status: CourseStatus;
      errorMessage?: string | null;
    }
  | {
      action: 'updateStatus';
      courseId: string;
      status: CourseStatus;
      errorMessage?: string | null;
    }
  | {
      action: 'list';
    }
  | {
      action: 'get';
      courseId: string;
    };

export const handler = async (event: Event) => {
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
      courses: await listCourses(),
    };
  }

  if (event.action === 'get') {
    return {
      course: await getCourseMetadata(event.courseId),
    };
  }

  throw new Error('Unsupported action');
};