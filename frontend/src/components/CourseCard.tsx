import { courseIdentity } from "@/lib/courseIdentity";
import {
  courseStatusLabel,
  courseCardView,
  primaryButtonClass,
  secondaryButtonClass,
  importFailureMessage,
  IMPORT_NEEDS_ATTENTION_BADGE,
  IMPORT_FAILED_BODY,
  IMPORT_RETRY_LABEL,
} from "@/lib/learnerCopy";
import { interactiveCard, subtleCard } from "@/lib/ui";

// Optional per-course progress (best-effort, fetched on the home page). When
// present and started, the READY card shows "Continue" + a progress hint.
export type CourseCardProgress = {
  completionPercent?: number | null;
  answeredQuestions?: number | null;
  totalQuestions?: number | null;
};

// One card in "My Courses":
//  - FAILED  → non-link card with a plain-language reason + Retry.
//  - still generating → non-link card with a "Generating…" indicator.
//  - READY   → link into the course; "Continue" when started, else "Start course".
export function CourseCard({
  course,
  onRetry,
  retrying = false,
  progress,
  ctaEmphasis = "primary",
}: {
  course: any;
  onRetry: (courseId: string) => void;
  retrying?: boolean;
  progress?: CourseCardProgress | null;
  /** "secondary" when another element on the screen (e.g. the Today's-plan
   *  card) is the one primary action — keeps one blue CTA per viewport. */
  ctaEmphasis?: "primary" | "secondary";
}) {
  const isFailed = course.status === "FAILED";
  const view = courseStatusLabel(course.status);
  const id = courseIdentity(course.title);

  const sourceLabel =
    course.sourceType === "PDF"
      ? "PDF"
      : course.sourceType === "YOUTUBE_VIDEO"
        ? "YouTube video"
        : "YouTube playlist";
  // PDF keeps its (clean) file name; YouTube shows just the label, never the
  // raw URL.
  const sourceLine = course.sourceType === "PDF" ? course.sourceFileName : null;

  const header = (statusNode: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-xl ${id.accentClass}`}
          title={id.category}
        >
          {id.icon}
        </span>
        <div className="min-w-0 space-y-1.5">
          <h3 className="line-clamp-2 font-semibold leading-snug">
            {course.title ?? "Untitled course"}
          </h3>
          <span className="inline-block rounded-full border border-white/10 px-2 py-0.5 text-xs text-gray-400">
            {sourceLabel}
          </span>
          {sourceLine && (
            <p className="truncate text-sm text-gray-500">{sourceLine}</p>
          )}
        </div>
      </div>
      {statusNode}
    </div>
  );

  // FAILED — calm, not alarming: this card is meant to live in the separate
  // "Imports that need attention" section, never the main grid, so it stays
  // quiet (subtleCard + a thin accent border) rather than a red alarm block.
  if (isFailed) {
    return (
      <div
        className={`${subtleCard} flex h-full flex-col border-l-2 border-l-red-500/40 p-5`}
      >
        {header(
          <span className="shrink-0 rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-400">
            {IMPORT_NEEDS_ATTENTION_BADGE}
          </span>,
        )}
        <p className="mt-3 text-sm text-gray-300">
          {importFailureMessage(course.errorMessage)}
        </p>
        <p className="mt-1 text-xs text-gray-500">{IMPORT_FAILED_BODY}</p>
        <button
          type="button"
          onClick={() => onRetry(course.courseId)}
          disabled={retrying}
          className={`${secondaryButtonClass} mt-3 self-start px-4 py-2 text-sm`}
        >
          {retrying ? "Retrying…" : IMPORT_RETRY_LABEL}
        </button>
      </div>
    );
  }

  if (view.generating) {
    return (
      <div className={`${subtleCard} flex h-full flex-col p-5`}>
        {header(
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            {view.label}
          </span>,
        )}
        <p className="mt-3 text-sm text-gray-500">
          You can leave this page — it’ll be ready here.{" "}
          <a
            href="/demo"
            className="text-gray-400 underline decoration-white/20 hover:text-gray-200"
          >
            Try the demo course while you wait
          </a>
        </p>
      </div>
    );
  }

  // READY — open the course hub (the learning path). The session is started
  // from there, so the card has one clear action. The CTA + status line adapt
  // to progress when it's available ("Continue" / "17% in progress").
  const cardView = courseCardView(progress);
  return (
    <a
      href={`/courses/${course.courseId}`}
      className={`${interactiveCard} group flex h-full flex-col p-5`}
    >
      {header(
        <span
          aria-hidden="true"
          className="shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300"
        >
          →
        </span>,
      )}
      <p className="mt-2 text-xs text-gray-500">{cardView.statusLine}</p>
      <span
        className={`${
          ctaEmphasis === "secondary"
            ? secondaryButtonClass
            : primaryButtonClass
        } mt-3 self-start px-4 py-2 text-sm`}
      >
        {cardView.ctaLabel}
      </span>
    </a>
  );
}
