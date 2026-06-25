// Local check:  npx tsx src/lib/consolidation.test.ts  (from frontend/)
//
// No browser/E2E harness exists in this repo, so these assert the structural
// invariants of the consolidation against the source: the old "Study Chapter"
// route redirects (no 404, no second MCQ renderer), the session is the single
// MCQ renderer scoped via the URL, and the course-detail entries point at the
// canonical scoped session.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

// --- old "Study Chapter" URL redirects, renderer removed --------------------
const chapter = read('app/courses/[courseId]/chapters/[chapterId]/page.tsx');
assert.ok(/from 'next\/navigation'/.test(chapter) && /redirect\(/.test(chapter), 'chapter route redirects');
assert.ok(/sessionHref\(/.test(chapter), 'chapter route redirects into the scoped session');
assert.ok(!/'mcq'/.test(chapter), 'chapter route no longer renders MCQ');
assert.ok(!/choices\.map/.test(chapter), 'chapter route no longer has its own choice renderer');

// --- session is the single MCQ renderer, scoped by the URL ------------------
const session = read('app/session/page.tsx');
assert.ok(/McqChoices/.test(session), 'session uses the shared MCQ component');
assert.ok(!/choices\.map/.test(session), 'session has no inline MCQ markup anymore');
assert.ok(/parseSessionScope/.test(session), 'session reads the scope param');
assert.ok(/getSessionToday\(scopeCourseId\)/.test(session), 'session passes scope to the one endpoint');

// --- course detail entries point at the canonical scoped session ------------
const course = read('app/courses/[courseId]/page.tsx');
assert.ok(/sessionHref\(courseId\)/.test(course), 'course-detail entries link to the scoped session');
assert.ok(
  !/\/courses\/\$\{courseId\}\/chapters\//.test(course),
  'course detail no longer routes into the standalone chapter flow',
);

// --- flashcards reuse the shared rating control (no duplicate RATINGS) -------
const flashcards = read('app/flashcards/page.tsx');
assert.ok(/RatingButtons/.test(flashcards), 'flashcards use the shared rating control');
assert.ok(!/const RATINGS/.test(flashcards), 'flashcards no longer define their own RATINGS');

console.log('consolidation.test.ts OK');
