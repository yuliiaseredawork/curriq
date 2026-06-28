// Unified daily session — GET /session/today?courseId?
//
// Orchestration only: gathers the learner's already-due items across courses
// (due flashcards, due concept reviews, new quiz questions), strips answers,
// and hands them to the pure buildSession() prioritizer. The player submits to
// the EXISTING grade endpoints (/flashcards/:id/rate, /reviews/answer,
// /study/answer), so no grading lives here and every feature still works alone.

import { Hono } from 'hono';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';

import { getCurrentUserId, UnauthorizedError } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';
import { listCards, isCardDue } from '../../storage/flashcards';
import { listMastery, isDue } from '../../storage/focus-areas';
import { loadRemediationSet, loadOutline, loadQuiz } from '../../storage/course-artifacts';
import { getCourseProgress } from '../../storage/study-state';
import {
  daysUntil,
  requiredReviewsPerDay,
  scheduleStatus,
  deadlineConfidence,
} from '../../courses/deadline';
import { blendProgress } from '../../courses/progress';
import {
  buildSession,
  estimateMinutes,
  pickNextBestAction,
  type FlashcardCandidate,
  type ConceptCandidate,
  type QuizCandidate,
} from '../../courses/session';

export const session = new Hono();
const lambda = new LambdaClient({});

// Cap quiz candidates gathered per course (they're lowest priority; buildSession
// caps the final queue anyway — this just bounds S3 reads).
const QUIZ_PER_COURSE = 30;

/** Remove anything that reveals or justifies the answer before the learner answers. */
function stripAnswer(q: any) {
  const { answer, explanation, source_quote, source_chunk_id, misconception_target, ...safe } = q;
  return safe;
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
    .catch((e) => console.error('[session] consolidation fire failed', String(e?.message ?? e)));
}

