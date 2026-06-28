// Local check:  npx tsx src/lib/sessionScope.test.ts  (from frontend/)
// The session is the one canonical entry; scope is just a parameter (all
// courses / one course / one chapter) on the same /session route.
import assert from 'node:assert';
import { parseSessionScope, sessionHref } from './sessionScope';

// --- sessionHref: canonical links -------------------------------------------
assert.strictEqual(sessionHref(), '/session', 'home → all-courses session');
assert.strictEqual(sessionHref(null), '/session');
assert.strictEqual(sessionHref('c-123'), '/session?courseId=c-123', 'course detail → scoped session');
assert.strictEqual(sessionHref('a b/c'), '/session?courseId=a%20b%2Fc', 'courseId is encoded');
// Chapter scope: both params, encoded; chapterId without courseId is ignored.
assert.strictEqual(
  sessionHref('c-1', 'ch-2'),
  '/session?courseId=c-1&chapterId=ch-2',
  'chapter CTA → course+chapter scoped session',
);
assert.strictEqual(sessionHref(null, 'ch-2'), '/session', 'chapterId alone is ignored');

// --- parseSessionScope: reads the scope back --------------------------------
assert.deepStrictEqual(parseSessionScope(''), {});
assert.deepStrictEqual(parseSessionScope(null), {});
assert.deepStrictEqual(parseSessionScope('?courseId=c-1'), { courseId: 'c-1', chapterId: undefined });
assert.deepStrictEqual(parseSessionScope('courseId=c-1'), { courseId: 'c-1', chapterId: undefined });
assert.deepStrictEqual(
  parseSessionScope('?courseId='),
  { courseId: undefined, chapterId: undefined },
  'empty scope = all courses',
);
assert.deepStrictEqual(parseSessionScope('?foo=bar'), { courseId: undefined, chapterId: undefined });
assert.deepStrictEqual(
  parseSessionScope('?courseId=c-1&chapterId=ch-2'),
  { courseId: 'c-1', chapterId: 'ch-2' },
  'parses both course and chapter scope',
);
// A chapterId without a courseId is dropped (chapter scope needs a course).
assert.deepStrictEqual(parseSessionScope('?chapterId=ch-2'), { courseId: undefined, chapterId: undefined });
assert.deepStrictEqual(
  parseSessionScope(new URLSearchParams({ courseId: 'c-2', chapterId: 'ch-9' })),
  { courseId: 'c-2', chapterId: 'ch-9' },
);

// --- round trips both entries rely on ---------------------------------------
{
  const { courseId, chapterId } = parseSessionScope(sessionHref('course-xyz').slice(sessionHref('course-xyz').indexOf('?')));
  assert.strictEqual(courseId, 'course-xyz');
  assert.strictEqual(chapterId, undefined, 'course entry has no chapter scope');
}
{
  const href = sessionHref('course-xyz', 'chap-1');
  const { courseId, chapterId } = parseSessionScope(href.slice(href.indexOf('?')));
  assert.strictEqual(courseId, 'course-xyz');
  assert.strictEqual(chapterId, 'chap-1', 'chapter entry round-trips chapter scope');
}

console.log('sessionScope.test.ts OK');
