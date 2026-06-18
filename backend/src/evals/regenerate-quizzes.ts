/**
 * Dev/eval helper: regenerate saved quizzes for a course using the CURRENT
 * quiz-writer code, without deploying. Mirrors the production POST /quizzes
 * loop (load outline -> per chapter: retrieve chunks -> generateQuiz -> saveQuiz).
 *
 *   pnpm tsx backend/src/evals/regenerate-quizzes.ts --courseId <id> [--chapterId chapter-2] [--topK 10]
 *
 * Requires: OPENAI_API_KEY, ANTHROPIC_API_KEY, SEARCH_CHUNKS_FUNCTION_NAME,
 * PROCESSED_BUCKET, AWS creds/region, and EVAL_COURSE_ID (or --courseId).
 *
 * NOTE: this overwrites quiz artifacts in PROCESSED_BUCKET for the course.
 */

import { parseArgs, resolveCourseId } from './env';
import { searchChunks } from './retrieval';
import { generateQuiz } from '../agents/quiz-writer';
import { loadOutline, saveQuiz } from '../storage/course-artifacts';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const courseId = resolveCourseId(args);
  const onlyChapter = typeof args.chapterId === 'string' ? args.chapterId : undefined;
  const topK = Number(args.topK ?? 10);

  const outline = await loadOutline(courseId);
  const chapters: any[] = (outline.chapters ?? []).filter(
    (ch: any) => !onlyChapter || ch.id === onlyChapter,
  );

  if (!chapters.length) {
    throw new Error(
      onlyChapter
        ? `Chapter ${onlyChapter} not found in outline.`
        : 'Outline has no chapters.',
    );
  }

  console.log(`\nRegenerating quizzes — course ${courseId}, ${chapters.length} chapter(s)\n`);

  for (const chapter of chapters) {
    process.stdout.write(`  • ${chapter.id} (${chapter.title}) … `);

    const query = [
      chapter.title,
      chapter.summary,
      ...(chapter.learning_objectives ?? []),
    ].join('\n');

    const chunks = await searchChunks({ courseId, query, limit: topK });
    if (!chunks.length) {
      console.log('NO CHUNKS — skipped');
      continue;
    }

    const quiz = await generateQuiz({
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterSummary: chapter.summary,
      learningObjectives: chapter.learning_objectives ?? [],
      chunks: chunks.map((c) => ({
        id: c.id,
        video_id: c.video_id ?? '',
        text: c.text,
      })),
    });

    await saveQuiz(courseId, chapter.id, quiz);
    console.log(`saved ${quiz.questions.length} questions`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\nRegenerate quizzes failed:', err.message ?? err);
  process.exit(1);
});