// Gather the learner's due items across courses, prioritize, and shape the goal.
// Shared by /session/today (full queue) and /session/next (just nextBestAction).
// When chapterIdFilter is set, the session is scoped to a single chapter's
// practice: only that chapter's unanswered quiz questions are returned — no
// flashcards, no concept reviews, no other chapters. Absent, behavior is
// unchanged (the full mixed queue).
async function computeSession(userId: string, courseIdFilter?: string, chapterIdFilter?: string) {
    const now = new Date();

    const listed = await callCourseMetadata({ action: 'list', userId });
    const courses = (listed.courses ?? []).filter(
      (co: any) => !courseIdFilter || co.courseId === courseIdFilter,
    );

    const flashcards: FlashcardCandidate[] = [];
    const concepts: ConceptCandidate[] = [];
    const quiz: QuizCandidate[] = [];

    // Aggregates for the goal's blended progress + deadline summary.
    let totalConcepts = 0;
    let masteredConcepts = 0;
    let masterySum = 0;
    let reviewedConcepts = 0;
    let totalQuestions = 0;
    let answeredQuestions = 0;
    const deadlines: any[] = [];
    // Chapter-scope only: did the requested chapter's quiz exist with questions?
    // Lets the UI tell "still preparing" from "you've finished this chapter".
    let chapterReady = false;

    for (const co of courses) {
      const daysLeft = co.targetDate ? daysUntil(co.targetDate, now) : undefined;

      // --- Due flashcards (skipped for chapter-scoped sessions) -----------
      if (!chapterIdFilter) {
        for (const card of await listCards(userId, co.courseId)) {
          if (!isCardDue(card, now)) continue;
          flashcards.push({
            courseId: co.courseId,
            courseTitle: co.title,
            cardId: card.cardId,
            concept: card.concept,
            type: card.type,
            front: card.front,
            difficulty: card.difficulty,
            nextReviewAt: card.nextReviewAt,
          });
        }
      }

      // --- Due concept reviews -------------------------------------------
      const records = (await listMastery(userId, co.courseId)).filter((r) => r.isCanonical);
      totalConcepts += records.length;
      masteredConcepts += records.filter((r) => r.state === 'MASTERED').length;
      masterySum += records.reduce((s, r) => s + r.masteryScore, 0);
      reviewedConcepts += records.filter((r) => r.lastReviewedAt || r.nextReviewAt).length;

      // Concept reviews are skipped for chapter-scoped sessions.
      for (const r of chapterIdFilter ? [] : records) {
        if (!isDue(r, now)) continue;
        const set = await loadRemediationSet(co.courseId, r.conceptSlug);
        if (!set || !set.questions?.length) {
          fireConsolidation(co.courseId, userId); // prepare it for next time; don't block
          continue;
        }
        // Rotate questions across reviews (same as /reviews/next).
        const question = set.questions[(r.repetitions ?? 0) % set.questions.length];
        concepts.push({
          courseId: co.courseId,
          courseTitle: co.title,
          conceptSlug: r.conceptSlug,
          conceptTitle: r.title ?? r.concept,
          reviewId: `${co.courseId}::${r.conceptSlug}::${question.id}`,
          question: stripAnswer(question),
          masteryScore: r.masteryScore,
          state: r.state,
          nextReviewAt: r.nextReviewAt,
          reviewedBefore: !!(r.lastReviewedAt || r.nextReviewAt),
          deadlineDaysLeft: daysLeft,
        });
      }

      // --- New quiz questions + quiz-completion counts -------------------
      try {
        const outline = await loadOutline(co.courseId);
        const progressItems = await getCourseProgress({ userId, courseId: co.courseId });
        const answeredByChapter = new Map<string, Set<string>>();
        for (const item of progressItems as any[]) {
          if (!answeredByChapter.has(item.chapterId)) answeredByChapter.set(item.chapterId, new Set());
          answeredByChapter.get(item.chapterId)!.add(item.questionId);
        }
        let gathered = 0;
        for (const chapter of outline.chapters) {
          // Chapter-scoped sessions gather only the requested chapter.
          if (chapterIdFilter && chapter.id !== chapterIdFilter) continue;
          let questions: any[] = [];
          try {
            questions = (await loadQuiz(co.courseId, chapter.id)).questions ?? [];
          } catch {
            continue; // quiz not generated for this chapter yet
          }
          const answered = answeredByChapter.get(chapter.id) ?? new Set<string>();
          if (chapterIdFilter && chapter.id === chapterIdFilter && questions.length > 0) {
            chapterReady = true;
          }
          totalQuestions += questions.length;
          answeredQuestions += answered.size;
          for (const q of questions) {
            if (answered.has(q.id) || gathered >= QUIZ_PER_COURSE) continue;
            quiz.push({
              courseId: co.courseId,
              courseTitle: co.title,
              chapterId: chapter.id,
              questionId: q.id,
              question: stripAnswer(q),
              chapterAnswered: answered.size,
              chapterTotal: questions.length,
            });
            gathered += 1;
          }
        }
      } catch {
        // No outline yet — skip quiz candidates for this course.
      }

      // --- Deadline summary ----------------------------------------------
      if (co.targetDate) {
        const total = records.length;
        const mastered = records.filter((r) => r.state === 'MASTERED').length;
        const totalDays = Math.max(1, daysUntil(co.targetDate, new Date(co.createdAt)));
        deadlines.push({
          courseId: co.courseId,
          title: co.title,
          targetDate: co.targetDate,
          daysRemaining: daysLeft,
          recommendedReviewsPerDay: requiredReviewsPerDay({
            remainingConcepts: total - mastered,
            daysLeft: daysLeft!,
          }),
          deadlineConfidence: deadlineConfidence({
            totalConcepts: total,
            masteredConcepts: mastered,
            daysLeft: daysLeft!,
            totalDays,
          }),
          ...scheduleStatus({ totalConcepts: total, masteredConcepts: mastered, daysLeft: daysLeft!, totalDays }),
        });
      }
    }

    const tasks = buildSession({ flashcards, concepts, quiz, now });

    // Per-course breakdown (collapsible on the homepage).
    const byCourse = courses
      .map((co: any) => ({
        courseId: co.courseId,
        courseTitle: co.title,
        taskCount: tasks.filter((t) => t.courseId === co.courseId).length,
        ...(deadlines.find((d) => d.courseId === co.courseId) ?? {}),
      }))
      .filter((b: any) => b.taskCount > 0 || b.targetDate);

    // Most urgent deadline drives the goal card's pace line.
    const deadline =
      deadlines.length > 0
        ? [...deadlines].sort((a, b) => (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9))[0]
        : null;

    const retentionScore = totalConcepts ? Math.round((masteredConcepts / totalConcepts) * 100) : 0;
    const { learningProgress, breakdown } = blendProgress({
      avgConceptMastery: totalConcepts ? Math.round(masterySum / totalConcepts) : 0,
      quizCompletion: totalQuestions ? (answeredQuestions / totalQuestions) * 100 : 0,
      retentionScore,
      reviewedConcepts,
      totalConcepts,
    });

    return {
      goal: {
        name: courses.length === 1 ? courses[0].title : 'All courses',
        courseId: courses.length === 1 ? courses[0].courseId : null,
        taskCount: tasks.length,
        estimatedMinutes: estimateMinutes(tasks),
        deadline,
        learningProgress,
        breakdown,
        byCourse,
        // Only meaningful for chapter-scoped sessions (undefined otherwise).
        chapterReady: chapterIdFilter ? chapterReady : undefined,
      },
      tasks,
      // The single primary action — powers the "Continue Learning" button.
      nextBestAction: pickNextBestAction(tasks),
    };
}

// Full session: goal + prioritized queue + nextBestAction.
session.get('/session/today', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    return c.json(
      await computeSession(
        userId,
        c.req.query('courseId') ?? undefined,
        c.req.query('chapterId') ?? undefined,
      ),
    );
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'SESSION_UNAVAILABLE', message: e.message }, 500);
  }
});

// Just the one next action — cheap payload for "Continue Learning".
session.get('/session/next', async (c) => {
  try {
    const userId = await getCurrentUserId(c);
    const { nextBestAction } = await computeSession(
      userId,
      c.req.query('courseId') ?? undefined,
      c.req.query('chapterId') ?? undefined,
    );
    return c.json({ nextBestAction });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) throw e;
    return c.json({ error: 'SESSION_UNAVAILABLE', message: e.message }, 500);
  }
});
