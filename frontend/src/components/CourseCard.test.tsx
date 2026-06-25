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

// --- normal row -------------------------------------------------------------
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
assert.ok(readyHtml.includes('href="/courses/c-ready"'), 'a non-failed course links to its page');
assert.ok(!readyHtml.includes('<button'), 'a non-failed course has no Retry button');

console.log('CourseCard.test.tsx OK');
