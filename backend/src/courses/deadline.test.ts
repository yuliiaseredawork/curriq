// Local check:  npx tsx backend/src/courses/deadline.test.ts
import assert from 'node:assert';
import {
  daysUntil,
  requiredReviewsPerDay,
  scheduleStatus,
  deadlineConfidence,
} from './deadline';

// requiredReviewsPerDay
assert.strictEqual(requiredReviewsPerDay({ remainingConcepts: 0, daysLeft: 5 }), 0);
assert.strictEqual(requiredReviewsPerDay({ remainingConcepts: 12, daysLeft: 3 }), 4);
assert.strictEqual(requiredReviewsPerDay({ remainingConcepts: 5, daysLeft: 0 }), 5); // clamps days to 1

// scheduleStatus: even burn-down
const onTrack = scheduleStatus({ totalConcepts: 10, masteredConcepts: 5, daysLeft: 5, totalDays: 10 });
assert.ok(onTrack.onTrack, 'half done at the halfway point = on track');
const behind = scheduleStatus({ totalConcepts: 10, masteredConcepts: 1, daysLeft: 2, totalDays: 10 });
assert.ok(!behind.onTrack && behind.daysBehind > 0, 'little done near the deadline = behind');

// deadlineConfidence
assert.strictEqual(
  deadlineConfidence({ totalConcepts: 10, masteredConcepts: 10, daysLeft: 1, totalDays: 10 }),
  100,
  'nothing left → 100',
);
assert.strictEqual(
  deadlineConfidence({ totalConcepts: 10, masteredConcepts: 3, daysLeft: 0, totalDays: 10 }),
  0,
  'out of time with work left → 0',
);
// Monotonic in time: more days left (same progress) → higher confidence.
const base = { totalConcepts: 20, masteredConcepts: 5, totalDays: 20 };
const near = deadlineConfidence({ ...base, daysLeft: 2 });
const far = deadlineConfidence({ ...base, daysLeft: 15 });
assert.ok(far > near, `more time → more confidence (near ${near}, far ${far})`);
// Bounded 1..100.
for (const v of [near, far]) assert.ok(v >= 1 && v <= 100);

assert.strictEqual(daysUntil(new Date(Date.now() + 3 * 86400000).toISOString()), 3);

console.log('deadline.test.ts OK');
