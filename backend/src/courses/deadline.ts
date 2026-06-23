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
