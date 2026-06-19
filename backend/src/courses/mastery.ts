// Pure mastery scoring + lifecycle helpers for Focus Areas V2.
// No I/O — the storage layer (storage/focus-areas.ts) persists the results.

export type ConceptState = 'NEEDS_REVIEW' | 'PRACTICING' | 'MASTERED';

export const INITIAL_SCORE = 30; // a freshly-missed concept
export const MASTERED_THRESHOLD = 80;
export const PRACTICING_MIN = 50;
export const REPEAT_PENALTY = 20;
export const SESSION_WEIGHT = 0.75; // weight on the latest session score

export type MasteryHistoryPoint = { date: string; score: number };

/** Lowercase, hyphenated slug used as the stable key for a concept. */
export function slugifyConcept(concept: string): string {
  return concept
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'concept';
}

/** Lifecycle state from a score; MASTERED requires a completed session. */
export function stateForScore(
  score: number,
  hasCompletedSession: boolean,
): ConceptState {
  if (score >= MASTERED_THRESHOLD && hasCompletedSession) return 'MASTERED';
  if (score >= PRACTICING_MIN) return 'PRACTICING';
  return 'NEEDS_REVIEW';
}

/**
 * Apply a newly recorded mistake. For a brand-new concept, start at
 * INITIAL_SCORE. For an existing one, penalize (a repeat mistake) and revert to
 * NEEDS_REVIEW.
 */
export function applyMistake(prev?: {
  masteryScore: number;
  mistakeCount: number;
}): { masteryScore: number; mistakeCount: number; state: ConceptState } {
  if (!prev) {
    return { masteryScore: INITIAL_SCORE, mistakeCount: 1, state: 'NEEDS_REVIEW' };
  }
  const masteryScore = Math.max(0, prev.masteryScore - REPEAT_PENALTY);
  return {
    masteryScore,
    mistakeCount: prev.mistakeCount + 1,
    state: 'NEEDS_REVIEW',
  };
}

/**
 * Apply a completed remediation session. new = 0.25*old + 0.75*sessionScore
 * (matches the 42 -> 78 example at sessionScore 90).
 */
export function applySessionResult(
  prevScore: number,
  sessionScore: number,
): { masteryScore: number; state: ConceptState } {
  const masteryScore = Math.round(
    (1 - SESSION_WEIGHT) * prevScore + SESSION_WEIGHT * sessionScore,
  );
  return { masteryScore, state: stateForScore(masteryScore, true) };
}

/** Mastery delta vs the most recent history point >= ~7 days old. */
export function weeklyTrend(
  history: MasteryHistoryPoint[] | undefined,
  currentScore: number,
): number {
  if (!history?.length) return 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  // Most recent point at or before a week ago; else the oldest point we have.
  const older = [...history]
    .filter((p) => new Date(p.date).getTime() <= weekAgo)
    .pop();
  const baseline = older ?? history[0];
  return currentScore - baseline.score;
}
