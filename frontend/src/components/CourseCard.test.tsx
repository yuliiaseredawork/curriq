// Render test for the "My Courses" row.
// Run from the frontend dir:  npx tsx src/components/CourseCard.test.tsx
//
// Asserts a FAILED course shows its plain-language reason and a Retry button
// (and is NOT a dead link), while a normal course links to its page.
import assert from 'node:assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CourseCard } from './CourseCard';

const noop = () => {};

// --- FAILED row -------------------------------------------------------------
const failedHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: 'c-failed',
      title: 'Kafka Deep Dive',
      status: 'FAILED',
      sourceType: 'YOUTUBE_PLAYLIST',
      sourceUrl: 'https://youtube.com/playlist?list=PL123',
      errorMessage: 'We couldn’t find usable transcripts for this video or playlist.',
    },
    onRetry: noop,
  }),
);

assert.ok(failedHtml.includes('We couldn’t find usable transcripts'), 'FAILED row shows the reason');
assert.ok(/>Retry</.test(failedHtml), 'FAILED row shows a Retry button');
assert.ok(failedHtml.includes('<button'), 'Retry is a button');
assert.ok(!failedHtml.includes('href='), 'FAILED row is not a link into a broken course');

// A FAILED row with no stored reason still shows a plain-language fallback.
const failedNoReason = renderToStaticMarkup(
  createElement(CourseCard, {
    course: { courseId: 'c2', title: 'X', status: 'FAILED', sourceType: 'PDF' },
    onRetry: noop,
  }),
);
assert.ok(
  /failed\. please try again/i.test(failedNoReason),
  'no FAILED row is left without a plain-language reason',
);
assert.ok(/>Retry</.test(failedNoReason), 'fallback FAILED row still has Retry');

// --- generating row: non-clickable, shows "Generating…", no Start learning --
for (const status of ['CREATED', 'PROCESSING', 'OUTLINING', 'INGESTING']) {
  const gen = renderToStaticMarkup(
    createElement(CourseCard, {
      course: { courseId: 'c-gen', title: 'Building', status, sourceType: 'YOUTUBE_PLAYLIST' },
      onRetry: noop,
    }),
  );
  assert.ok(gen.includes('Generating…'), `${status} shows a Generating indicator`);
  assert.ok(!gen.includes('href='), `${status} card is not clickable`);
  assert.ok(!gen.includes('Start learning'), `${status} has no Start learning yet`);
  assert.ok(!/PROCESSING|CREATED|OUTLINING|INGESTING/.test(gen), `${status} shows no raw enum`);
}

// --- READY row: single "Start course" CTA → the course hub ------------------
const readyHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: 'c-ready',
      title: 'Ready Course',
      status: 'READY',
      sourceType: 'PDF',
      sourceFileName: 'notes.pdf',
    },
    onRetry: noop,
  }),
);
// READY card opens the course page (the learning path), NOT a session.
assert.ok(readyHtml.includes('href="/courses/c-ready"'), 'READY card links to the course page');
assert.ok(readyHtml.includes('Start course'), 'primary CTA reads "Start course"');
assert.ok(!readyHtml.includes('/session?courseId='), 'READY card does not link straight to a session');
assert.ok(!readyHtml.includes('View course'), 'no redundant secondary link');
assert.ok(!readyHtml.includes('<button'), 'a READY course has no Retry button');
// No nested anchors (an <a> directly inside another <a>).
assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/.test(readyHtml), 'no nested anchors');
// No raw status enum leaks.
assert.ok(!/READY/.test(readyHtml), 'READY card shows no raw status enum');
// PDF card shows the clean source label + file name.
assert.ok(readyHtml.includes('PDF'), 'PDF card shows the source label');
assert.ok(readyHtml.includes('notes.pdf'), 'PDF card keeps the file name');
// A not-started READY card reads "Learning path ready".
assert.ok(readyHtml.includes('Learning path ready'), 'not-started READY card reads "Learning path ready"');

// --- READY row WITH progress: "Continue" + a learner-facing hint ------------
const startedHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: { courseId: 'c-go', title: 'In Progress Course', status: 'READY', sourceType: 'PDF', sourceFileName: 'x.pdf' },
    onRetry: noop,
    progress: { completionPercent: 17 },
  }),
);
assert.ok(startedHtml.includes('Continue'), 'a started course shows "Continue"');
assert.ok(!startedHtml.includes('Start course'), 'a started course does not say "Start course"');
assert.ok(startedHtml.includes('17% in progress'), 'shows a learner-facing progress hint');
assert.ok(startedHtml.includes('href="/courses/c-go"'), 'still links to the course page');
assert.ok(!/https?:\/\//.test(startedHtml), 'no raw URL even with progress');

// A READY course with explicit zero progress keeps the inviting "Start course".
const zeroProgHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: { courseId: 'c-new', title: 'New Course', status: 'READY', sourceType: 'PDF' },
    onRetry: noop,
    progress: { completionPercent: 0, answeredQuestions: 0 },
  }),
);
assert.ok(zeroProgHtml.includes('Start course'), '0% progress still invites "Start course"');

// --- YouTube card shows the label, never a raw URL --------------------------
const ytHtml = renderToStaticMarkup(
  createElement(CourseCard, {
    course: {
      courseId: 'c-yt',
      title: 'Kafka Deep Dive',
      status: 'READY',
      sourceType: 'YOUTUBE_PLAYLIST',
      sourceUrl: 'https://youtube.com/playlist?list=PL123',
      playlistUrl: 'https://youtube.com/playlist?list=PL123',
    },
    onRetry: noop,
  }),
);
assert.ok(ytHtml.includes('YouTube playlist'), 'YouTube card shows the clean label');
assert.ok(!/https?:\/\//.test(ytHtml), 'YouTube card shows no raw URL');
assert.ok(!/youtube\.com/.test(ytHtml), 'YouTube card does not leak the raw youtube.com URL');

console.log('CourseCard.test.tsx OK');
