/**
 * Grounding eval: are generated outline chapters (title/summary/objectives)
 * actually supported by source chunks?
 *
 *   pnpm eval:grounding --courseId <courseId> [--topK 8]
 *
 * The outline artifact does not store the source chunk text, so we retrieve
 * chunks for each chapter and judge the generated text against them.
 *
 * Requires: OPENAI_API_KEY, ANTHROPIC_API_KEY, SEARCH_CHUNKS_FUNCTION_NAME,
 * PROCESSED_BUCKET, AWS creds/region, and EVAL_COURSE_ID (or --courseId).
 */

import { parseArgs, resolveCourseId } from './env';
import { searchChunks } from './retrieval';
import { groundingJudge } from './judges';
import { writeReport, avg } from './report-writer';
import { loadOutline } from '../storage/course-artifacts';
import type { GroundingEvalItem, GroundingEvalResult } from './types';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const courseId = resolveCourseId(args);
  const topK = Number(args.topK ?? 8);

  const outline = await loadOutline(courseId);
  const chapters: any[] = outline.chapters ?? [];

  console.log(
    `\nRunning grounding eval — course ${courseId}, ${chapters.length} chapters, topK=${topK}\n`,
  );

  const items: GroundingEvalItem[] = [];
  const results: GroundingEvalResult[] = [];

  for (const chapter of chapters) {
    const id = `${courseId}:${chapter.id}`;
    const generatedText = [
      `Title: ${chapter.title}`,
      `Summary: ${chapter.summary}`,
      ...(chapter.learning_objectives?.length
        ? [`Learning objectives:\n- ${chapter.learning_objectives.join('\n- ')}`]
        : []),
    ].join('\n');

    process.stdout.write(`  • ${chapter.id} (${chapter.title}) … `);

    const query = `${chapter.title}\n${chapter.summary}`;
    const chunks = await searchChunks({ courseId, query, limit: topK });

    items.push({
      id,
      courseId,
      outputType: 'outline',
      generatedText,
      sourceChunks: chunks.map((c) => ({ chunkId: String(c.id), text: c.text })),
    });

    const judged = await groundingJudge({ generatedText, chunks });

    results.push({
      itemId: id,
      supported: judged.supported,
      unsupportedClaims: judged.unsupportedClaims,
      groundingScore: judged.groundingScore,
      explanation: judged.explanation,
    });

    console.log(`score ${judged.groundingScore.toFixed(2)} ${judged.supported ? '✓' : '✗'}`);
  }

  const supported = results.filter((r) => r.supported).length;
  const averageScore = avg(results.map((r) => r.groundingScore));
  const flagged = results.filter((r) => r.unsupportedClaims.length > 0);

  const report = {
    kind: 'grounding',
    generatedAt: new Date().toISOString(),
    courseId,
    topK,
    summary: {
      total: results.length,
      supported,
      averageGroundingScore: averageScore,
      flaggedItemIds: flagged.map((f) => f.itemId),
    },
    items,
    results,
  };

  const file = writeReport('grounding', report);

  console.log('\nGrounding Eval Summary');
  console.log(`Chapters: ${results.length}`);
  console.log(`Fully supported: ${supported}/${results.length}`);
  console.log(`Average grounding score: ${averageScore.toFixed(2)} (1.0 = fully grounded)`);

  if (flagged.length) {
    console.log('\nUnsupported / hallucinated claims:');
    for (const f of flagged) {
      console.log(`  - ${f.itemId} (score ${f.groundingScore.toFixed(2)}):`);
      for (const claim of f.unsupportedClaims) console.log(`      • ${claim}`);
    }
  }

  console.log(`\nReport: ${file}\n`);
}

main().catch((err) => {
  console.error('\nGrounding eval failed:', err.message ?? err);
  process.exit(1);
});
