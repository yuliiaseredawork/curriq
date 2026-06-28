// Local check:  npx tsx src/lib/learnerCopy.test.ts  (from frontend/)
import assert from 'node:assert';
import {
  learningProgressView,
  chapterStatusLabel,
  sessionProgressLabel,
  CHAPTER_STATUS_LABELS,
  courseStatusLabel,
  isCoursePending,
  primaryCtaLabel,
  sessionEmptyState,
  courseHero,
  START_COURSE_LABEL,
  courseCardView,
  practiceItemsLabel,
  visibleBreakdownCourses,
  feedbackTakeaway,
  WHATS_INCLUDED_LABEL,
  CREATE_NEW_PATH_HEADING,
  CREATE_NEW_PATH_HELPER,
  CHAPTER_OUTCOMES_INTRO,
  questionHeading,
  questionEyebrow,
  questionFocus,
  taskContextLine,
  quizBadge,
  chapterQuestionsLabel,
  chapterCtaLabel,
  DEFAULT_VISIBLE_OBJECTIVES,
  DEFAULT_VISIBLE_FOCUS_AREAS,
  showMoreLabel,
  detailsToggleLabel,
  focusListToggleLabel,
  SHOW_MORE_FOCUS_LABEL,
  flashcardRatedLine,
  parseFlashcardBack,
  firstSentence,
  FLASHCARD_RATING_PROMPT,
  FLASHCARD_ANSWER_LABEL,
  FLASHCARD_WHY_LABEL,
  FLASHCARD_WATCH_OUT_LABEL,
  FLASHCARD_SOURCE_NOTE_LABEL,
  FLASHCARD_REVIEW_EYEBROW,
  FLASHCARD_SAVED_LABEL,
  renderClozeText,
  FOCUS_EYEBROW,
  FOCUS_CONTEXT,
  primaryButtonClass,
  secondaryButtonClass,
  stayOnTrackLine,
  METRIC_REMEMBERED_LABEL,
  METRIC_SOLID_LEARNING_LABEL,
  METRIC_NEEDS_LOOK_LABEL,
  METRIC_READY_TO_REVIEW_LABEL,
  homeMode,
  HOME_HERO_HEADLINE,
  HOME_VALUE_PROP,
  TODAYS_PLAN_LABEL,
  CONTINUE_LEARNING_LABEL,
  YOUR_COURSES_LABEL,
  CREATE_LEARNING_PATH_LABEL,
  CAUGHT_UP_TITLE,
  CAUGHT_UP_BODY,
} from './learnerCopy';

// --- New course: inviting, no naked 0% and no four-metric line --------------
const fresh = learningProgressView({ pct: 0, answered: 0 });
assert.strictEqual(fresh.started, false);
assert.strictEqual(fresh.pct, 0);
assert.match(fresh.status, /Not started yet/);
assert.ok(!fresh.headline.includes('0%'), 'new course does not show a naked 0%');

// --- In progress ------------------------------------------------------------
const mid = learningProgressView({ pct: 12, answered: 3 });
assert.strictEqual(mid.headline, '12%');
assert.strictEqual(mid.status, 'In progress');

// Started via answered questions even when pct rounds to 0.
const byAnswers = learningProgressView({ pct: 0, answered: 2 });
assert.strictEqual(byAnswers.started, true);
assert.strictEqual(byAnswers.status, 'In progress');

// --- Complete ---------------------------------------------------------------
assert.strictEqual(learningProgressView({ pct: 100, answered: 40 }).status, 'Course complete');

// --- Clamp / guards ---------------------------------------------------------
assert.strictEqual(learningProgressView({ pct: 150 }).pct, 100);
assert.strictEqual(learningProgressView({ pct: -5, answered: 0 }).started, false);
assert.strictEqual(learningProgressView({}).started, false);

