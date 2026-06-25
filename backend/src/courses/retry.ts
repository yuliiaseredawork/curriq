// Pure decision logic for manual course retry. Keeps the "what can be retried
// and how" rules out of the route so they're unit-testable. The actual atomic
// guard against double-retry lives in the DB (conditional transition); this only
// decides eligibility + which pipeline to re-run.

export type RetrySource = { status: string; sourceType?: string | null };

export type RetryPlan =
  | { ok: false; reason: 'NOT_FAILED' | 'UNKNOWN_SOURCE' }
  | { ok: true; pipeline: 'YOUTUBE' | 'PDF' };

export function planCourseRetry(course: RetrySource): RetryPlan {
  // Idempotency: only a FAILED course is retryable. After the first retry flips
  // it to CREATED, any further retry sees a non-FAILED status and is rejected.
  if (course.status !== 'FAILED') return { ok: false, reason: 'NOT_FAILED' };

  const sourceType = course.sourceType ?? 'YOUTUBE_PLAYLIST';
  if (sourceType === 'PDF') return { ok: true, pipeline: 'PDF' };
  if (sourceType === 'YOUTUBE_PLAYLIST' || sourceType === 'YOUTUBE_VIDEO') {
    return { ok: true, pipeline: 'YOUTUBE' };
  }
  return { ok: false, reason: 'UNKNOWN_SOURCE' };
}
