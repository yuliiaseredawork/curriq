import { courseIdentity } from '@/lib/courseIdentity';

// One row in "My Courses". A normal course links to its page; a FAILED course
// renders as a non-link card showing a plain-language reason and a Retry button
// (so a failed row is never a dead link into a broken course page).
export function CourseCard({
  course,
  onRetry,
  retrying = false,
}: {
  course: any;
  onRetry: (courseId: string) => void;
  retrying?: boolean;
}) {
  const isFailed = course.status === 'FAILED';
  const id = courseIdentity(course.title);

  const sourceLabel =
    course.sourceType === 'PDF'
      ? 'PDF'
      : course.sourceType === 'YOUTUBE_VIDEO'
        ? 'YouTube video'
        : 'YouTube playlist';
  const sourceLine =
    course.sourceType === 'PDF'
      ? course.sourceFileName
      : course.sourceUrl ?? course.playlistUrl;

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`shrink-0 rounded-lg border ${id.accentClass} px-2 py-0.5 text-sm`}
            title={id.category}
          >
            {id.icon}
          </span>
          <h3 className="text-lg font-semibold">{course.title ?? 'Untitled course'}</h3>
          <span className="shrink-0 rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-400">
            {sourceLabel}
          </span>
        </div>
        <p className="text-sm text-gray-400 break-all">{sourceLine}</p>
      </div>
      <span
        className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
          isFailed ? 'border-red-700 text-red-300' : 'border-gray-700 text-gray-300'
        }`}
      >
        {course.status}
      </span>
    </div>
  );

  if (isFailed) {
    return (
      <div className="block rounded-xl border border-red-900 bg-gray-900 p-5">
        {header}
        <p className="mt-3 text-sm text-red-300">
          {course.errorMessage ?? 'Course generation failed. Please try again.'}
        </p>
        <button
          type="button"
          onClick={() => onRetry(course.courseId)}
          disabled={retrying}
          className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <a
      href={`/courses/${course.courseId}`}
      className="block rounded-xl border border-gray-800 bg-gray-900 p-5 hover:bg-gray-800 transition"
    >
      {header}
    </a>
  );
}
