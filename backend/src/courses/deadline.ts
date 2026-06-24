// Pure deadline-intelligence helpers for target-date courses.

export function daysUntil(targetDate: string, now: Date = new Date()): number {
  const ms = new Date(targetDate).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Reviews/day needed to cover the remaining (not-yet-mastered) concepts. */
export function requiredReviewsPerDay(input: {
  remainingConcepts: number;
  daysLeft: number;
}): number {
  if (input.remainingConcepts <= 0) return 0;
  const days = Math.max(1, input.daysLeft);
  return Math.ceil(input.remainingConcepts / days);
}

/**
 * Schedule status relative to an even burn-down: how many concepts *should* be
 * mastered by now vs how many are. Positive daysBehind => behind schedule.
 */
export function scheduleStatus(input: {
  totalConcepts: number;
  masteredConcepts: number;
  daysLeft: number;
  totalDays: number;
}): { onTrack: boolean; daysBehind: number; message: string } {
  const { totalConcepts, masteredConcepts, daysLeft, totalDays } = input;
  if (totalConcepts === 0 || totalDays <= 0) {
    return { onTrack: true, daysBehind: 0, message: 'On track' };
  }
  const elapsed = Math.max(0, totalDays - Math.max(0, daysLeft));
  const expectedMastered = (totalConcepts * elapsed) / totalDays;
  const deficit = expectedMastered - masteredConcepts; // concepts behind
  const perDay = totalConcepts / totalDays || 1;
  const daysBehind = Math.max(0, Math.round(deficit / perDay));

  if (daysLeft < 0) {
    return { onTrack: false, daysBehind, message: 'Deadline passed' };
  }
  if (daysBehind <= 0) return { onTrack: true, daysBehind: 0, message: 'On track' };
  return {
    onTrack: false,
    daysBehind,
    message: `You're ${daysBehind} day${daysBehind === 1 ? '' : 's'} behind schedule.`,
  };
}

/**
 * Estimated likelihood (0–100) of mastering everything before the deadline,
 * comparing the learner's actual mastery pace so far to the pace now required.
 * A heuristic (logistic on the pace ratio), not a calibrated model — display as
 * an estimate. Monotonic: more days left and/or a faster actual pace → higher.
 */
export function deadlineConfidence(input: {
  totalConcepts: number;
  masteredConcepts: number;
  daysLeft: number;
  totalDays: number;
}): number {
  const { totalConcepts, masteredConcepts, daysLeft, totalDays } = input;
  const remaining = totalConcepts - masteredConcepts;
  if (totalConcepts === 0 || remaining <= 0) return 100; // nothing left to learn
  if (daysLeft <= 0) return 0; // out of time with work remaining

  const elapsed = Math.max(1, totalDays - Math.max(0, daysLeft));
  const actualPace = masteredConcepts / elapsed; // concepts mastered/day so far
  const requiredPace = remaining / daysLeft; // concepts/day still needed

  // No progress yet: low confidence, with a little credit for having time.
  if (actualPace <= 0) {
    return Math.max(5, Math.min(40, Math.round((daysLeft / Math.max(1, totalDays)) * 40)));
  }

  const ratio = actualPace / requiredPace; // >=1 means on pace or ahead
  const conf = 100 / (1 + Math.exp(-1.6 * (ratio - 1))); // ratio 1→50, 2→~83
  return Math.max(1, Math.min(99, Math.round(conf)));
}
