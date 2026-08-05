import { courseIdentity } from "@/lib/courseIdentity";
import { elevatedCard, progressTrack, progressFill } from "@/lib/ui";
import {
  PREVIEW_COURSE_TITLE,
  PREVIEW_CHAPTER_DONE,
  PREVIEW_CHAPTER_CURRENT,
  PREVIEW_QUESTION,
  PREVIEW_TAKEAWAY,
  PREVIEW_REVIEW_NOTE,
} from "@/lib/landingCopy";

/**
 * A CSS-only mock of the in-app learning loop (add content → guided path →
 * practice → coach feedback → review) for the signed-out landing page. Reuses
 * the same visual tokens and identity logic as the real course/session screens
 * — courseIdentity() for the icon/accent, the shared card + progress-bar
 * classes — so it reads as a real app card, not a placeholder graphic. No
 * screenshots, no real data, no API calls.
 */
export function ProductPreview() {
  const id = courseIdentity(PREVIEW_COURSE_TITLE);

  return (
    <div className={`${elevatedCard} relative overflow-hidden p-5 sm:p-6`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl"
      />

      <div className="relative space-y-4">
        {/* Course header — the result of "add content". */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-sm ${id.accentClass}`}
            >
              {id.icon}
            </span>
            <span className="truncate text-sm font-medium text-gray-100">
              {PREVIEW_COURSE_TITLE}
            </span>
          </div>
          <span className="shrink-0 text-xs text-gray-500">62%</span>
        </div>
        <div className={progressTrack}>
          <div className={progressFill} style={{ width: "62%" }} />
        </div>

        {/* Guided learning path. */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-gray-600">
            <span aria-hidden="true">●</span>
            <span className="truncate line-through decoration-gray-700">
              {PREVIEW_CHAPTER_DONE}
            </span>
          </div>
          <div className="flex items-center gap-2 font-medium text-blue-300">
            <span aria-hidden="true">◐</span>
            <span className="truncate">{PREVIEW_CHAPTER_CURRENT}</span>
          </div>
        </div>

        {/* Practice question. */}
        <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            Practice
          </div>
          <p className="text-sm leading-snug text-gray-200">
            {PREVIEW_QUESTION}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <span className="rounded-lg border border-blue-500 bg-blue-500/10 px-2 py-1 text-[11px] text-blue-200">
              A. A hot key lands on one shard
            </span>
            <span className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-400">
              B. Network latency
            </span>
          </div>
        </div>

        {/* Coach feedback. */}
        <div className="space-y-1 rounded-xl border border-green-500/20 bg-green-950/15 p-3">
          <div className="text-[10px] font-medium uppercase tracking-wide text-green-400">
            Correct · Takeaway
          </div>
          <p className="text-xs text-gray-300">{PREVIEW_TAKEAWAY}</p>
        </div>

        {/* Review weak concepts. */}
        <div className="flex items-center justify-between rounded-xl border border-purple-500/20 bg-purple-950/10 px-3 py-2 text-xs">
          <span className="text-purple-300">{PREVIEW_REVIEW_NOTE}</span>
          <span aria-hidden="true" className="text-gray-500">
            →
          </span>
        </div>
      </div>
    </div>
  );
}
