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

// --- course page is the learning path / hub ---------------------------------
assert.ok(/courseHero\(/.test(course), 'course page renders the started-aware hero');
assert.ok(/Chapter \{i \+ 1\}/.test(course), 'chapters are numbered as a path');
assert.ok(/Start here/.test(course) && /firstIncompleteIndex/.test(course), 'first incomplete chapter is marked "Start here"');

// --- not-started course hides empty analytics; started keeps them -----------
assert.ok(/const started = progressView\.started/.test(course), 'single started flag is computed');
assert.ok(
  /started && \(progress \|\| retention\) &&/.test(course),
  'Learning progress card is gated on started',
);
assert.ok(
  /started && \(course\.metadata\?\.targetDate \|\| retention \|\| cardsDue\) &&/.test(course),
  'metrics grid (incl. Deadline) is gated on started',
);

// --- chapter cards are outcome-focused, with one prominent entry CTA --------
assert.ok(/chapter\.learning_objectives\?\.length/.test(course), 'renders learning objectives when present');
assert.ok(/CHAPTER_OUTCOMES_INTRO/.test(course), 'uses the outcomes intro copy');
assert.ok(/text=\{chapter\.summary\}/.test(course), 'falls back to the summary when objectives are missing');
assert.ok(
  /quizState === 'READY' && isStartHere &&/.test(course),
  'only the Start-here chapter shows the prominent learning-entry CTA',
);
// Quiz readiness controls are untouched (not regressed).
assert.ok(/quizState === 'GENERATING'/.test(course) && /quizState === 'NOT_STARTED'/.test(course), 'generate/generating quiz controls remain');

// --- READY course card opens the course page, not a session -----------------
const card = read('components/CourseCard.tsx');
assert.ok(/START_COURSE_LABEL/.test(card), 'READY card uses the "Start course" label');
assert.ok(!/sessionHref/.test(card), 'card no longer links straight into a session');

// --- flashcards reuse the shared rating control (no duplicate RATINGS) -------
const flashcards = read('app/flashcards/page.tsx');
assert.ok(/RatingButtons/.test(flashcards), 'flashcards use the shared rating control');
assert.ok(!/const RATINGS/.test(flashcards), 'flashcards no longer define their own RATINGS');

console.log('consolidation.test.ts OK');
