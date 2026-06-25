// Local check:  npx tsx backend/src/courses/retry.test.ts
import assert from 'node:assert';
import { planCourseRetry } from './retry';

// FAILED courses are retryable; the right pipeline is selected by source type.
assert.deepStrictEqual(planCourseRetry({ status: 'FAILED', sourceType: 'PDF' }), {
  ok: true,
  pipeline: 'PDF',
});
assert.deepStrictEqual(planCourseRetry({ status: 'FAILED', sourceType: 'YOUTUBE_PLAYLIST' }), {
  ok: true,
  pipeline: 'YOUTUBE',
});
assert.deepStrictEqual(planCourseRetry({ status: 'FAILED', sourceType: 'YOUTUBE_VIDEO' }), {
  ok: true,
  pipeline: 'YOUTUBE',
});
// Legacy rows with no sourceType default to YouTube.
assert.deepStrictEqual(planCourseRetry({ status: 'FAILED' }), { ok: true, pipeline: 'YOUTUBE' });

// Idempotency: anything not FAILED is rejected. This is the unit-level guarantee
// that a second retry (after the first flips FAILED -> CREATED) does not re-run.
for (const status of ['CREATED', 'INGESTING', 'PROCESSING', 'OUTLINING', 'READY']) {
  const plan = planCourseRetry({ status, sourceType: 'PDF' });
  assert.deepStrictEqual(plan, { ok: false, reason: 'NOT_FAILED' }, `${status} not retryable`);
}

// Unknown source type fails closed.
assert.deepStrictEqual(planCourseRetry({ status: 'FAILED', sourceType: 'SLIDES' }), {
  ok: false,
  reason: 'UNKNOWN_SOURCE',
});

console.log('retry.test.ts OK');
