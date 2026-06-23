// Local check:  npx tsx backend/src/courses/sm2.test.ts
import assert from 'node:assert';
import { schedule, scoreToQuality, initialSm2, MIN_EASE, DEFAULT_EASE } from './sm2';

// Good (q=4) progression: intervals 1, 6, then round(6 * EF).
let s = { ...initialSm2 };
let r = schedule(s, 4);
assert.strictEqual(r.repetitions, 1);
assert.strictEqual(r.intervalDays, 1);
r = schedule(r, 4);
assert.strictEqual(r.repetitions, 2);
assert.strictEqual(r.intervalDays, 6);
const third = schedule(r, 4);
assert.strictEqual(third.repetitions, 3);
assert.strictEqual(third.intervalDays, Math.round(6 * r.easeFactor));
console.log('good progression:', [1, 6, third.intervalDays], 'EF', third.easeFactor);

// Lapse: q < 3 resets repetitions and interval.
const lapsed = schedule(third, 0);
assert.strictEqual(lapsed.repetitions, 0);
assert.strictEqual(lapsed.intervalDays, 1);

// EF floor: many Again's never drop EF below 1.3.
let low = { ...initialSm2 };
for (let i = 0; i < 10; i++) low = schedule(low, 0);
assert.ok(low.easeFactor >= MIN_EASE, `EF ${low.easeFactor} >= ${MIN_EASE}`);

// Easy raises EF above default.
const easy = schedule({ ...initialSm2 }, 5);
assert.ok(easy.easeFactor > DEFAULT_EASE, `EF ${easy.easeFactor} > ${DEFAULT_EASE}`);

// nextReviewAt is in the future.
assert.ok(new Date(third.nextReviewAt).getTime() > Date.now());

// Quality mapping.
assert.strictEqual(scoreToQuality(40, 'open'), 0);
assert.strictEqual(scoreToQuality(60, 'open'), 3);
assert.strictEqual(scoreToQuality(80, 'open'), 4);
assert.strictEqual(scoreToQuality(95, 'open'), 5);
assert.strictEqual(scoreToQuality(100, 'mcq'), 4);
assert.strictEqual(scoreToQuality(0, 'mcq'), 0);

console.log('\nAll sm2 checks passed ✓');
