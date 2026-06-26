import { courseIdentity } from '@/lib/courseIdentity';
import { courseStatusLabel } from '@/lib/learnerCopy';

// One row in "My Courses":
//  - FAILED  → non-link card with a plain-language reason + Retry.
//  - still generating → non-link card with a "Generating…" indicator.
//  - READY   → link into the course with a clear "Start learning" CTA.
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
  const view = courseStatusLabel(course.status);
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

  const header = (statusNode: React.ReactNode) => (
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
      {statusNode}
    </div>
  );

  if (isFailed) {
    return (
      <div className="block rounded-xl border border-red-900 bg-gray-900 p-5">
        {header(
          <span className="shrink-0 rounded-full border border-red-700 px-3 py-1 text-xs text-red-300">
            {course.status}
          </span>,
        )}
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

  if (view.generating) {
    return (
      <div className="block rounded-xl border border-gray-800 bg-gray-900 p-5">
        {header(
          <span className="shrink-0 rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 animate-pulse">
            {view.label}
          </span>,
        )}
        <p className="mt-3 text-sm text-gray-500">
          Building your course — you can leave this page; it’ll be ready here.
        </p>
      </div>
    );
  }

  // READY
  return (
    <a
      href={`/courses/${course.courseId}`}
      className="block rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3 hover:bg-gray-800 transition"
    >
      {header(null)}
      <span className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white">
        Start learning
      </span>
    </a>
  );
}
