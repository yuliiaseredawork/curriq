// Local check:  npx tsx backend/src/courses/session.test.ts
import assert from 'node:assert';
import {
  buildSession,
  estimateMinutes,
  pickNextBestAction,
  type FlashcardCandidate,
  type ConceptCandidate,
  type QuizCandidate,
} from './session';

const now = new Date('2026-06-23T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

const overdueCard: FlashcardCandidate = {
  courseId: 'c1', courseTitle: 'C1', cardId: 'card-late', concept: 'X',
  type: 'definition', front: 'front', difficulty: 'medium', nextReviewAt: daysAgo(3),
};
const newCard: FlashcardCandidate = {
  courseId: 'c1', courseTitle: 'C1', cardId: 'card-new', concept: 'Y',
  type: 'definition', front: 'front', difficulty: 'medium', nextReviewAt: now.toISOString(),
};

const atRisk: ConceptCandidate = {
  courseId: 'c1', courseTitle: 'C1', conceptSlug: 'at-risk', conceptTitle: 'At Risk',
  reviewId: 'c1::at-risk::q1', question: { id: 'q1' }, masteryScore: 55, state: 'PRACTICING',
  nextReviewAt: daysAgo(2), reviewedBefore: true,
};
const deadlineConcept: ConceptCandidate = {
  courseId: 'c1', courseTitle: 'C1', conceptSlug: 'deadline', conceptTitle: 'Deadline',
  reviewId: 'c1::deadline::q1', question: { id: 'q1' }, masteryScore: 40, state: 'NEEDS_REVIEW',
  reviewedBefore: false, deadlineDaysLeft: 2,
};
const weakConcept: ConceptCandidate = {
  courseId: 'c1', courseTitle: 'C1', conceptSlug: 'weak', conceptTitle: 'Weak',
  reviewId: 'c1::weak::q1', question: { id: 'q1' }, masteryScore: 30, state: 'NEEDS_REVIEW',
  reviewedBefore: false,
};
const quiz: QuizCandidate = {
  courseId: 'c1', courseTitle: 'C1', chapterId: 'ch1', questionId: 'qz1', question: { id: 'qz1' },
};

// --- Tier ordering: flashcard > at-risk > deadline > weak > quiz ----------
const tasks = buildSession({
  flashcards: [newCard, overdueCard],
  concepts: [weakConcept, deadlineConcept, atRisk],
  quiz: [quiz],
  now,
});

const order = tasks.map((t) =>
  t.kind === 'flashcard' ? `fc:${t.cardId}` : t.kind === 'review' ? `rv:${t.conceptSlug}` : `qz:${t.questionId}`,
);
console.log('order:', order);

// Highest must be the overdue flashcard; lowest the quiz question.
assert.strictEqual(order[0], 'fc:card-late', 'overdue flashcard ranks first');
assert.strictEqual(order[order.length - 1], 'qz:qz1', 'new quiz question ranks last');

// Overdue card outranks the brand-new card.
assert.ok(order.indexOf('fc:card-late') < order.indexOf('fc:card-new'));

// Concept tiers: at-risk > deadline > weak.
assert.ok(order.indexOf('rv:at-risk') < order.indexOf('rv:deadline'), 'at-risk before deadline');
assert.ok(order.indexOf('rv:deadline') < order.indexOf('rv:weak'), 'deadline before weak');

// Reasons are tier-appropriate.
const byId = new Map(tasks.map((t) => [t.kind === 'review' ? t.conceptSlug : '', t.reason]));
assert.strictEqual(byId.get('at-risk'), 'At risk of forgetting');
assert.strictEqual(byId.get('deadline'), 'Due before your deadline');
assert.strictEqual(byId.get('weak'), 'Weak area');

// --- Cap ------------------------------------------------------------------
const many: FlashcardCandidate[] = Array.from({ length: 50 }, (_, i) => ({
  ...overdueCard, cardId: `card-${i}`,
}));
const capped = buildSession({ flashcards: many, concepts: [], quiz: [], now, cap: 20 });
assert.strictEqual(capped.length, 20, 'queue capped at 20');

// --- Interleave: a leading block of one kind gets broken up early ----------
// Without interleave the 6 same-band flashcards would all come before any
// review. Interleave should surface a review within the first few tasks while
// both kinds are available.
const mixFlash: FlashcardCandidate[] = Array.from({ length: 6 }, (_, i) => ({
  ...overdueCard, cardId: `f${i}`,
}));
const mixConcepts: ConceptCandidate[] = Array.from({ length: 6 }, (_, i) => ({
  ...atRisk, conceptSlug: `r${i}`, reviewId: `c1::r${i}::q1`,
}));
const mixed = buildSession({ flashcards: mixFlash, concepts: mixConcepts, quiz: [], now });
const firstFour = mixed.slice(0, 4).map((t) => t.kind);
console.log('interleaved head:', firstFour);
assert.ok(firstFour.includes('review'), 'a review appears in the first 4 tasks');
assert.ok(firstFour.includes('flashcard'), 'a flashcard appears in the first 4 tasks');
// And no same-kind run longer than 2 while both kinds are still in play.
let leadRun = 1;
for (let i = 1; i < mixed.length && mixed.slice(i).some((t) => t.kind !== mixed[i].kind); i++) {
  leadRun = mixed[i].kind === mixed[i - 1].kind ? leadRun + 1 : 1;
  assert.ok(leadRun <= 2, `no 3+ same-kind run while alternatives remain (pos ${i})`);
}

// --- Minutes --------------------------------------------------------------
assert.strictEqual(estimateMinutes([]), 1, 'minutes floor at 1');
const mins = estimateMinutes(
  buildSession({ flashcards: [overdueCard, newCard], concepts: [atRisk], quiz: [], now }),
);
assert.strictEqual(mins, Math.round(0.5 + 0.5 + 1.5), 'minutes = sum of per-task estimates');

// --- nextBestAction = the single highest-priority task ---------------------
const nba = pickNextBestAction(tasks);
assert.ok(nba && nba.type === 'FLASHCARD' && nba.cardId === 'card-late', 'nextBestAction is the top task');
assert.strictEqual(pickNextBestAction([]), null, 'no tasks → null next action');

// --- Estimated learning gain orders WITHIN a tier (lower mastery first) -----
const weakHigh: ConceptCandidate = {
  ...weakConcept, conceptSlug: 'weak-high', reviewId: 'c1::weak-high::q1', masteryScore: 80,
};
const weakLow: ConceptCandidate = {
  ...weakConcept, conceptSlug: 'weak-low', reviewId: 'c1::weak-low::q1', masteryScore: 30,
};
const gainOrder = buildSession({ flashcards: [], concepts: [weakHigh, weakLow], quiz: [], now }).map(
  (t) => (t.kind === 'review' ? t.conceptSlug : ''),
);
assert.ok(gainOrder.indexOf('weak-low') < gainOrder.indexOf('weak-high'), 'lower mastery = higher learning gain ranks first');

// --- Unfinished-chapter boost ---------------------------------------------
const startedQuiz: QuizCandidate = {
  courseId: 'c1', courseTitle: 'C1', chapterId: 'chA', questionId: 'qa', question: { id: 'qa' },
  chapterAnswered: 4, chapterTotal: 5,
};
const freshQuiz: QuizCandidate = {
  courseId: 'c1', courseTitle: 'C1', chapterId: 'chB', questionId: 'qb', question: { id: 'qb' },
  chapterAnswered: 0, chapterTotal: 5,
};
const qzOrder = buildSession({ flashcards: [], concepts: [], quiz: [freshQuiz, startedQuiz], now });
assert.ok(
  qzOrder.findIndex((t) => t.kind === 'quiz' && t.questionId === 'qa') <
    qzOrder.findIndex((t) => t.kind === 'quiz' && t.questionId === 'qb'),
  'started-chapter question ranks before a brand-new chapter',
);
const startedReason = qzOrder.find((t) => t.kind === 'quiz' && t.questionId === 'qa')!.reason;
assert.strictEqual(startedReason, 'Finish the chapter you started');

// Boosted quiz must still rank below a concept review (stays in tier 5).
const tierSafe = buildSession({ flashcards: [], concepts: [weakConcept], quiz: [startedQuiz], now });
assert.strictEqual(tierSafe[0].kind, 'review', 'a boosted quiz never outranks a concept review');

console.log('session.test.ts OK');
