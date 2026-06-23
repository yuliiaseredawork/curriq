import { Hono } from 'hono';
import { z } from 'zod';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import { loadRemediationSet } from '../../storage/course-artifacts';
import {
  listMastery,
  getMastery,
  putMastery,
  isDue,
  applyReview,
  type MasteryRecord,
} from '../../storage/focus-areas';
import { gradeWithRubric } from '../../agents/rubric-grader';
import { scoreToQuality, qualityLabel } from '../../courses/sm2';
import { daysUntil, requiredReviewsPerDay, scheduleStatus } from '../../courses/deadline';

export const reviews = new Hono();
const lambda = new LambdaClient({});

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function safeQuestion(q: any) {
  const { answer, explanation, source_quote, source_chunk_id, misconception_target, ...rest } = q;
  return rest;
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
    .catch((e) => console.error('[reviews] consolidation fire failed', String(e?.message ?? e)));
}

/** Order due concepts: overdue (by scheduled time) first, then backlog by priority. */
function orderDue(records: MasteryRecord[], now: Date): MasteryRecord[] {
  const overdue = records
    .filter((r) => r.nextReviewAt)
    .sort((a, b) => new Date(a.nextReviewAt!).getTime() - new Date(b.nextReviewAt!).getTime());
  const backlog = records
    .filter((r) => !r.nextReviewAt)
    .sort((a, b) => (b.priority ?? b.mistakeCount) - (a.priority ?? a.mistakeCount));
  return [...overdue, ...backlog];
}

// GET /reviews/today  (optional ?courseId)
reviews.get('/reviews/today', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const courseIdFilter = c.req.query('courseId');
    const now = new Date();

    const listed = await callCourseMetadata({ action: 'list', userId });
    const courses = (listed.courses ?? []).filter(
      (co: any) => !courseIdFilter || co.courseId === courseIdFilter,
    );

    const dueConcepts: any[] = [];
    const weakConcepts: any[] = [];
    const deadlines: any[] = [];
    const byCourse: any[] = [];
    let overdueCount = 0;

    for (const co of courses) {
      const records = (await listMastery(userId, co.courseId)).filter((r) => r.isCanonical);
      if (!records.length) continue;

      const due = orderDue(records.filter((r) => isDue(r, now)), now);

      let deadlineInfo: any = null;
      if (co.targetDate) {
        const total = records.length;
        const mastered = records.filter((r) => r.state === 'MASTERED').length;
        const daysLeft = daysUntil(co.targetDate, now);
        const totalDays = Math.max(1, daysUntil(co.targetDate, new Date(co.createdAt)));
        deadlineInfo = {
          courseId: co.courseId,
          title: co.title,
          targetDate: co.targetDate,
          daysRemaining: daysLeft,
          recommendedReviewsPerDay: requiredReviewsPerDay({
            remainingConcepts: total - mastered,
            daysLeft,
          }),
          ...scheduleStatus({ totalConcepts: total, masteredConcepts: mastered, daysLeft, totalDays }),
        };
        deadlines.push(deadlineInfo);
      }

      if (due.length || deadlineInfo) {
        byCourse.push({
          courseId: co.courseId,
          courseTitle: co.title,
          dueCount: due.length,
          targetDate: co.targetDate ?? null,
          daysRemaining: deadlineInfo?.daysRemaining ?? null,
          recommendedReviewsPerDay: deadlineInfo?.recommendedReviewsPerDay ?? null,
          onTrack: deadlineInfo?.onTrack ?? null,
          daysBehind: deadlineInfo?.daysBehind ?? 0,
        });
      }

      for (const r of due) {
        const overdue = !!r.nextReviewAt && new Date(r.nextReviewAt).getTime() < now.getTime();
        if (overdue) overdueCount += 1;
        dueConcepts.push({
          courseId: co.courseId,
          courseTitle: co.title,
          conceptSlug: r.conceptSlug,
          title: r.title ?? r.concept,
          masteryScore: r.masteryScore,
          nextReviewAt: r.nextReviewAt ?? null,
          overdue,
        });
      }

      for (const r of records) {
        if (r.state === 'NEEDS_REVIEW') {
          weakConcepts.push({
            courseId: co.courseId,
            conceptSlug: r.conceptSlug,
            title: r.title ?? r.concept,
            masteryScore: r.masteryScore,
          });
        }
      }

    }

    weakConcepts.sort((a, b) => a.masteryScore - b.masteryScore);

    return c.json({
      dueConcepts,
      overdueCount,
      weakConcepts: weakConcepts.slice(0, 5),
      estimatedMinutes: Math.round(dueConcepts.length * 1.5),
      deadlines,
      byCourse,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'REVIEWS_UNAVAILABLE', message: e.message }, 500);
  }
});

