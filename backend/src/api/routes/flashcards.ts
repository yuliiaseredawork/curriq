import { Hono } from 'hono';
import { z } from 'zod';
import OpenAI from 'openai';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import {
  listCards,
  listCardsForConcept,
  getCard,
  putCard,
  newCard,
  isCardDue,
  applyCardReview,
  type Flashcard,
} from '../../storage/flashcards';
import { listMastery, getMastery, putMastery } from '../../storage/focus-areas';
import { applySessionResult } from '../../courses/mastery';
import { generateFlashcards } from '../../agents/flashcard-writer';
import type { ReviewQuality } from '../../courses/sm2';

export const flashcards = new Hono();
const lambda = new LambdaClient({});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function searchChunks(courseId: string, query: string, limit: number) {
  const embedding = (
    await openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
  ).data[0].embedding;
  const res = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(JSON.stringify({ courseId, embedding, limit })),
    }),
  );
  const raw = res.Payload ? new TextDecoder().decode(res.Payload) : '';
  return raw ? JSON.parse(raw) : { results: [] };
}

const RATING_TO_QUALITY: Record<string, ReviewQuality> = {
  AGAIN: 0,
  HARD: 3,
  GOOD: 4,
  EASY: 5,
};

function frontView(c: Flashcard, courseTitle: string) {
  return {
    cardId: c.cardId,
    courseId: c.courseId,
    courseTitle,
    concept: c.concept,
    type: c.type,
    front: c.front,
    dueAt: c.nextReviewAt ?? null,
    difficulty: c.difficulty,
  };
}

function orderDue(cards: Flashcard[]): Flashcard[] {
  return [...cards].sort((a, b) => {
    const at = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : 0;
    const bt = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : 0;
    return at - bt;
  });
}

function fireConsolidation(courseId: string, userId: string) {
  const fn = process.env.GENERATE_REMEDIATION_FUNCTION_NAME;
  if (!fn) return;
  lambda
    .send(
      new InvokeCommand({
        FunctionName: fn,
        InvocationType: InvocationType.Event,
        Payload: Buffer.from(JSON.stringify({ courseId, userId })),
      }),
    )
    .catch((e) => console.error('[flashcards] gen fire failed', String(e?.message ?? e)));
}

/** Gather due cards across the user's courses; lazily trigger generation. */
async function gatherDue(userId: string, courseIdFilter?: string) {
  const now = new Date();
  const listed = await callCourseMetadata({ action: 'list', userId });
  const courses = (listed.courses ?? []).filter(
    (co: any) => !courseIdFilter || co.courseId === courseIdFilter,
  );

  const due: Array<{ card: Flashcard; courseTitle: string }> = [];
  const byCourse: Record<string, { courseId: string; courseTitle: string; dueCount: number }> = {};

  for (const co of courses) {
    const cards = await listCards(userId, co.courseId);
    if (!cards.length) {
      // No cards yet — if there are focus-area concepts, generate in background.
      const mastery = await listMastery(userId, co.courseId);
      if (mastery.some((m) => m.isCanonical)) fireConsolidation(co.courseId, userId);
      continue;
    }
    for (const card of cards) {
      if (!isCardDue(card, now)) continue;
      due.push({ card, courseTitle: co.title });
      const b = (byCourse[co.courseId] ??= {
        courseId: co.courseId,
        courseTitle: co.title,
        dueCount: 0,
      });
      b.dueCount += 1;
    }
  }
  return { due, byCourse: Object.values(byCourse) };
}

// GET /flashcards/due
flashcards.get('/flashcards/due', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const { due, byCourse } = await gatherDue(userId, c.req.query('courseId') ?? undefined);
    const ordered = orderDue(due.map((d) => d.card));
    const titleById = new Map(due.map((d) => [d.card.cardId, d.courseTitle]));
    return c.json({
      cardsDue: ordered.length,
      estimatedMinutes: Math.max(1, Math.round(ordered.length * 0.5)),
      byCourse,
      cards: ordered.map((card) => frontView(card, titleById.get(card.cardId) ?? '')),
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'FLASHCARDS_UNAVAILABLE', message: e.message }, 500);
  }
});

const NextInput = z.object({ courseId: z.string().optional() }).optional();