// --- Chapter enum → plain language + non-color (shape glyph) indicator -------
const ns = chapterStatusLabel('NOT_STARTED');
assert.strictEqual(ns.text, 'Not started yet');
assert.ok(ns.icon.length > 0, 'status carries a non-color shape glyph');
assert.ok(!ns.text.includes('NOT_STARTED'));
assert.strictEqual(chapterStatusLabel('IN_PROGRESS').text, 'In progress');
assert.strictEqual(chapterStatusLabel('COMPLETED').text, 'Completed');
// Unknown/empty falls back invitingly (never blank, never a raw enum).
assert.strictEqual(chapterStatusLabel(undefined).text, 'Not started yet');
assert.strictEqual(chapterStatusLabel('WEIRD').text, 'Not started yet');
// Every mapped status has both a text label and an icon (a11y: not color-only).
for (const [, v] of Object.entries(CHAPTER_STATUS_LABELS)) {
  assert.ok(v.text.length > 0 && v.icon.length > 0);
}

// --- Neutral session progress -----------------------------------------------
assert.strictEqual(sessionProgressLabel(0, 20), '1 of 20');
assert.strictEqual(sessionProgressLabel(19, 20), '20 of 20');

// --- Course generation status → plain language + polling control ------------
for (const s of ['CREATED', 'INGESTING', 'PROCESSING', 'OUTLINING']) {
  const v = courseStatusLabel(s);
  assert.strictEqual(v.generating, true, `${s} is still generating`);
  assert.strictEqual(v.terminal, false, `${s} is not terminal`);
  assert.strictEqual(v.label, 'Generating…');
  assert.strictEqual(isCoursePending(s), true, `poll continues while ${s}`);
}
const ready = courseStatusLabel('READY');
assert.deepStrictEqual(ready, { generating: false, terminal: true, label: 'Ready' });
assert.strictEqual(isCoursePending('READY'), false, 'poll stops when READY');
const failed = courseStatusLabel('FAILED');
assert.strictEqual(failed.generating, false);
assert.strictEqual(failed.terminal, true, 'FAILED is terminal (poll stops)');
assert.strictEqual(isCoursePending('FAILED'), false, 'poll stops when FAILED');
// Unknown/missing → treated as pending so a card is never a dead link.
assert.strictEqual(courseStatusLabel(undefined).generating, true);
assert.strictEqual(isCoursePending(null), true);
// No raw enum leaks into a label.
for (const s of ['CREATED', 'PROCESSING', 'READY', 'FAILED', undefined]) {
  const { label } = courseStatusLabel(s);
  assert.ok(!/CREATED|PROCESSING|READY|FAILED|OUTLINING|INGESTING/.test(label), `label leaks enum for ${s}`);
}

// --- Primary CTA copy: invite vs. resume ------------------------------------
assert.strictEqual(primaryCtaLabel(false), 'Start learning', 'new course → Start learning');
assert.strictEqual(primaryCtaLabel(true), 'Continue learning', 'in-progress → Continue learning');

// --- Course card CTA + course-page hero -------------------------------------
assert.strictEqual(START_COURSE_LABEL, 'Start course', 'READY card opens the course hub');

// --- state-aware course card view (Task 18) ---------------------------------
const freshCard = courseCardView(undefined);
assert.strictEqual(freshCard.started, false);
assert.strictEqual(freshCard.ctaLabel, 'Start course', 'a new course says "Start course"');
assert.strictEqual(freshCard.statusLine, 'Learning path ready');
const cardNotStarted = courseCardView({ completionPercent: 0, answeredQuestions: 0 });
assert.strictEqual(cardNotStarted.ctaLabel, 'Start course', '0% is still "Start course"');
const cardStarted = courseCardView({ completionPercent: 17 });
assert.strictEqual(cardStarted.started, true);
assert.strictEqual(cardStarted.ctaLabel, 'Continue', 'a started course says "Continue"');
assert.strictEqual(cardStarted.statusLine, '17% in progress');
// Started via answered count even when percent rounds to 0.
const cardByAnswers = courseCardView({ completionPercent: 0, answeredQuestions: 4, totalQuestions: 20 });
assert.strictEqual(cardByAnswers.ctaLabel, 'Continue');
assert.strictEqual(cardByAnswers.statusLine, '4 / 20 done');
// No raw internal vocabulary in the status line.
for (const v of [freshCard, cardStarted, cardByAnswers]) {
  assert.ok(!/Mastery|Retention|IN_PROGRESS|task/.test(v.statusLine), `card status leaks: "${v.statusLine}"`);
}

