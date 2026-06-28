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

// --- session question presentation is coaching copy, not raw metadata -------
assert.ok(/questionHeading\(/.test(session), 'session uses the intentional question heading');
assert.ok(!/'Quiz question'/.test(session), 'hard-coded "Quiz question" is gone');
assert.ok(!/q\.difficulty/.test(session), 'raw difficulty is no longer rendered');
assert.ok(!/concept_tags\?\.join/.test(session), 'raw joined concept_tags are no longer rendered');
assert.ok(/taskContextLine\(/.test(session), 'session shows a coaching context line');

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
assert.ok(/firstIncompleteIndex/.test(course) && /isStartHere/.test(course), 'first incomplete chapter drives the prominent CTA');

// --- calm learner-facing chapter labels (Task 7) ----------------------------
assert.ok(!/'Quiz ready'|Quiz ready/.test(course), 'no raw "Quiz ready" badge');
assert.ok(!/Study chapter/.test(course), 'no "Study chapter" label');
assert.ok(/quizBadge\(/.test(course), 'badge uses quizBadge()');
assert.ok(/chapterQuestionsLabel\(/.test(course), 'question count uses chapterQuestionsLabel()');
assert.ok(/chapterCtaLabel\(/.test(course), 'CTA uses chapterCtaLabel()');
assert.ok(!/Start here<\/span>/.test(course), 'header "Start here" pill removed');

// --- flashcard post-rating copy uses the friendly helper --------------------
const sessionPage = read('app/session/page.tsx');
const flashcardsPage = read('app/flashcards/page.tsx');
for (const [name, src] of [['session', sessionPage], ['flashcards', flashcardsPage]] as const) {
  assert.ok(/flashcardRatedLine\(/.test(src), `${name} uses flashcardRatedLine`);
  assert.ok(!/Rated <span/.test(src), `${name} no raw "Rated {rating}" copy`);
}

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

// --- home page is a command center, not a generator dashboard (Task 8) ------
const home = read('app/page.tsx');
assert.ok(/homeMode\(/.test(home), 'home uses homeMode');
assert.ok(/HOME_VALUE_PROP/.test(home) && /HOME_HERO_HEADLINE/.test(home), 'home uses the coach hero copy');
assert.ok(/TODAYS_PLAN_LABEL/.test(home), 'home uses "Today\'s learning plan"');
assert.ok(/CONTINUE_LEARNING_LABEL/.test(home), 'home plan CTA is "Continue learning"');
assert.ok(/YOUR_COURSES_LABEL/.test(home), 'home uses "Your courses"');
assert.ok(/CREATE_LEARNING_PATH_LABEL/.test(home), 'home uses "Create learning path"');
// creationPanel is defined once and reused, not duplicated.
assert.strictEqual((home.match(/const creationPanel =/g) ?? []).length, 1, 'creationPanel defined once');
assert.ok((home.match(/\{creationPanel\}/g) ?? []).length >= 2, 'creationPanel reused in both layouts');
// No internal/generator wording remains.
for (const bad of ['adaptive AI course', "Today's Goal", 'Start Session', 'My Courses', '/day target']) {
  assert.ok(!home.includes(bad), `home page still contains "${bad}"`);
}

// --- signed-out first touch is branded (Task 10) ----------------------------
const signIn = read('app/sign-in/[[...sign-in]]/page.tsx');
assert.ok(/HOME_HERO_HEADLINE/.test(signIn) && /HOME_VALUE_PROP/.test(signIn), 'sign-in reuses the home value prop (no duplicated copy)');
assert.ok(/<SignIn\b/.test(signIn), 'sign-in still renders the Clerk SignIn widget');
assert.ok(/Curriq/.test(signIn), 'sign-in shows the Curriq wordmark');

// --- document metadata is guided-learning-path positioning ------------------
const layout = read('app/layout.tsx');
assert.ok(!/adaptive AI course/.test(layout), 'layout metadata drops "adaptive AI course"');
assert.ok(/guided learning path/i.test(layout), 'layout metadata uses guided-learning-path positioning');

// --- flashcards reuse the shared rating control (no duplicate RATINGS) -------
const flashcards = read('app/flashcards/page.tsx');
assert.ok(/RatingButtons/.test(flashcards), 'flashcards use the shared rating control');
assert.ok(!/const RATINGS/.test(flashcards), 'flashcards no longer define their own RATINGS');

console.log('consolidation.test.ts OK');
