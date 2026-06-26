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

// --- READY row: clickable + "Start learning" CTA ----------------------------
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
assert.ok(readyHtml.includes('href="/courses/c-ready"'), 'a READY course links to its page');
assert.ok(readyHtml.includes('Start learning'), 'a READY course shows a Start learning CTA');
assert.ok(!readyHtml.includes('<button'), 'a READY course has no Retry button');

console.log('CourseCard.test.tsx OK');
