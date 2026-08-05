// Render test for the "My Courses" row.
// Run from the frontend dir:  npx tsx src/components/CourseCard.test.tsx
//
// Asserts a FAILED course shows its plain-language reason and a Retry button
// (and is NOT a dead link), while a normal course links to its page.
import assert from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CourseCard } from "./CourseCard";

const noop = () => {};

// --- FAILED row -------------------------------------------------------------
const failedHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-failed",
      title: "Kafka Deep Dive",
      status: "FAILED",
      sourceType: "YOUTUBE_PLAYLIST",
      sourceUrl: "https://youtube.com/playlist?list=PL123",
      errorMessage:
        "We couldn’t find usable transcripts for this video or playlist.",
    },
    onRetry: noop,
  }),
);

assert.ok(
  failedHtml.includes("We couldn’t find usable transcripts"),
  "FAILED row shows the reason",
);
assert.ok(/>Retry</.test(failedHtml), "FAILED row shows a Retry button");
assert.ok(failedHtml.includes("<button"), "Retry is a button");
assert.ok(
  !failedHtml.includes("href="),
  "FAILED row is not a link into a broken course",
);
// Calm, not alarming: a quiet "Needs attention" badge, no raw "Failed" pill,
// no red-alarm block — this card belongs in a separate attention section.
assert.ok(
  failedHtml.includes("Needs attention"),
  'FAILED row uses the calm "Needs attention" badge',
);
assert.ok(!/>Failed</.test(failedHtml), 'no raw "Failed" badge text');
assert.ok(!/bg-red-950\/10/.test(failedHtml), "no red-alarm card background");
assert.ok(
  failedHtml.includes("Retry when you’re ready."),
  "FAILED row shows the calm retry hint",
);

// A FAILED row with no stored reason still shows a plain-language fallback —
// the new calm copy, never the old alarming "Course generation failed.".
const failedNoReason = renderToStaticMarkup(
  createElement(CourseCard, {
    course: { courseId: "c2", title: "X", status: "FAILED", sourceType: "PDF" },
    onRetry: noop,
  }),
);
assert.ok(
  failedNoReason.includes("We couldn’t finish this import."),
  "no FAILED row is left without a plain-language, calm reason",
);
assert.ok(
  !/course generation failed/i.test(failedNoReason),
  'the old alarming "Course generation failed" phrase never renders',
);
assert.ok(
  />Retry</.test(failedNoReason),
  "fallback FAILED row still has Retry",
);

// A FAILED row whose stored reason IS the backend's old generic phrase still
// gets remapped to the calm copy (defensive against legacy/raw data).
const failedGenericReason = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c3",
      title: "Y",
      status: "FAILED",
      sourceType: "PDF",
      errorMessage: "Course generation failed. Please try again.",
    },
    onRetry: noop,
  }),
);
assert.ok(
  failedGenericReason.includes("We couldn’t finish this import."),
  "a stored generic reason is remapped to calm copy",
);
assert.ok(
  !/course generation failed/i.test(failedGenericReason),
  "the alarming phrase never reaches the DOM",
);

// --- building row: stage-aware label, not a dead link into the course -------
const GEN_STAGE_LABELS: Record<string, string> = {
  CREATED: "Queued…",
  INGESTING: "Reading the source…",
  PROCESSING: "Analyzing the content…",
  OUTLINING: "Building your learning path…",
};
for (const status of ["CREATED", "PROCESSING", "OUTLINING", "INGESTING"]) {
  const gen = renderToStaticMarkup(
    createElement(CourseCard, {
      course: {
        courseId: "c-gen",
        title: "Building",
        status,
        sourceType: "YOUTUBE_PLAYLIST",
      },
      onRetry: noop,
    }),
  );
  assert.ok(
    gen.includes(GEN_STAGE_LABELS[status]),
    `${status} shows its stage label`,
  );
  assert.ok(
    !gen.includes("/courses/"),
    `${status} card never links into the unfinished course`,
  );
  assert.ok(
    gen.includes('href="/demo"'),
    `${status} card offers the demo while waiting`,
  );
  assert.ok(
    !gen.includes("Start learning"),
    `${status} has no Start learning yet`,
  );
  assert.ok(
    !/PROCESSING|CREATED|OUTLINING|INGESTING/.test(gen),
    `${status} shows no raw enum`,
  );
}