// --- home plan breakdown copy + 0-task filtering ----------------------------
assert.strictEqual(WHATS_INCLUDED_LABEL, "What's included today");
assert.strictEqual(practiceItemsLabel(20), '20 practice items');
assert.strictEqual(practiceItemsLabel(1), '1 practice item');
assert.strictEqual(practiceItemsLabel(0), '0 practice items');
// Hide 0-task rows when others have tasks…
const breakdownMixed = visibleBreakdownCourses([
  { courseTitle: 'A', taskCount: 20 },
  { courseTitle: 'B', taskCount: 0 },
  { courseTitle: 'C', taskCount: 3 },
]);
assert.deepStrictEqual(breakdownMixed.map((c) => c.courseTitle), ['A', 'C'], 'drops 0-task rows');
// …but keep everything when all are 0 (never show an empty breakdown).
const breakdownAllZero = visibleBreakdownCourses([
  { courseTitle: 'A', taskCount: 0 },
  { courseTitle: 'B', taskCount: 0 },
]);
assert.strictEqual(breakdownAllZero.length, 2, 'keeps all rows when every course is at 0');

// --- add-material card copy --------------------------------------------------
assert.strictEqual(CREATE_NEW_PATH_HEADING, 'Create a new learning path');
assert.ok(/video.*PDF|playlist/i.test(CREATE_NEW_PATH_HELPER), 'helper mentions the accepted sources');

// --- feedback takeaway: no repeated verdict ---------------------------------
assert.strictEqual(
  feedbackTakeaway('Not quite. Caching can serve stale data if writes skip it.'),
  'Caching can serve stale data if writes skip it.',
  'strips a leading "Not quite" from the takeaway',
);
assert.strictEqual(
  feedbackTakeaway('Correct! Requirements should be time-boxed.'),
  'Requirements should be time-boxed.',
  'strips a leading "Correct"',
);
assert.ok(!/^not quite/i.test(feedbackTakeaway('Not quite — you missed the write path.') ?? ''), 'no leading verdict remains');
assert.strictEqual(feedbackTakeaway(''), null);
assert.strictEqual(feedbackTakeaway(null), null);

const newHero = courseHero({ started: false, hasChapters: true });
assert.strictEqual(newHero.title, 'Your learning path is ready');
assert.strictEqual(newHero.ctaLabel, 'Start learning');
assert.ok(/path/i.test(newHero.subtitle), 'new-course hero frames chapters as the path');

const startedHero = courseHero({ started: true, hasChapters: true });
assert.strictEqual(startedHero.title, 'Continue learning');
assert.strictEqual(startedHero.ctaLabel, 'Continue learning');

// No chapters → don't promise a chapter path.
const noChapters = courseHero({ started: false, hasChapters: false });
assert.strictEqual(noChapters.title, 'Your learning path is ready');
assert.ok(!/chapters below/i.test(noChapters.subtitle), 'no-chapters hero makes no path promise');

// Chapter outcomes intro: outcome-focused, no internal jargon.
assert.strictEqual(CHAPTER_OUTCOMES_INTRO, "By the end, you'll be able to:");
assert.ok(/able to/i.test(CHAPTER_OUTCOMES_INTRO), 'frames chapters as learner outcomes');

// --- Empty-session copy: three distinct cases -------------------------------
// Returning learner who finished a queue this session → real completion.
const complete = sessionEmptyState({ reviewed: 3 });
assert.strictEqual(complete.kind, 'complete');
assert.ok(/Session complete/.test(complete.title));
assert.ok(/reviewed 3 items/.test(complete.body));
assert.strictEqual(sessionEmptyState({ reviewed: 1 }).body, 'You reviewed 1 item.', 'singular');

