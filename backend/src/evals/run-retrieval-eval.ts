/**
 * Retrieval eval: does the top-K retrieval actually surface chunks that
 * contain the answer to each query?
 *
 *   pnpm eval:retrieval --dataset backend/src/evals/datasets/retrieval-smoke.json --topK 5
 *
 * Requires: OPENAI_API_KEY, ANTHROPIC_API_KEY, SEARCH_CHUNKS_FUNCTION_NAME,
 * AWS creds/region, and EVAL_COURSE_ID (or --courseId) unless the dataset
 * items carry their own courseId.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from './env';
import { searchChunks } from './retrieval';
import { retrievalJudge } from './judges';
import { writeReport, ratio } from './report-writer';
import type { RetrievalEvalItem, RetrievalEvalResult } from './types';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Loose containment: does any chunk text contain the gold quote (whitespace/case-insensitive)? */
function quoteHit(quote: string, chunks: { text: string }[]): boolean {
  const needle = normalize(quote);
  return chunks.some((c) => normalize(c.text).includes(needle));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetPath =
    (typeof args.dataset === 'string' && args.dataset) ||
    'backend/src/evals/datasets/retrieval-smoke.json';
  const topK = Number(args.topK ?? 5);
  const courseIdOverride =
    (typeof args.courseId === 'string' && args.courseId) ||
    process.env.EVAL_COURSE_ID ||
    undefined;

  const absDataset = path.resolve(process.cwd(), datasetPath);
  if (!fs.existsSync(absDataset)) {
    throw new Error(`Dataset not found: ${absDataset}`);
  }
  const items: RetrievalEvalItem[] = JSON.parse(
    fs.readFileSync(absDataset, 'utf8'),
  );

  console.log(
    `\nRunning retrieval eval — ${items.length} items, topK=${topK}\n` +
      `dataset: ${datasetPath}\n`,
  );

  const results: RetrievalEvalResult[] = [];

  for (const item of items) {
    const courseId = courseIdOverride ?? item.courseId;
    if (!courseId) {
      throw new Error(
        `Item "${item.id}" has no courseId. Set EVAL_COURSE_ID or --courseId, ` +
          `or add courseId to the dataset.`,
      );
    }

    process.stdout.write(`  • ${item.id} … `);

    const chunks = await searchChunks({ courseId, query: item.query, limit: topK });
    const retrievedChunkIds = chunks.map((c) => String(c.id));

    const hitByChunkId = item.goldChunkId
      ? retrievedChunkIds.includes(item.goldChunkId)
      : undefined;
    const hitBySourceQuote = item.goldSourceQuote
      ? quoteHit(item.goldSourceQuote, chunks)
      : undefined;

    const judged = await retrievalJudge({
      query: item.query,
      expectedAnswer: item.expectedAnswer,
      chunks,
    });

    results.push({
      itemId: item.id,
      courseId,
      query: item.query,
      topK,
      retrievedChunkIds,
      hitByChunkId,
      hitBySourceQuote,
      judgeContainsAnswer: judged.containsAnswer,
      judgeExplanation: judged.explanation,
    });

    console.log(judged.containsAnswer ? 'contains answer ✓' : 'MISS ✗');
  }

  // ---- Summary ----
  const total = results.length;
  const contained = results.filter((r) => r.judgeContainsAnswer).length;

  const withGoldChunk = results.filter((r) => r.hitByChunkId !== undefined);
  const goldChunkHits = withGoldChunk.filter((r) => r.hitByChunkId).length;

  const withGoldQuote = results.filter((r) => r.hitBySourceQuote !== undefined);
  const goldQuoteHits = withGoldQuote.filter((r) => r.hitBySourceQuote).length;

  const failures = results.filter((r) => !r.judgeContainsAnswer);

  const report = {
    kind: 'retrieval',
    generatedAt: new Date().toISOString(),
    dataset: datasetPath,
    topK,
    summary: {
      total,
      containsAnswer: contained,
      containsAnswerRate: total ? contained / total : 0,
      goldChunkHits: withGoldChunk.length ? goldChunkHits : null,
      goldQuoteHits: withGoldQuote.length ? goldQuoteHits : null,
      failedItemIds: failures.map((f) => f.itemId),
    },
    results,
  };

  const file = writeReport('retrieval', report);

  console.log('\nRetrieval Eval Summary');
  console.log(`Items: ${total}`);
  console.log(`Contains answer: ${ratio(contained, total)}`);
  if (withGoldChunk.length)
    console.log(`Gold chunk hit: ${ratio(goldChunkHits, withGoldChunk.length)}`);
  if (withGoldQuote.length)
    console.log(`Gold quote hit: ${ratio(goldQuoteHits, withGoldQuote.length)}`);

  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`  - ${f.itemId}: ${f.judgeExplanation}`);
    }
  }

  console.log(`\nReport: ${file}\n`);
}

main().catch((err) => {
  console.error('\nRetrieval eval failed:', err.message ?? err);
  process.exit(1);
});
