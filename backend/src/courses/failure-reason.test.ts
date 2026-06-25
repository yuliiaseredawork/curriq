// Local check:  npx tsx backend/src/courses/failure-reason.test.ts
import assert from 'node:assert';
import { toUserSafeReason } from './failure-reason';

// Known failure modes map to plain-language, actionable reasons.
assert.match(
  toUserSafeReason(new Error('No transcript available for video abc123')),
  /transcript/i,
);
assert.match(
  toUserSafeReason(new Error('pdf-parse: could not read text from document')),
  /PDF/i,
);
assert.match(toUserSafeReason(new Error('Request timed out after 30000ms')), /timed out/i);
assert.match(toUserSafeReason(new Error('429 Too Many Requests: rate limit')), /busy|try again/i);

// Never leak a raw stack trace / provider internals — unknown errors collapse
// to the generic reason (no original text echoed).
const stack =
  'TypeError: Cannot read properties of undefined (reading "x")\n    at /var/task/index.js:42:13';
const safe = toUserSafeReason(new Error(stack));
assert.strictEqual(safe, 'Course generation failed. Please try again.');
assert.ok(!safe.includes('/var/task'), 'no file paths leak');
assert.ok(!safe.includes('TypeError'), 'no error class leaks');

// Handles non-Error inputs without throwing.
assert.strictEqual(typeof toUserSafeReason('weird string'), 'string');
assert.strictEqual(typeof toUserSafeReason(null), 'string');
assert.strictEqual(typeof toUserSafeReason(undefined), 'string');

console.log('failure-reason.test.ts OK');
