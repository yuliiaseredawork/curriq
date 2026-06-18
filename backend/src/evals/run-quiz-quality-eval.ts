/**
 * Quiz quality eval: are generated quiz questions exam-oriented, do their
 * distractors reflect real misconceptions, and is the answer source-grounded?
 *
 *   pnpm eval:quiz --courseId <courseId> [--topK 10]
 *
 * Loads the outline + saved quizzes, retrieves chunks per chapter for the
 * grounding check, and judges each question (scores 1-5).
 *
 * Requires: OPENAI_API_KEY, ANTHROPIC_API_KEY, SEARCH_CHUNKS_FUNCTION_NAME,
 * PROCESSED_BUCKET, AWS creds/region, and EVAL_COURSE_ID (or --courseId).
 */

import { parseArgs, resolveCourseId } from './env';
import { searchChunks } from './retrieval';
import { quizQuestionJudge } from './judges';
import { writeReport, avg } from './report-writer';
import { loadOutline, loadQuiz } from '../storage/course-artifacts';
import type { EvalChunk, QuizQualityEvalResult } from './types';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const courseId = resolveCourseId(args);
  const topK = Number(args.topK ?? 10);

  const outline = await loadOutline(courseId);
  const chapters: any[] = outline.chapters ?? [];

  console.log(`\nRunning quiz quality eval — course ${courseId}, ${chapters.length} chapters\n`);

  const results: QuizQualityEvalResult[] = [];
  let chaptersWithQuiz = 0;

  for (const chapter of chapters) {
    let quiz: any;
    try {
      quiz = await loadQuiz(courseId, chapter.id);
    } catch {
      console.log(`  • ${chapter.id}: no saved quiz, skipping`);
      continue;
    }
    chaptersWithQuiz++;

    const questions: any[] = quiz.questions ?? [];
    if (!questions.length) {
      console.log(`  • ${chapter.id}: quiz has no questions, skipping`);
      continue;
    }

    // Retrieve chunks once per chapter for the source-grounding check.
    const query = `${chapter.title}\n${chapter.summary}`;
    const chunks: EvalChunk[] = await searchChunks({ courseId, query, limit: topK });

    console.log(`  • ${chapter.id} (${questions.length} questions)`);

    for (const q of questions) {
      const judged = await quizQuestionJudge({ question: q, chunks });
      results.push({
        courseId,
        chapterId: chapter.id,
        questionId: q.id,
        examOrientedScore: judged.examOrientedScore,
        misconceptionDistractorScore: judged.misconceptionDistractorScore,
        sourceGroundedScore: judged.sourceGroundedScore,
        issues: judged.issues,
      });
      console.log(
        `      - ${q.id}: exam=${judged.examOrientedScore} distractor=${judged.misconceptionDistractorScore} grounded=${judged.sourceGroundedScore}`,
      );
    }
  }

  // Distractor score only meaningful for MCQ (short-answer scored as 0/N.A.).
  const distractorScores = results
    .map((r) => r.misconceptionDistractorScore)
    .filter((s) => s > 0);

  const summary = {
    questionsEvaluated: results.length,
    chaptersWithQuiz,
    avgExamOriented: avg(results.map((r) => r.examOrientedScore)),
    avgMisconceptionDistractor: avg(distractorScores),
    avgSourceGrounded: avg(results.map((r) => r.sourceGroundedScore)),
    questionsWithIssues: results.filter((r) => r.issues.length > 0).map((r) => r.questionId),
  };

  const report = {
    kind: 'quiz-quality',
    generatedAt: new Date().toISOString(),
    courseId,
    summary,
    results,
  };

  const file = writeReport('quiz-quality', report);

  console.log('\nQuiz Quality Eval Summary');
  console.log(`Questions evaluated: ${results.length} (across ${chaptersWithQuiz} chapters with quizzes)`);
  console.log(`Avg exam-oriented:        ${summary.avgExamOriented.toFixed(2)} / 5`);
  console.log(`Avg distractor quality:   ${summary.avgMisconceptionDistractor.toFixed(2)} / 5 (MCQ only)`);
  console.log(`Avg source-grounded:      ${summary.avgSourceGrounded.toFixed(2)} / 5`);

  const flagged = results.filter((r) => r.issues.length > 0);
  if (flagged.length) {
    console.log('\nQuestions with issues:');
    for (const r of flagged) {
      console.log(`  - ${r.chapterId}/${r.questionId}:`);
      for (const issue of r.issues) console.log(`      • ${issue}`);
    }
  }

  console.log(`\nReport: ${file}\n`);
}

main().catch((err) => {
  console.error('\nQuiz quality eval failed:', err.message ?? err);
  process.exit(1);
});