// Brand-new course-scoped session with nothing yet → "still preparing", NOT
// "nothing is due", plus a way back to the course.
const preparing = sessionEmptyState({ reviewed: 0, scopeCourseId: 'c-7' });
assert.strictEqual(preparing.kind, 'preparing');
assert.ok(!/nothing is due/i.test(preparing.body), 'never says "nothing is due" for a new course');
assert.ok(/still getting ready|generating/i.test(preparing.body));
assert.strictEqual((preparing as any).backHref, '/courses/c-7', 'offers a Back to course link');

// All-courses session, nothing due → genuine "all caught up" (not regressed).
const caughtUp = sessionEmptyState({ reviewed: 0 });
assert.strictEqual(caughtUp.kind, 'caught-up');
assert.ok(/All caught up/.test(caughtUp.title));
assert.ok(/Nothing is due/.test(caughtUp.body));
// A scoped session only flips to "preparing" before any review; once reviewed,
// completion wins regardless of scope.
assert.strictEqual(sessionEmptyState({ reviewed: 2, scopeCourseId: 'c-7' }).kind, 'complete');

// --- Chapter-scoped empty states --------------------------------------------
// Quiz not ready yet, nothing answered → "being prepared" + back link.
const chPreparing = sessionEmptyState({
  reviewed: 0,
  scopeCourseId: 'c-7',
  scopeChapterId: 'ch-1',
  chapterReady: false,
});
assert.strictEqual(chPreparing.kind, 'preparing');
assert.ok(/being prepared/i.test(chPreparing.body));
assert.strictEqual((chPreparing as any).backHref, '/courses/c-7');
// Questions exist but none left (e.g. "Review chapter" on a completed chapter).
const chDone = sessionEmptyState({
  reviewed: 0,
  scopeCourseId: 'c-7',
  scopeChapterId: 'ch-1',
  chapterReady: true,
});
assert.strictEqual(chDone.kind, 'complete');
assert.ok(/finished this chapter/i.test(chDone.body));
assert.strictEqual((chDone as any).backHref, '/courses/c-7');
// Finished the chapter this session → also "finished this chapter".
const chJustDone = sessionEmptyState({ reviewed: 3, scopeCourseId: 'c-7', scopeChapterId: 'ch-1' });
assert.strictEqual(chJustDone.kind, 'complete');
assert.ok(/finished this chapter/i.test(chJustDone.body));

// --- renderClozeText: learner-friendly blanks (stored data unchanged) -------
assert.strictEqual(renderClozeText('Kafka uses {{blank}} offsets'), 'Kafka uses _____ offsets');
assert.strictEqual(
  renderClozeText('{{blank}} reads from {{blank}}'),
  '_____ reads from _____',
  'handles multiple blanks',
);
assert.strictEqual(renderClozeText('a {{ blank }} b'), 'a _____ b', 'handles spaced placeholder');
assert.strictEqual(renderClozeText('a {{ c1 }} b'), 'a _____ b', 'handles any {{...}} token');
assert.strictEqual(renderClozeText('no placeholder here'), 'no placeholder here', 'no-op without placeholder');
assert.strictEqual(renderClozeText(''), '');
assert.strictEqual(renderClozeText(null), '');

// --- Flashcard back presentation + rating prompt ----------------------------
assert.strictEqual(FLASHCARD_RATING_PROMPT, 'How well did you remember this?');
assert.strictEqual(FLASHCARD_ANSWER_LABEL, 'Answer');
assert.strictEqual(FLASHCARD_WHY_LABEL, 'Why it matters');
assert.strictEqual(FLASHCARD_WATCH_OUT_LABEL, 'Watch out');
assert.strictEqual(FLASHCARD_SOURCE_NOTE_LABEL, 'Source note');
assert.strictEqual(FLASHCARD_REVIEW_EYEBROW, 'Review', 'calm "Review" eyebrow replaces the loud header');
assert.strictEqual(FLASHCARD_SAVED_LABEL, 'Saved for review', 'post-rating reads as progress');