const NextInput = z.object({ courseId: z.string().optional() }).optional();

// POST /reviews/next  → the next due concept + a question (answer stripped)
reviews.post('/reviews/next', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const body = NextInput.parse(await c.req.json().catch(() => ({})));
    const now = new Date();

    const listed = await callCourseMetadata({ action: 'list', userId });
    const courses = (listed.courses ?? []).filter(
      (co: any) => !body?.courseId || co.courseId === body.courseId,
    );

    const allDue: MasteryRecord[] = [];
    for (const co of courses) {
      const records = (await listMastery(userId, co.courseId)).filter((r) => r.isCanonical);
      allDue.push(...records.filter((r) => isDue(r, now)));
    }
    if (!allDue.length) return c.json({ status: 'NO_REVIEWS' });

    const concept = orderDue(allDue, now)[0];
    const set = await loadRemediationSet(concept.courseId, concept.conceptSlug);
    if (!set || !set.questions?.length) {
      fireConsolidation(concept.courseId, userId);
      return c.json({ status: 'PREPARING', concept: concept.title ?? concept.concept }, 202);
    }

    // Rotate questions across reviews so the learner doesn't see the same one.
    const idx = (concept.repetitions ?? 0) % set.questions.length;
    const question = set.questions[idx];

    return c.json({
      status: 'REVIEW',
      reviewId: `${concept.courseId}::${concept.conceptSlug}::${question.id}`,
      concept: {
        courseId: concept.courseId,
        conceptSlug: concept.conceptSlug,
        title: concept.title ?? concept.concept,
      },
      question: safeQuestion(question),
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'REVIEW_NEXT_FAILED', message: e.message }, 500);
  }
});

const AnswerInput = z.object({ reviewId: z.string(), answer: z.string() });

// POST /reviews/answer  → grade, schedule with SM-2
reviews.post('/reviews/answer', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const input = AnswerInput.parse(await c.req.json());
    const [courseId, slug, questionId] = input.reviewId.split('::');
    if (!courseId || !slug || !questionId) {
      return c.json({ error: 'INVALID_REVIEW_ID' }, 400);
    }

    const record = await getMastery(userId, courseId, slug);
    if (!record) return c.json({ error: 'CONCEPT_NOT_FOUND' }, 404);

    const set = await loadRemediationSet(courseId, slug);
    const question = set?.questions?.find((q: any) => q.id === questionId);
    if (!question) return c.json({ error: 'QUESTION_NOT_FOUND' }, 404);

    let score: number;
    let feedback: any;
    if (question.type === 'mcq') {
      const correct = normalize(input.answer) === normalize(question.answer);
      score = correct ? 100 : 0;
      feedback = { type: 'mcq', correct, explanation: question.explanation };
    } else {
      const rubric = await gradeWithRubric({
        question: question.question,
        idealAnswer: question.answer,
        sourceQuote: question.source_quote,
        conceptTags: question.concept_tags,
        userAnswer: input.answer,
      });
      score = rubric.score;
      feedback = { type: 'rubric', ...rubric };
    }

    const quality = scoreToQuality(score, question.type === 'mcq' ? 'mcq' : 'open');
    const updated = applyReview(record, quality);
    await putMastery(updated);

    console.log('[reviews/answer]', {
      courseId,
      slug,
      quality,
      nextReviewAt: updated.nextReviewAt,
    });

    return c.json({
      score,
      feedback,
      idealAnswer: question.answer,
      quality: qualityLabel(quality),
      nextReviewAt: updated.nextReviewAt,
      intervalDays: updated.intervalDays,
      masteryScore: updated.masteryScore,
      state: updated.state,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'REVIEW_ANSWER_FAILED', message: e.message }, 500);
  }
});
