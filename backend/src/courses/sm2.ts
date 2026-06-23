// Anki-style SM-2 spaced-repetition scheduling. Pure functions — no I/O.
//
// Quality scale (mapped from grading):
//   0 = Again, 3 = Hard, 4 = Good, 5 = Easy

export type ReviewQuality = 0 | 3 | 4 | 5;
export type QualityLabel = 'Again' | 'Hard' | 'Good' | 'Easy';

export const DEFAULT_EASE = 2.5;
export const MIN_EASE = 1.3;

export type Sm2State = {
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
};

export const initialSm2: Sm2State = {
  repetitions: 0,
  intervalDays: 1,
  easeFactor: DEFAULT_EASE,
};

export function qualityLabel(q: ReviewQuality): QualityLabel {
  return q === 0 ? 'Again' : q === 3 ? 'Hard' : q === 4 ? 'Good' : 'Easy';
}

/** Map a 0-100 grade to an SM-2 quality. MCQ is pass/fail (Good/Again). */
export function scoreToQuality(score: number, type: 'mcq' | 'open'): ReviewQuality {
  if (type === 'mcq') return score >= 100 ? 4 : 0;
  if (score < 50) return 0;
  if (score < 70) return 3;
  if (score < 90) return 4;
  return 5;
}

/**
 * Standard SM-2 update. On quality < 3 the card lapses (repetitions reset,
 * interval back to 1 day). Otherwise interval grows 1 → 6 → round(prev * EF).
 * Ease factor is adjusted and floored at 1.3.
 */
export function schedule(
  prev: Sm2State,
  quality: ReviewQuality,
  now: Date = new Date(),
): Sm2State & { nextReviewAt: string } {
  const ef = prev.easeFactor || DEFAULT_EASE;

  let repetitions: number;
  let intervalDays: number;

  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = prev.repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(prev.intervalDays * ef);
  }

  // EF' = EF + (0.1 - (5-q)*(0.08 + (5-q)*0.02)), floored at MIN_EASE.
  const q = quality;
  const easeFactor = Math.max(
    MIN_EASE,
    +(ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))).toFixed(4),
  );

  const nextReviewAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  return { repetitions, intervalDays, easeFactor, nextReviewAt };
}