// firstSentence: a concise one-line takeaway from longer feedback text.
assert.strictEqual(
  firstSentence('Caching reduces read latency. It can also serve stale data.'),
  'Caching reduces read latency.',
  'takes only the first sentence',
);
assert.strictEqual(
  firstSentence('A single sentence with no trailing space.'),
  'A single sentence with no trailing space.',
  'a lone sentence is returned whole',
);
assert.strictEqual(firstSentence(''), null);
assert.strictEqual(firstSentence('   '), null);
assert.strictEqual(firstSentence(null), null);
assert.strictEqual(firstSentence(undefined), null);
// An over-long single sentence is clamped with an ellipsis.
const longTakeaway = firstSentence('x'.repeat(200) + ' more', 160);
assert.ok(longTakeaway !== null && longTakeaway.length <= 161 && longTakeaway.endsWith('…'), 'clamps a long takeaway');

// Fully labeled: "Answer / Why / Watch out" → each field, label stripped.
const labeled = parseFlashcardBack('Answer: X\nWhy: Y\nWatch out: Z');
assert.deepStrictEqual(labeled, {
  answer: 'X',
  why: 'Y',
  watchOut: 'Z',
  sourceNote: null,
  fallback: null,
});

// "Why it matters" + "Source note" labels parse into the right fields.
const withSource = parseFlashcardBack('Answer: X\nWhy it matters: Y\nSource note: S');
assert.strictEqual(withSource.answer, 'X');
assert.strictEqual(withSource.why, 'Y');
assert.strictEqual(withSource.sourceNote, 'S');
assert.strictEqual(withSource.watchOut, null);
assert.strictEqual(withSource.fallback, null);

// "Source:" (short prefix) is recognized as a source note too.
assert.strictEqual(parseFlashcardBack('Answer: X\nSource: from the transcript').sourceNote, 'from the transcript');

// Unlabeled text → safe fallback with the original text; no other field set.
const free = parseFlashcardBack(
  'Two groups each keep independent offsets and read all partitions; one group splits them.',
);
assert.strictEqual(free.answer, null);
assert.strictEqual(free.fallback, free.fallback && free.fallback.trim());
assert.ok(free.fallback!.startsWith('Two groups'), 'freeform text preserved in fallback');

// Mixed: an unlabeled answer paragraph followed by a "Watch out" line (the good
// example shape) → lead text becomes the answer, the trap becomes watchOut.
const mixed = parseFlashcardBack(
  'Move on to the design and cap requirements at five minutes.\nWatch out: Being thorough is not showing design depth.',
);
assert.ok(mixed.answer!.startsWith('Move on to the design'), 'lead text becomes the answer');
assert.strictEqual(mixed.watchOut, 'Being thorough is not showing design depth.');
assert.strictEqual(mixed.fallback, null);

// Prose that merely starts with "Why" is NOT mistaken for a label (needs colon).
const prose = parseFlashcardBack('Why this works is that offsets are tracked per partition.');
assert.strictEqual(prose.answer, null);
assert.strictEqual(prose.fallback, 'Why this works is that offsets are tracked per partition.');

// Unknown labels (e.g. "Note:") stay in the fallback text, never dropped.
const note = parseFlashcardBack('Note: brokers persist data to disk.');
assert.ok(note.fallback!.includes('Note: brokers persist'), 'unknown label kept as text, not lost');
assert.strictEqual(note.answer, null);

// No content is ever dropped: every non-label word survives somewhere.
const all = parseFlashcardBack('Answer: keep offsets\nWhy: avoids reprocessing\nWatch out: rebalances\nSource note: ch3');
const reassembled = [all.answer, all.why, all.watchOut, all.sourceNote, all.fallback]
  .filter(Boolean)
  .join(' ');
for (const word of ['keep', 'offsets', 'avoids', 'reprocessing', 'rebalances', 'ch3']) {
  assert.ok(reassembled.includes(word), `parseFlashcardBack dropped "${word}"`);
}

