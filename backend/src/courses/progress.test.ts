// Local check:  npx tsx backend/src/courses/progress.test.ts
import assert from 'node:assert';
import { blendProgress } from './progress';

// Weighted blend: 0.40*mastery + 0.30*quiz + 0.20*retention + 0.10*reviewActivity
const a = blendProgress({
  avgConceptMastery: 80,
  quizCompletion: 50,
  retentionScore: 60,
  reviewedConcepts: 5,
  totalConcepts: 10, // reviewActivity = 50
});
// 0.4*80 + 0.3*50 + 0.2*60 + 0.1*50 = 32 + 15 + 12 + 5 = 64
assert.strictEqual(a.learningProgress, 64);
assert.strictEqual(a.breakdown.reviewActivity, 50);

// No concepts → reviewActivity 0, no divide-by-zero.
const b = blendProgress({
  avgConceptMastery: 0,
  quizCompletion: 0,
  retentionScore: 0,
  reviewedConcepts: 0,
  totalConcepts: 0,
});
assert.strictEqual(b.learningProgress, 0);
assert.strictEqual(b.breakdown.reviewActivity, 0);

// Full marks clamp at 100.
const c = blendProgress({
  avgConceptMastery: 100,
  quizCompletion: 100,
  retentionScore: 100,
  reviewedConcepts: 20,
  totalConcepts: 10, // ratio > 1 → clamped to 100
});
assert.strictEqual(c.learningProgress, 100);
assert.strictEqual(c.breakdown.reviewActivity, 100);

console.log('progress.test.ts OK');
