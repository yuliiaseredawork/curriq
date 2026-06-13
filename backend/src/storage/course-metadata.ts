import {
  getCourseMetadata,
  listCourses,
  updateCourseStatus,
  upsertCourse,
  getCourseMetadataForUser,
} from '../storage/courses-repository';

type Event =
  | {
      action: 'upsert';
      courseId: string;
      title: string;
      playlistUrl: string;
      playlistId?: string;
      status: 'CREATED' | 'PROCESSING' | 'READY' | 'FAILED';
    }
  | {
      action: 'updateStatus';
      courseId: string;
      status: 'CREATED' | 'PROCESSING' | 'READY' | 'FAILED';
    }
  | {
      action: 'list';
    }
  | {
    action: 'getForUser';
    courseId: string;
    userId: string;
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

  if (event.action === 'getForUser') {
    return {
      course: await getCourseMetadataForUser({
        courseId: event.courseId,
        userId: event.userId,
      }),
    };
  }

  if (event.action === 'updateStatus') {
    await updateCourseStatus({
      courseId: event.courseId,
      status: event.status,
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