// Empty / nullish → fully-null safe structure (callers render nothing).
const emptyOut = { answer: null, why: null, watchOut: null, sourceNote: null, fallback: null };
assert.deepStrictEqual(parseFlashcardBack(''), emptyOut);
assert.deepStrictEqual(parseFlashcardBack('   '), emptyOut);
assert.deepStrictEqual(parseFlashcardBack(null), emptyOut);
assert.deepStrictEqual(parseFlashcardBack(undefined), emptyOut);

// renderClozeText still turns {{blank}} into "_____" (cloze stays protected).
assert.strictEqual(renderClozeText('Kafka tracks {{blank}} per partition'), 'Kafka tracks _____ per partition');

// The rating prompt carries no internal/rating-enum vocabulary.
for (const tok of ['AGAIN', 'HARD', 'GOOD', 'EASY', 'SM-2', 'quality']) {
  assert.ok(!FLASHCARD_RATING_PROMPT.includes(tok), `rating prompt leaks "${tok}"`);
}

// --- Focus practice copy ----------------------------------------------------
assert.strictEqual(FOCUS_EYEBROW, 'Focus practice');
assert.strictEqual(FOCUS_CONTEXT, 'Strengthen this weak spot');

// --- Shared button styles + metric labels (polish) --------------------------
assert.ok(/bg-blue-500/.test(primaryButtonClass), 'primary button is blue');
assert.ok(/disabled:opacity-50/.test(primaryButtonClass), 'primary preserves disabled state');
assert.ok(!/px-\d/.test(primaryButtonClass), 'primary class leaves padding to call sites');
assert.ok(/border/.test(secondaryButtonClass), 'secondary button is bordered/quiet');

assert.strictEqual(METRIC_REMEMBERED_LABEL, 'Remembered');
assert.strictEqual(METRIC_SOLID_LEARNING_LABEL, 'Solid / Still learning');
assert.strictEqual(METRIC_NEEDS_LOOK_LABEL, 'Needs another look');
assert.strictEqual(METRIC_READY_TO_REVIEW_LABEL, 'Review cards waiting');
assert.strictEqual(stayOnTrackLine(3), '~3 a day to stay on track');

// No internal metric vocabulary in the exported learner-facing labels.
const metricCopy = [
  METRIC_REMEMBERED_LABEL,
  METRIC_SOLID_LEARNING_LABEL,
  METRIC_NEEDS_LOOK_LABEL,
  METRIC_READY_TO_REVIEW_LABEL,
  stayOnTrackLine(2),
].join(' | ');
for (const bad of ['Retention', 'Forgotten', 'Mastered / Learning', 'Reviews due', 'reviews/day']) {
  assert.ok(!metricCopy.includes(bad), `metric copy leaks "${bad}"`);
}

// --- Session question presentation ------------------------------------------
// Heading: warm label for new questions, concept title for reviews.
assert.strictEqual(
  questionHeading({ kind: 'quiz', question: { concept_tags: ['x'] } }),
  'Check your understanding',
);
assert.strictEqual(
  questionHeading({ kind: 'review', conceptTitle: 'Partition Tolerance and the CAP Trade-off' }),
  'Partition Tolerance and the CAP Trade-off',
);
// Review with no concept title falls back to the warm label (never blank).
assert.strictEqual(questionHeading({ kind: 'review' }), 'Check your understanding');

// Eyebrow.
assert.strictEqual(questionEyebrow({ kind: 'quiz' }), 'Practice');
assert.strictEqual(questionEyebrow({ kind: 'review' }), 'Review');

// Focus chip: first tag, readable; null when missing or over-long.
assert.strictEqual(
  questionFocus({ kind: 'quiz', question: { concept_tags: ['partition tolerance'] } }),
  'Partition Tolerance',
);
assert.strictEqual(
  questionFocus({ kind: 'quiz', question: { concept_tags: ['CAP'] } }),
  'CAP',
  'existing casing/acronyms preserved',
);
assert.strictEqual(questionFocus({ kind: 'quiz', question: { concept_tags: [] } }), null);
assert.strictEqual(questionFocus({ kind: 'quiz', question: {} }), null);
assert.strictEqual(questionFocus({ kind: 'quiz' }), null);
assert.strictEqual(
  questionFocus({ kind: 'quiz', question: { concept_tags: ['x'.repeat(41)] } }),
  null,
  'overly long tags are not shown',
);

