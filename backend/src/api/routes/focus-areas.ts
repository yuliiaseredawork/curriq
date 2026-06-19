import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import { loadRemediationSet } from '../../storage/course-artifacts';
import {
  getMastery,
  putMastery,
  listMastery,
  getSession,
  putSession,
  type MasteryRecord,
  type SessionRecord,
} from '../../storage/focus-areas';
import { getCourseMistakes } from '../../storage/study-state';
import { gradeWithRubric } from '../../agents/rubric-grader';
import { applySessionResult, weeklyTrend } from '../../courses/mastery';
import { normalizeTag } from '../../courses/concept-normalize';

export const focusAreas = new Hono();
const lambda = new LambdaClient({});

async function requireOwnership(c: any, courseId: string) {
  const userId = await getCurrentUserId(c);
  const result = await callCourseMetadata({ action: 'getForUser', courseId, userId });
  if (!result.course) throw new Error('COURSE_ACCESS_DENIED');
  return userId;
}

function accessDenied(c: any) {
  return c.json(
    { error: 'COURSE_NOT_FOUND', message: 'Course not found or you do not have access.' },
    404,
  );
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
    .catch((e) => console.error('[focus-areas] failed to fire consolidation', String(e?.message ?? e)));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strip answer/rationale fields before sending a question to the client. */
function safeQuestion(q: any) {
  const { answer, explanation, source_quote, source_chunk_id, ...rest } = q;
  return rest;
}

// GET /courses/:courseId/focus-areas — consolidated, canonical focus areas.
focusAreas.get('/:courseId/focus-areas', async (c) => {
  const courseId = c.req.param('courseId');
  try {
    const userId = await requireOwnership(c, courseId);

    const [records, mistakes] = await Promise.all([
      listMastery(userId, courseId),
      getCourseMistakes({ userId, courseId }),
    ]);

    const canonical = records.filter((r) => r.isCanonical);

    // Trigger (re)consolidation if there are mistakes but no canonical areas
    // yet, or if mistakes reference concepts not covered by any canonical area.
    const covered = new Set<string>();
    for (const r of canonical) {
      for (const rc of r.rawConcepts ?? []) covered.add(normalizeTag(rc));
    }
    const rawTags = mistakes.flatMap((m: any) => (m.conceptTags as string[]) ?? []);
    const hasUncovered = rawTags.some((t) => !covered.has(normalizeTag(t)));

    let preparing = false;
    if (rawTags.length && (canonical.length === 0 || hasUncovered)) {
      fireConsolidation(courseId, userId);
      if (canonical.length === 0) preparing = true;
    }

    const toView = async (r: MasteryRecord) => {
      const session = await getSession(userId, courseId, r.conceptSlug);
      return {
        conceptSlug: r.conceptSlug,
        title: r.title ?? r.concept,
        shortDescription: r.shortDescription ?? null,
        rawConcepts: r.rawConcepts ?? [],
        state: r.state,
        masteryScore: r.masteryScore,
        mistakeCount: r.mistakeCount,
        priority: r.priority ?? r.mistakeCount,
        trend: weeklyTrend(r.history, r.masteryScore),
        lastPracticedAt: r.lastPracticedAt ?? null,
        remediationReady: r.remediationReady,
        sessionStatus: session?.status ?? 'NOT_STARTED',
      };
    };

    const active = (await Promise.all(canonical.filter((r) => r.state !== 'MASTERED').map(toView)))
      .sort((a, b) => b.priority - a.priority);
    const mastered = await Promise.all(canonical.filter((r) => r.state === 'MASTERED').map(toView));

    return c.json({ courseId, active, mastered, preparing });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return accessDenied(c);
    return c.json({ error: 'FOCUS_AREAS_UNAVAILABLE', message: e.message }, 500);
  }
});

// POST /courses/:courseId/focus-areas/:concept/session  (start or resume)
focusAreas.post('/:courseId/focus-areas/:concept/session', async (c) => {
  const courseId = c.req.param('courseId');
  const slug = c.req.param('concept');
  try {
    const userId = await requireOwnership(c, courseId);

    const mastery = await getMastery(userId, courseId, slug);
    if (!mastery) {
      return c.json({ error: 'CONCEPT_NOT_FOUND' }, 404);
    }

    const set = await loadRemediationSet(courseId, slug);
    if (!set) {
      fireConsolidation(courseId, userId);
      return c.json({ status: 'PREPARING', concept: mastery.concept }, 202);
    }

    let session = await getSession(userId, courseId, slug);
    const now = new Date().toISOString();
    if (!session || session.status === 'COMPLETED') {
      session = {
        userId,
        courseId,
        conceptSlug: slug,
        sessionId: randomUUID(),
        status: 'IN_PROGRESS',
        currentQuestionIndex: 0,
        completedQuestions: [],
        score: 0,
        startedAt: now,
        updatedAt: now,
      };
      await putSession(session);
      if (mastery.state === 'NEEDS_REVIEW') {
        mastery.state = 'PRACTICING';
        mastery.updatedAt = now;
        await putMastery(mastery);
      }
    }

    return c.json({
      sessionId: session.sessionId,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      totalQuestions: set.questions.length,
      concept: mastery.concept,
      title: set.title,
      questions: set.questions.map(safeQuestion),
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return accessDenied(c);
    return c.json({ error: 'SESSION_FAILED', message: e.message }, 500);
  }
});

const AnswerInput = z.object({
  questionId: z.string(),
  userAnswer: z.string(),
});

// POST /courses/:courseId/focus-areas/:concept/answer
focusAreas.post('/:courseId/focus-areas/:concept/answer', async (c) => {
  const courseId = c.req.param('courseId');
  const slug = c.req.param('concept');
  try {
    const userId = await requireOwnership(c, courseId);
    const input = AnswerInput.parse(await c.req.json());

    const [mastery, set, session] = await Promise.all([
      getMastery(userId, courseId, slug),
      loadRemediationSet(courseId, slug),
      getSession(userId, courseId, slug),
    ]);
    if (!mastery || !set) return c.json({ error: 'CONCEPT_NOT_FOUND' }, 404);
    if (!session || session.status !== 'IN_PROGRESS') {
      return c.json({ error: 'NO_ACTIVE_SESSION' }, 400);
    }

    const question = set.questions.find((q: any) => q.id === input.questionId);
    if (!question) return c.json({ error: 'QUESTION_NOT_FOUND' }, 404);

    // Grade: MCQ locally, open-ended with the rubric grader.
    let score: number;
    let feedback: any;
    if (question.type === 'mcq') {
      const correct = normalize(input.userAnswer) === normalize(question.answer);
      score = correct ? 100 : 0;
      feedback = {
        type: 'mcq',
        correct,
        ideal_answer: question.answer,
        explanation: question.explanation,
      };
    } else {
      const rubric = await gradeWithRubric({
        question: question.question,
        idealAnswer: question.answer,
        sourceQuote: question.source_quote,
        conceptTags: question.concept_tags,
        userAnswer: input.userAnswer,
      });
      score = rubric.score;
      feedback = { type: 'rubric', ...rubric };
    }

    // Persist progress (replace if this question was already answered).
    const now = new Date().toISOString();
    const completed = session.completedQuestions.filter((q) => q.questionId !== input.questionId);
    completed.push({ questionId: input.questionId, score });
    session.completedQuestions = completed;
    session.currentQuestionIndex = completed.length;
    session.score = Math.round(completed.reduce((a, b) => a + b.score, 0) / completed.length);
    session.updatedAt = now;

    const isComplete = completed.length >= set.questions.length;
    let masteryView: any;
    if (isComplete) {
      session.status = 'COMPLETED';
      const prevScore = mastery.masteryScore;
      const { masteryScore, state } = applySessionResult(prevScore, session.score);
      mastery.masteryScore = masteryScore;
      mastery.state = state;
      mastery.completedSessions += 1;
      mastery.lastPracticedAt = now;
      mastery.history = [...(mastery.history ?? []), { date: now, score: masteryScore }];
      mastery.updatedAt = now;
      await putMastery(mastery);
      masteryView = { masteryScore, state, delta: masteryScore - prevScore };
    }

    await putSession(session);

    return c.json({
      feedback,
      sessionProgress: {
        currentQuestionIndex: session.currentQuestionIndex,
        totalQuestions: set.questions.length,
        score: session.score,
      },
      completed: isComplete,
      mastery: masteryView,
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    if (e.message === 'COURSE_ACCESS_DENIED') return accessDenied(c);
    return c.json({ error: 'ANSWER_FAILED', message: e.message }, 500);
  }
});
