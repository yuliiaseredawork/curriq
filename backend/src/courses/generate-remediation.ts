// Focus Areas V2.1: consolidate a learner's raw mistake concepts into a few
// canonical, human-readable focus areas, then pre-generate a remediation set
// per canonical area so Practice opens instantly.
//
// Invoked async (Event) when a mistake is recorded and lazily from the
// focus-areas dashboard. Reads mistakes, normalizes + LLM-consolidates, upserts
// canonical mastery records (preserving prior progress), and generates one
// remediation set per canonical area.

import OpenAI from 'openai';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

import { generateRemediation } from '../agents/remediation-writer';
import { consolidateFocusAreas } from '../agents/focus-consolidator';
import { generateFlashcards } from '../agents/flashcard-writer';
import { listCardsForConcept, putCard, newCard } from '../storage/flashcards';
import { saveRemediationSet, loadRemediationSet } from '../storage/course-artifacts';
import {
  getMastery,
  putMastery,
  listMastery,
  type MasteryRecord,
} from '../storage/focus-areas';
import { getCourseMistakes } from '../storage/study-state';
import { slugifyConcept, INITIAL_SCORE } from './mastery';
import { dedupeTags, normalizeTag, tagOverlap } from './concept-normalize';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const lambda = new LambdaClient({});

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

async function searchChunks(courseId: string, query: string, limit: number) {
  const embedding = await embed(query);
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(JSON.stringify({ courseId, embedding, limit })),
    }),
  );
  const raw = response.Payload ? new TextDecoder().decode(response.Payload) : '';
  if (response.FunctionError) {
    throw new Error(`SearchChunksFn failed: ${response.FunctionError} ${raw}`);
  }
  return raw ? JSON.parse(raw) : { results: [] };
}

function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

export const handler = async (event: {
  courseId: string;
  userId: string;
  force?: boolean;
}) => {
  const { courseId, userId } = event;
  console.log('[consolidate-focus] start', { courseId, userId });

  const mistakes = await getCourseMistakes({ userId, courseId });
  const rawTags = mistakes.flatMap((m: any) => (m.conceptTags as string[]) ?? []);
  if (!rawTags.length) {
    console.log('[consolidate-focus] no mistakes/tags', { courseId, userId });
    return { consolidated: 0 };
  }

  const deduped = dedupeTags(rawTags);
  const countByNorm = new Map(deduped.map((d) => [d.tag, d.count]));
  const sampleGaps = mistakes
    .map((m: any) => m.explanation as string)
    .filter(Boolean)
    .slice(0, 8);

  const areas = await consolidateFocusAreas({ concepts: deduped, sampleGaps });
  console.log('[consolidate-focus] areas', {
    courseId,
    count: areas.length,
    titles: areas.map((a) => a.title),
  });

  const existing = (await listMastery(userId, courseId)).filter((r) => r.isCanonical);
  const used = new Set<string>();
  const now = new Date().toISOString();

  for (const area of areas) {
    // Reuse an existing canonical record with the most overlapping raw concepts
    // (keeps slug stable + preserves mastery progress across re-consolidations).
    const match = existing
      .filter((e) => !used.has(e.conceptSlug))
      .map((e) => ({ e, ov: tagOverlap(area.rawConcepts, e.rawConcepts ?? []) }))
      .filter((x) => x.ov > 0)
      .sort((a, b) => b.ov - a.ov)[0]?.e;

    const slug = match
      ? match.conceptSlug
      : uniqueSlug(slugifyConcept(area.title), used);
    used.add(slug);

    const prev = match ?? (await getMastery(userId, courseId, slug));
    const mistakeCount = area.rawConcepts.reduce(
      (sum, rc) => sum + (countByNorm.get(normalizeTag(rc)) ?? 1),
      0,
    );
    const masteryScore = prev?.masteryScore ?? INITIAL_SCORE;

    const record: MasteryRecord = {
      userId,
      courseId,
      conceptSlug: slug,
      isCanonical: true,
      title: area.title,
      concept: area.title, // backward-compat with code reading .concept
      shortDescription: area.shortDescription,
      whyItMatters: area.whyItMatters,
      rawConcepts: area.rawConcepts,
      state: prev?.state ?? 'NEEDS_REVIEW',
      masteryScore,
      mistakeCount,
      priority: mistakeCount * (100 - masteryScore),
      remediationReady: prev?.remediationReady ?? false,
      completedSessions: prev?.completedSessions ?? 0,
      lastPracticedAt: prev?.lastPracticedAt,
      history: prev?.history ?? [{ date: now, score: masteryScore }],
      updatedAt: now,
    };

    try {
      const needRemediation = event.force || !(await loadRemediationSet(courseId, slug));
      const existingCards = await listCardsForConcept(userId, courseId, slug);
      const needCards = existingCards.length === 0;
      record.remediationReady = !needRemediation; // already had a set

      if (needRemediation || needCards) {
        const query = [area.title, ...area.rawConcepts].join(', ');
        const search = await searchChunks(courseId, query, 8);
        if (search.results?.length) {
          if (needRemediation) {
            const set = await generateRemediation({ concept: area.title, chunks: search.results });
            await saveRemediationSet(courseId, slug, set);
            record.remediationReady = true;
          }
          if (needCards) {
            const cards = await generateFlashcards({
              concept: area.title,
              chunks: search.results,
              mistakes: sampleGaps,
              count: 4,
            });
            let i = 0;
            for (const card of cards) {
              await putCard(
                newCard({
                  cardId: `${slug}-${i++}`,
                  userId,
                  courseId,
                  conceptSlug: slug,
                  concept: area.title,
                  type: card.type,
                  front: card.front,
                  back: card.back,
                  sourceChunkIds: card.sourceChunkIds,
                  sourceQuote: card.sourceQuote,
                  misconceptionTarget: card.misconceptionTarget,
                  difficulty: card.difficulty,
                }),
              );
            }
            console.log('[consolidate-focus] flashcards generated', {
              courseId,
              slug,
              count: cards.length,
            });
          }
        }
      }
    } catch (e: any) {
      console.error('[consolidate-focus] remediation/flashcards failed', {
        courseId,
        slug,
        error: String(e?.message ?? e),
      });
    }

    await putMastery(record);
  }

  return { consolidated: areas.length };
};