// Coaching context: whitelisted reasons map; everything else is null.
assert.strictEqual(
  taskContextLine({ reason: 'At risk of forgetting' }),
  "You're starting to forget this — let's lock it in.",
);
assert.strictEqual(taskContextLine({ reason: 'Weak area' }), "Let's strengthen this weak spot.");
assert.strictEqual(
  taskContextLine({ reason: 'Due before your deadline' }),
  'This helps keep you on track for your deadline.',
);
assert.strictEqual(
  taskContextLine({ reason: 'Finish the chapter you started' }),
  'Picking up where you left off.',
);
// Flashcard / internal / unknown reasons never render (no jargon leak).
assert.strictEqual(taskContextLine({ reason: 'Overdue flashcard' }), null);
assert.strictEqual(taskContextLine({ reason: 'Flashcard due' }), null);
assert.strictEqual(taskContextLine({ reason: 'New question' }), null);
assert.strictEqual(taskContextLine({}), null);
assert.strictEqual(taskContextLine({ reason: 'whatever internal string' }), null);

// --- Chapter quiz badge: calm + hidden before starting ----------------------
assert.strictEqual(quizBadge('READY', false), null, 'READY hidden on not-started');
assert.strictEqual(quizBadge('NOT_STARTED', false), null, 'NOT_STARTED hidden');
assert.strictEqual(quizBadge('NOT_STARTED', true), null);
assert.deepStrictEqual(quizBadge('READY', true), { text: 'Ready' });
assert.deepStrictEqual(quizBadge('GENERATING', false), { text: 'Preparing…' });
assert.deepStrictEqual(quizBadge('FAILED', true), { text: 'Couldn’t prepare practice' });
// No raw internal badge wording leaks.
for (const s of ['READY', 'GENERATING', 'FAILED', 'NOT_STARTED']) {
  for (const started of [true, false]) {
    const b = quizBadge(s, started);
    if (b) assert.ok(!/Quiz (ready|failed|not started)|Generating quiz/.test(b.text), `no raw badge: ${s}`);
  }
}

// --- Chapter question count copy --------------------------------------------
assert.strictEqual(chapterQuestionsLabel({ started: false, total: 7 }), '7 practice questions');
assert.strictEqual(chapterQuestionsLabel({ started: false, total: 1 }), '1 practice question');
assert.strictEqual(chapterQuestionsLabel({ started: false, total: 0 }), 'Questions are being prepared');
assert.strictEqual(chapterQuestionsLabel({ started: true, answered: 2, total: 7 }), '2 / 7 questions');
assert.strictEqual(chapterQuestionsLabel({ started: true, total: 7 }), '0 / 7 questions');

// --- Chapter CTA label ------------------------------------------------------
assert.strictEqual(chapterCtaLabel(undefined), 'Start here');
assert.strictEqual(chapterCtaLabel('NOT_STARTED'), 'Start here');
assert.strictEqual(chapterCtaLabel('IN_PROGRESS'), 'Continue chapter');
assert.strictEqual(chapterCtaLabel('COMPLETED'), 'Review chapter');