// POST /flashcards/next
flashcards.post('/flashcards/next', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const body = NextInput.parse(await c.req.json().catch(() => ({})));
    const { due } = await gatherDue(userId, body?.courseId);
    if (!due.length) return c.json({ status: 'NO_CARDS' });

    const ordered = orderDue(due.map((d) => d.card));
    const card = ordered[0];
    const courseTitle = due.find((d) => d.card.cardId === card.cardId)?.courseTitle ?? '';
    return c.json({
      status: 'CARD',
      ...frontView(card, courseTitle),
      progress: { current: 1, totalDue: ordered.length },
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'FLASHCARD_NEXT_FAILED', message: e.message }, 500);
  }
});

const RevealInput = z.object({ courseId: z.string() });

// POST /flashcards/:cardId/reveal
flashcards.post('/flashcards/:cardId/reveal', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const cardId = c.req.param('cardId');
    const { courseId } = RevealInput.parse(await c.req.json());
    const card = await getCard(userId, courseId, cardId);
    if (!card) return c.json({ error: 'CARD_NOT_FOUND' }, 404);
    return c.json({
      cardId,
      back: card.back,
      sourceQuote: card.sourceQuote ?? null,
      misconceptionTarget: card.misconceptionTarget ?? null,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'CARD_REVEAL_FAILED', message: e.message }, 500);
  }
});

// POST /courses/:courseId/concepts/:concept/cards/generate  (manual, sync)
flashcards.post('/courses/:courseId/concepts/:concept/cards/generate', async (c) => {
  const courseId = c.req.param('courseId');
  const slug = c.req.param('concept');
  try {
    const userId = await getCurrentUserId(c);
    const ownership = await callCourseMetadata({ action: 'getForUser', courseId, userId });
    if (!ownership.course) return c.json({ error: 'COURSE_NOT_FOUND' }, 404);

    const mastery = await getMastery(userId, courseId, slug);
    if (!mastery) return c.json({ error: 'CONCEPT_NOT_FOUND' }, 404);

    const existing = await listCardsForConcept(userId, courseId, slug);
    if (existing.length) return c.json({ cards: existing, regenerated: false });

    const query = [mastery.title ?? mastery.concept, ...(mastery.rawConcepts ?? [])].join(', ');
    const search = await searchChunks(courseId, query, 8);
    if (!search.results?.length) return c.json({ error: 'NO_CHUNKS' }, 404);

    const generated = await generateFlashcards({
      concept: mastery.title ?? mastery.concept,
      chunks: search.results,
      count: 4,
    });
    const cards: Flashcard[] = [];
    let i = 0;
    for (const card of generated) {
      const saved = newCard({
        cardId: `${slug}-${i++}`,
        userId,
        courseId,
        conceptSlug: slug,
        concept: mastery.title ?? mastery.concept,
        type: card.type,
        front: card.front,
        back: card.back,
        sourceChunkIds: card.sourceChunkIds,
        sourceQuote: card.sourceQuote,
        misconceptionTarget: card.misconceptionTarget,
        difficulty: card.difficulty,
      });
      await putCard(saved);
      cards.push(saved);
    }
    return c.json({ cards, regenerated: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'CARD_GENERATE_FAILED', message: e.message }, 500);
  }
});

const RateInput = z.object({
  courseId: z.string(),
  rating: z.enum(['AGAIN', 'HARD', 'GOOD', 'EASY']),
});

// POST /flashcards/:cardId/rate
flashcards.post('/flashcards/:cardId/rate', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const cardId = c.req.param('cardId');
    const { courseId, rating } = RateInput.parse(await c.req.json());

    const card = await getCard(userId, courseId, cardId);
    if (!card) return c.json({ error: 'CARD_NOT_FOUND' }, 404);

    const quality = RATING_TO_QUALITY[rating];
    const updated = applyCardReview(card, quality);
    await putCard(updated);

    // Aggregate into concept mastery (score/state only; cards own the schedule).
    let masteryScore: number | undefined;
    const m = await getMastery(userId, courseId, card.conceptSlug);
    if (m) {
      const reviewScore = quality === 0 ? 20 : quality === 3 ? 60 : quality === 4 ? 80 : 95;
      const res = applySessionResult(m.masteryScore ?? 30, reviewScore);
      const nowIso = new Date().toISOString();
      await putMastery({
        ...m,
        masteryScore: res.masteryScore,
        state: res.state,
        history: [...(m.history ?? []), { date: nowIso, score: res.masteryScore }],
        updatedAt: nowIso,
      });
      masteryScore = res.masteryScore;
    }

    return c.json({
      nextReviewAt: updated.nextReviewAt,
      intervalDays: updated.intervalDays,
      easeFactor: updated.easeFactor,
      status: updated.status,
      masteryScore,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'CARD_RATE_FAILED', message: e.message }, 500);
  }
});
