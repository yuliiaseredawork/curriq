// Blended "learning progress" — pure, no I/O. Replaces the misleading quiz-only
// completion % with a single number that reflects real learning activity across
// the systems we already track. Inputs are computed by the caller (route) from
// mastery records + quiz progress + retention.

export type ProgressBreakdown = {
  avgConceptMastery: number; // 0–100, mean mastery over concepts (weight 0.40)
  quizCompletion: number; // 0–100, answered / total quiz questions (weight 0.30)
  retentionScore: number; // 0–100, mastered / total concepts (weight 0.20)
  reviewActivity: number; // 0–100, reviewed / total concepts (weight 0.10)
};

export function blendProgress(input: {
  avgConceptMastery: number;
  quizCompletion: number;
  retentionScore: number;
  reviewedConcepts: number;
  totalConcepts: number;
}): { learningProgress: number; breakdown: ProgressBreakdown } {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const reviewActivity =
    input.totalConcepts > 0
      ? Math.min(100, (input.reviewedConcepts / input.totalConcepts) * 100)
      : 0;

  const breakdown: ProgressBreakdown = {
    avgConceptMastery: clamp(input.avgConceptMastery),
    quizCompletion: clamp(input.quizCompletion),
    retentionScore: clamp(input.retentionScore),
    reviewActivity: clamp(reviewActivity),
  };

  const learningProgress = Math.round(
    0.4 * breakdown.avgConceptMastery +
      0.3 * breakdown.quizCompletion +
      0.2 * breakdown.retentionScore +
      0.1 * breakdown.reviewActivity,
  );

  return { learningProgress, breakdown };
}