// --- Progressive disclosure: short cards by default, full depth on demand ----
// Cards show only the first couple of items, keeping the page scannable.
assert.strictEqual(DEFAULT_VISIBLE_OBJECTIVES, 2, 'chapter cards show 2 objectives by default');
assert.strictEqual(DEFAULT_VISIBLE_FOCUS_AREAS, 2, 'focus block shows 2 areas by default');
// Show more / less toggle copy (coach-like, no internal wording).
assert.strictEqual(showMoreLabel(false), 'Show more');
assert.strictEqual(showMoreLabel(true), 'Show less');
// Subtle details toggle (used to tuck away raw "Covers:" concept lists).
assert.strictEqual(detailsToggleLabel(false), 'Show details');
assert.strictEqual(detailsToggleLabel(true), 'Hide details');
// Focus-list toggle reads as a clear, learner-facing affordance.
assert.strictEqual(focusListToggleLabel(false), 'Show more focus areas');
assert.strictEqual(focusListToggleLabel(true), 'Show fewer');
assert.strictEqual(SHOW_MORE_FOCUS_LABEL, 'Show more focus areas');
// None of the disclosure copy leaks internal/raw vocabulary.
for (const s of [
  showMoreLabel(true),
  showMoreLabel(false),
  detailsToggleLabel(true),
  detailsToggleLabel(false),
  focusListToggleLabel(true),
  focusListToggleLabel(false),
]) {
  assert.ok(!/Covers:|Mastery|Retention|NOT_STARTED|difficulty/.test(s), `disclosure copy leaks: "${s}"`);
}

// --- Flashcard post-rating copy: friendly, no raw enum ----------------------
assert.strictEqual(flashcardRatedLine('HARD', 1), 'Marked as hard · next review tomorrow');
assert.strictEqual(flashcardRatedLine('GOOD', 4), 'Marked as good · next review in 4 days');
assert.strictEqual(flashcardRatedLine('AGAIN', 0), 'Marked as again · next review later today');
assert.strictEqual(flashcardRatedLine('EASY', 10), 'Marked as easy · next review in 10 days');
assert.ok(!/HARD|GOOD|AGAIN|EASY|Rated /.test(flashcardRatedLine('HARD', 1)), 'no raw "Rated HARD" style');

// --- Home mode + copy -------------------------------------------------------
assert.strictEqual(homeMode({ hasCourses: false, loadingCourses: false }), 'first-run');
assert.strictEqual(homeMode({ hasCourses: false, loadingCourses: true }), 'returning', 'no first-run flash while loading');
assert.strictEqual(homeMode({ hasCourses: true, loadingCourses: false }), 'returning');
assert.strictEqual(homeMode({ hasCourses: true, loadingCourses: true }), 'returning');

assert.strictEqual(HOME_HERO_HEADLINE, 'Turn any video or PDF into a guided learning path.');
assert.match(HOME_VALUE_PROP, /what to study next/i);
assert.strictEqual(TODAYS_PLAN_LABEL, "Today's learning plan");
assert.strictEqual(CONTINUE_LEARNING_LABEL, 'Continue learning');
assert.strictEqual(YOUR_COURSES_LABEL, 'Your courses');
assert.strictEqual(CREATE_LEARNING_PATH_LABEL, 'Create learning path');
assert.ok(CAUGHT_UP_TITLE.length > 0 && CAUGHT_UP_BODY.length > 0);

// No internal/generator wording in the home copy.
const homeCopy = [
  HOME_HERO_HEADLINE,
  HOME_VALUE_PROP,
  TODAYS_PLAN_LABEL,
  CONTINUE_LEARNING_LABEL,
  YOUR_COURSES_LABEL,
  CREATE_LEARNING_PATH_LABEL,
  CAUGHT_UP_TITLE,
  CAUGHT_UP_BODY,
].join(' | ');
for (const bad of ['adaptive AI course', "Today's Goal", 'Start Session', 'My Courses', '/day target']) {
  assert.ok(!homeCopy.includes(bad), `home copy leaks "${bad}"`);
}

// --- No internal vocabulary leaks across any produced copy ------------------
const FORBIDDEN = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'COMPARISON',
  'Overdue flashcard',
  'Mastery',
  'Quizzes',
  'Retention',
  'Reviews',
];
const allCopy = [
  fresh.headline,
  fresh.status,
  mid.headline,
  mid.status,
  ...Object.values(CHAPTER_STATUS_LABELS).map((v) => v.text),
  sessionProgressLabel(0, 20),
].join(' | ');
for (const tok of FORBIDDEN) {
  assert.ok(!allCopy.includes(tok), `learner copy leaks "${tok}"`);
}

console.log('learnerCopy.test.ts OK');