// --- READY row: single "Start course" CTA → the course hub ------------------
const readyHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-ready",
      title: "Ready Course",
      status: "READY",
      sourceType: "PDF",
      sourceFileName: "notes.pdf",
    },
    onRetry: noop,
  }),
);
// READY card opens the course page (the learning path), NOT a session.
assert.ok(
  readyHtml.includes('href="/courses/c-ready"'),
  "READY card links to the course page",
);
assert.ok(
  readyHtml.includes("Start course"),
  'primary CTA reads "Start course"',
);
assert.ok(
  !readyHtml.includes("/session?courseId="),
  "READY card does not link straight to a session",
);
assert.ok(!readyHtml.includes("View course"), "no redundant secondary link");
assert.ok(!readyHtml.includes("<button"), "a READY course has no Retry button");
// No nested anchors (an <a> directly inside another <a>).
assert.ok(
  !/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/.test(readyHtml),
  "no nested anchors",
);
// No raw status enum leaks.
assert.ok(!/READY/.test(readyHtml), "READY card shows no raw status enum");
// PDF card shows the clean source label + file name.
assert.ok(readyHtml.includes("PDF"), "PDF card shows the source label");
assert.ok(readyHtml.includes("notes.pdf"), "PDF card keeps the file name");
// A not-started READY card reads "Learning path ready".
assert.ok(
  readyHtml.includes("Learning path ready"),
  'not-started READY card reads "Learning path ready"',
);

// --- READY row WITH progress: "Continue" + a learner-facing hint ------------
const startedHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-go",
      title: "In Progress Course",
      status: "READY",
      sourceType: "PDF",
      sourceFileName: "x.pdf",
    },
    onRetry: noop,
    progress: { completionPercent: 17 },
  }),
);
assert.ok(
  startedHtml.includes("Continue"),
  'a started course shows "Continue"',
);
assert.ok(
  !startedHtml.includes("Start course"),
  'a started course does not say "Start course"',
);
assert.ok(
  startedHtml.includes("17% in progress"),
  "shows a learner-facing progress hint",
);
assert.ok(
  startedHtml.includes('href="/courses/c-go"'),
  "still links to the course page",
);
assert.ok(!/https?:\/\//.test(startedHtml), "no raw URL even with progress");

// --- READY row, fully completed: "Completed" + "Review" (Task 23) ----------
const completedHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-done",
      title: "Finished Course",
      status: "READY",
      sourceType: "PDF",
    },
    onRetry: noop,
    progress: { completionPercent: 100 },
  }),
);
assert.ok(
  completedHtml.includes("Completed"),
  'a finished course shows "Completed"',
);
assert.ok(
  completedHtml.includes("Review"),
  'a finished course\'s CTA reads "Review"',
);
assert.ok(
  !completedHtml.includes("Continue"),
  'a finished course does not say "Continue"',
);
assert.ok(
  !completedHtml.includes("Start course"),
  'a finished course does not say "Start course"',
);

// A READY course with explicit zero progress keeps the inviting "Start course".
const zeroProgHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-new",
      title: "New Course",
      status: "READY",
      sourceType: "PDF",
    },
    onRetry: noop,
    progress: { completionPercent: 0, answeredQuestions: 0 },
  }),
);
assert.ok(
  zeroProgHtml.includes("Start course"),
  '0% progress still invites "Start course"',
);

// --- CTA emphasis: secondary when another card owns the primary action ------
const secondaryCtaHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-sec",
      title: "Quiet Card",
      status: "READY",
      sourceType: "PDF",
    },
    onRetry: noop,
    ctaEmphasis: "secondary",
  }),
);
assert.ok(
  !/bg-blue-500/.test(secondaryCtaHtml),
  "secondary emphasis drops the blue primary CTA",
);
assert.ok(
  secondaryCtaHtml.includes("Start course"),
  "the CTA label itself is unchanged",
);
// Default stays primary (blue) so standalone grids keep a clear action.
assert.ok(
  /bg-blue-500/.test(readyHtml),
  "default emphasis keeps the primary CTA",
);

// --- YouTube card shows the label, never a raw URL --------------------------
const ytHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: "c-yt",
      title: "Kafka Deep Dive",
      status: "READY",
      sourceType: "YOUTUBE_PLAYLIST",
      sourceUrl: "https://youtube.com/playlist?list=PL123",
      playlistUrl: "https://youtube.com/playlist?list=PL123",
    },
    onRetry: noop,
  }),
);
assert.ok(
  ytHtml.includes("YouTube playlist"),
  "YouTube card shows the clean label",
);
assert.ok(!/https?:\/\//.test(ytHtml), "YouTube card shows no raw URL");
assert.ok(
  !/youtube\.com/.test(ytHtml),
  "YouTube card does not leak the raw youtube.com URL",
);

console.log("CourseCard.test.tsx OK");
