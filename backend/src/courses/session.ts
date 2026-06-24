// Session orchestration — pure, no I/O. Turns the learner's already-due items
// (flashcards, concept reviews, new quiz questions) into ONE prioritized,
// interleaved task queue for the unified "Today's Session" flow.
//
// The route (api/routes/session.ts) does all the data loading and answer
// stripping; this module only assigns each candidate a priority + reason,
// orders them, interleaves kinds for variety, caps the queue, and estimates
// minutes. Grading stays in the existing endpoints.
//
// Priority tiers (highest base score → lowest), per the product brief:
//   1. Overdue flashcards         base 500  — already scheduled, now late.
//   2. Concepts at risk           base 400  — reviewed before, overdue, not mastered.
//   3. Deadline-critical concepts base 300  — course near target_date, not mastered.
//   4. Weak concepts              base 200  — low mastery, never scheduled.
//   5. New quiz questions         base 100  — net-new learning (lowest).

export type TaskKind = 'flashcard' | 'review' | 'quiz';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days a scheduled time is past `now` (0 if not yet due). */
function overdueDays(nextReviewAt: string | undefined, now: Date): number {
  if (!nextReviewAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(nextReviewAt).getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Candidate inputs (hydrated by the route) and the resulting tasks.
// ---------------------------------------------------------------------------

export type FlashcardCandidate = {
  courseId: string;
  courseTitle: string;
  cardId: string;
  concept: string;
  type: string;
  front: string;
  difficulty: string;
  nextReviewAt?: string;
};

export type ConceptCandidate = {
  courseId: string;
  courseTitle: string;
  conceptSlug: string;
  conceptTitle: string;
  reviewId: string;
  question: unknown; // answer-stripped
  masteryScore: number;
  state: 'NEEDS_REVIEW' | 'PRACTICING' | 'MASTERED';
  nextReviewAt?: string;
  /** Has the concept ever been scheduled/reviewed (vs. a never-touched backlog item)? */
  reviewedBefore: boolean;
  /** Days until the course deadline, or undefined when the course has no target_date. */
  deadlineDaysLeft?: number;
};

export type QuizCandidate = {
  courseId: string;
  courseTitle: string;
  chapterId: string;
  questionId: string;
  question: unknown; // answer-stripped
  // Chapter progress, for the "finish what you started" boost. Optional so
  // older callers keep working.
  chapterAnswered?: number;
  chapterTotal?: number;
};

type Common = {
  priority: number;
  reason: string;
  estMinutes: number;
  /** Expected mastery headroom for this item (0–50); higher = more to gain. */
  estLearningGain?: number;
};

export type SessionTask =
  | (Common & {
      kind: 'flashcard';
      courseId: string;
      courseTitle: string;
      cardId: string;
      concept: string;
      type: string;
      front: string;
      difficulty: string;
    })
  | (Common & {
      kind: 'review';
      courseId: string;
      courseTitle: string;
      conceptSlug: string;
      conceptTitle: string;
      reviewId: string;
      question: unknown;
    })
  | (Common & {
      kind: 'quiz';
      courseId: string;
      courseTitle: string;
      chapterId: string;
      questionId: string;
      question: unknown;
    });

export const FLASHCARD_MINUTES = 0.5;
export const QA_MINUTES = 1.5;
export const DEFAULT_CAP = 20;

/** Build the prioritized, interleaved, capped session queue. */
export function buildSession(input: {
  flashcards: FlashcardCandidate[];
  concepts: ConceptCandidate[];
  quiz: QuizCandidate[];
  now?: Date;
  cap?: number;
}): SessionTask[] {
  const now = input.now ?? new Date();
  const cap = input.cap ?? DEFAULT_CAP;
  const tasks: SessionTask[] = [];

  // Tier 1 — flashcards (all due cards; truly-overdue ones float above new ones).
  for (const f of input.flashcards) {
    const od = overdueDays(f.nextReviewAt, now);
    tasks.push({
      kind: 'flashcard',
      priority: 500 + od,
      reason: od > 0 ? 'Overdue flashcard' : 'Flashcard due',
      estMinutes: FLASHCARD_MINUTES,
      courseId: f.courseId,
      courseTitle: f.courseTitle,
      cardId: f.cardId,
      concept: f.concept,
      type: f.type,
      front: f.front,
      difficulty: f.difficulty,
    });
  }

  // Tiers 2–4 — concepts. Each concept lands in exactly one tier (first match).
  for (const c of input.concepts) {
    const od = overdueDays(c.nextReviewAt, now);
    // Estimated learning gain = mastery headroom, scaled to 0–50 so it orders
    // items *within* a tier (tiers sit 100 apart and never cross). A concept at
    // 30% mastery (gain 35) beats one at 80% (gain 10) in the same tier.
    const estLearningGain = Math.round(Math.max(0, 100 - c.masteryScore) * 0.5);
    let priority: number;
    let reason: string;

    if (c.reviewedBefore && od > 0 && c.state !== 'MASTERED') {
      priority = 400 + od + estLearningGain; // Tier 2: at risk of forgetting
      reason = 'At risk of forgetting';
    } else if (c.deadlineDaysLeft != null && c.state !== 'MASTERED') {
      // Tier 3: deadline-critical — weight grows as the deadline nears.
      const urgency = Math.max(0, 30 - Math.max(0, c.deadlineDaysLeft));
      priority = 300 + urgency + estLearningGain;
      reason = 'Due before your deadline';
    } else {
      priority = 200 + estLearningGain; // Tier 4: weak / never scheduled
      reason = 'Weak area';
    }

    tasks.push({
      kind: 'review',
      priority,
      reason,
      estMinutes: QA_MINUTES,
      estLearningGain,
      courseId: c.courseId,
      courseTitle: c.courseTitle,
      conceptSlug: c.conceptSlug,
      conceptTitle: c.conceptTitle,
      reviewId: c.reviewId,
      question: c.question,
    });
  }

  // Tier 5 — new quiz questions (lowest). Questions from a chapter the learner
  // has already started get an "unfinished chapter" boost (0–50) so we nudge them
  // to finish what they began before starting a brand-new chapter. The boost is
  // capped under the ~100 tier gap, so quiz tasks never outrank concept reviews.
  input.quiz.forEach((q, i) => {
    const total = q.chapterTotal ?? 0;
    const answered = q.chapterAnswered ?? 0;
    const started = total > 0 && answered > 0 && answered < total;
    const boost = started ? Math.round(50 * (answered / total)) : 0;
    tasks.push({
      kind: 'quiz',
      priority: 100 + boost - i * 0.01,
      reason: started ? 'Finish the chapter you started' : 'New question',
      estMinutes: QA_MINUTES,
      courseId: q.courseId,
      courseTitle: q.courseTitle,
      chapterId: q.chapterId,
      questionId: q.questionId,
      question: q.question,
    });
  });

  tasks.sort((a, b) => b.priority - a.priority);
  return interleave(tasks).slice(0, cap);
}

/**
 * Within how much priority an alternative may be promoted to break a same-kind
 * run. Tiers sit ~100 apart, so this keeps interleaving *within* a tier band and
 * never drags a much-lower item (e.g. a new quiz question) above a higher tier.
 */
const INTERLEAVE_GAP = 80;

/**
 * Break up long runs of the same kind for variety while preserving priority
 * order: when the last two emitted tasks share a kind, swap in the
 * highest-priority remaining task of a different kind — but only if it's within
 * INTERLEAVE_GAP of the item it would displace. Otherwise emit in priority order.
 */
function interleave(sorted: SessionTask[]): SessionTask[] {
  const remaining = [...sorted];
  const out: SessionTask[] = [];
  while (remaining.length) {
    const lastTwo = out.slice(-2).map((t) => t.kind);
    const sameRun = lastTwo.length === 2 && lastTwo[0] === lastTwo[1];
    let idx = 0;
    if (sameRun) {
      const floor = remaining[0].priority - INTERLEAVE_GAP;
      const alt = remaining.findIndex((t) => t.kind !== lastTwo[0] && t.priority >= floor);
      if (alt !== -1) idx = alt;
    }
    out.push(remaining.splice(idx, 1)[0]);
  }
  return out;
}

/** Total estimated minutes for a queue, rounded up to at least 1. */
export function estimateMinutes(tasks: SessionTask[]): number {
  return Math.max(1, Math.round(tasks.reduce((sum, t) => sum + t.estMinutes, 0)));
}

export type NextBestAction = {
  type: 'FLASHCARD' | 'REVIEW' | 'QUIZ';
  reason: string;
  courseId: string;
  courseTitle: string;
  cardId?: string;
  conceptSlug?: string;
  reviewId?: string;
  chapterId?: string;
  questionId?: string;
} | null;

/**
 * The single highest-priority task, projected to the "Continue Learning" shape
 * the UI offers as the one primary action. Null when there's nothing due.
 */
export function pickNextBestAction(tasks: SessionTask[]): NextBestAction {
  const t = tasks[0];
  if (!t) return null;
  const base = { reason: t.reason, courseId: t.courseId, courseTitle: t.courseTitle };
  if (t.kind === 'flashcard') return { type: 'FLASHCARD', ...base, cardId: t.cardId };
  if (t.kind === 'review')
    return { type: 'REVIEW', ...base, conceptSlug: t.conceptSlug, reviewId: t.reviewId };
  return { type: 'QUIZ', ...base, chapterId: t.chapterId, questionId: t.questionId };
}
