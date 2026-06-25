// Local check:  npx tsx src/lib/sessionScope.test.ts  (from frontend/)
// The session is the one canonical entry; scope is just a parameter. These
// assert both entries (home = all courses, course detail = one course) resolve
// through the SAME /session route + scope contract.
import assert from 'node:assert';
import { parseSessionScope, sessionHref } from './sessionScope';

// --- sessionHref: canonical links -------------------------------------------
assert.strictEqual(sessionHref(), '/session', 'home → all-courses session');
assert.strictEqual(sessionHref(null), '/session');
assert.strictEqual(sessionHref('c-123'), '/session?courseId=c-123', 'course detail → scoped session');
assert.strictEqual(sessionHref('a b/c'), '/session?courseId=a%20b%2Fc', 'courseId is encoded');

// --- parseSessionScope: reads the scope back --------------------------------
assert.strictEqual(parseSessionScope(''), undefined);
assert.strictEqual(parseSessionScope(null), undefined);
assert.strictEqual(parseSessionScope('?courseId=c-1'), 'c-1');
assert.strictEqual(parseSessionScope('courseId=c-1'), 'c-1');
assert.strictEqual(parseSessionScope('?courseId='), undefined, 'empty scope = all courses');
assert.strictEqual(parseSessionScope('?foo=bar'), undefined);
assert.strictEqual(parseSessionScope(new URLSearchParams({ courseId: 'c-2' })), 'c-2');

// --- the round trip both entries rely on ------------------------------------
// Home "Start Session": no scope → all courses.
assert.strictEqual(
  parseSessionScope(sessionHref().replace('/session', '')),
  undefined,
  'home entry yields an all-courses session',
);
// Course detail "Continue learning" / chapter card: scoped to that course.
const href = sessionHref('course-xyz');
const qs = href.slice(href.indexOf('?'));
assert.strictEqual(parseSessionScope(qs), 'course-xyz', 'course entry yields a course-scoped session');

console.log('sessionScope.test.ts OK');
