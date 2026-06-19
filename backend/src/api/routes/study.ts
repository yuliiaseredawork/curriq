import { Hono } from 'hono';
import { z } from 'zod';

import { loadQuiz } from '../../storage/course-artifacts';
import { evaluateAnswer } from '../../agents/answer-feedback';
import {
  saveProgress,
  saveMistake,
  getChapterProgress,
} from '../../storage/study-state';
import { getCurrentUserId } from '../../auth/current-user';
import { callCourseMetadata } from '../../courses/course-metadata-client';

const AnswerInput = z.object({
  courseId: z.string(),
  chapterId: z.string(),
  questionId: z.string(),
  userAnswer: z.string(),
});

const NextInput = z.object({
  courseId: z.string(),
  chapterId: z.string(),
});

export const study = new Hono();

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Fast, deterministic grading for MCQ — no AI call. Returns feedback in the
 * same shape as the AI grader, or null if the question has no reliable correct
 * answer (caller then falls back to AI).
 */
function gradeMcqLocally(question: any, userAnswer: string) {
  const correctAnswer =
    typeof question.answer === 'string' ? question.answer.trim() : '';
  if (!correctAnswer) return null;

  // Sanity: the correct answer should be one of the choices.
  if (
    Array.isArray(question.choices) &&
    question.choices.length &&
    !question.choices.some((c: string) => normalize(c) === normalize(correctAnswer))
  ) {
    return null;
  }

  const correct = normalize(userAnswer) === normalize(correctAnswer);

  // Stored explanation is safe to reveal AFTER submission.
  const stored =
    typeof question.explanation === 'string' ? question.explanation.trim() : '';

  let explanation: string;
  if (stored) {
    explanation = correct
      ? `Correct. ${stored}`
      : `Not quite — the correct answer is “${correctAnswer}”. ${stored}`;
  } else {
    explanation = correct
      ? `Correct. The answer is “${correctAnswer}”.`
      : `Not quite. The correct answer is “${correctAnswer}”.`;
  }

  if (
    !correct &&
    typeof question.misconception_target === 'string' &&
    question.misconception_target.trim()
  ) {
    explanation += ` (Common mix-up: ${question.misconception_target.trim()})`;
  }

  return {
    correct,
    explanation,
    ideal_answer: correctAnswer,
    concept_tags: question.concept_tags ?? [],
  };
}

study.post('/answer', async (c) => {
  const body = await c.req.json();
  const input = AnswerInput.parse(body);

  const userId = await getCurrentUserId(c);

  const ownership = await callCourseMetadata({
    action: 'getForUser',
    courseId: input.courseId,
    userId,
  });

  if (!ownership.course) {
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
        message: 'Course not found or you do not have access.',
      },
      404,
    );
  }

  const quiz = await loadQuiz(input.courseId, input.chapterId);

  const question = quiz.questions.find(
    (q: any) => q.id === input.questionId,
  );

  if (!question) {
    return c.json(
      {
        error: 'QUESTION_NOT_FOUND',
        message: `Question ${input.questionId} was not found.`,
      },
      404,
    );
  }

  const startedAt = Date.now();
  let aiUsed = false;

  // MCQ: grade locally (instant). Short-answer / open: AI grading.
  let feedback = question.type === 'mcq'
    ? gradeMcqLocally(question, input.userAnswer)
    : null;

  if (!feedback) {
    feedback = await evaluateAnswer({
      question: question.question,
      questionType: question.type,
      choices: question.choices,
      correctAnswer: question.answer,
      userAnswer: input.userAnswer,
      sourceQuote: question.source_quote,
      conceptTags: question.concept_tags ?? [],
    });
    aiUsed = true;
  }

  console.log('[study/answer]', {
    courseId: input.courseId,
    chapterId: input.chapterId,
    questionId: input.questionId,
    questionType: question.type,
    aiUsed,
    correct: feedback.correct,
    durationMs: Date.now() - startedAt,
  });

  await saveProgress({
    userId,
    courseId: input.courseId,
    chapterId: input.chapterId,
    questionId: input.questionId,
    correct: feedback.correct,
  });

  if (!feedback.correct) {
    await saveMistake({
      userId,
      courseId: input.courseId,
      chapterId: input.chapterId,
      questionId: input.questionId,
      userAnswer: input.userAnswer,
      correctAnswer: question.answer,
      conceptTags: feedback.concept_tags,
      explanation: feedback.explanation,
    });
  }

  return c.json({
    courseId: input.courseId,
    chapterId: input.chapterId,
    questionId: input.questionId,
    feedback,
    source: {
      source_chunk_id: question.source_chunk_id,
      source_quote: question.source_quote,
    },
  });
});

study.post('/next', async (c) => {
  const body = await c.req.json();
  const input = NextInput.parse(body);

  const userId = await getCurrentUserId(c);

  const ownership = await callCourseMetadata({
    action: 'getForUser',
    courseId: input.courseId,
    userId,
  });

  if (!ownership.course) {
    return c.json(
      {
        error: 'COURSE_NOT_FOUND',
        message: 'Course not found or you do not have access.',
      },
      404,
    );
  }

  const quiz = await loadQuiz(input.courseId, input.chapterId);

  const progress = await getChapterProgress({
    userId,
    courseId: input.courseId,
    chapterId: input.chapterId,
  });

  const answeredQuestionIds = new Set(
    progress.map((item: any) => item.questionId),
  );

  const totalQuestions = quiz.questions.length;
  const answeredQuestions = answeredQuestionIds.size;

  const nextIndex = quiz.questions.findIndex(
    (q: any) => !answeredQuestionIds.has(q.id),
  );
  const nextQuestion = nextIndex === -1 ? null : quiz.questions[nextIndex];

  if (!nextQuestion) {
    return c.json({
      status: 'COMPLETED',
      message: 'All questions in this chapter have been answered.',
      courseId: input.courseId,
      chapterId: input.chapterId,
      // legacy fields kept for backward compatibility
      answeredCount: answeredQuestions,
      totalQuestions,
      question: null,
      progress: {
        currentQuestionNumber: totalQuestions,
        totalQuestions,
        answeredQuestions,
        remainingQuestions: 0,
        completionPercent: 100,
      },
    });
  }

  // Strip anything that reveals or justifies the answer before the learner answers.
  const {
    answer,
    source_quote,
    source_chunk_id,
    explanation,
    misconception_target,
    ...safeQuestion
  } = nextQuestion;

  const completionPercent =
    totalQuestions > 0
      ? Math.round((answeredQuestions / totalQuestions) * 100)
      : 0;

  return c.json({
    // status value unchanged ('NEXT_QUESTION') for backward compatibility
    status: 'NEXT_QUESTION',
    courseId: input.courseId,
    chapterId: input.chapterId,
    question: safeQuestion,
    progress: {
      currentQuestionNumber: nextIndex + 1,
      totalQuestions,
      answeredQuestions,
      remainingQuestions: totalQuestions - answeredQuestions,
      completionPercent,
      // legacy alias kept for backward compatibility
      answeredCount: answeredQuestions,
    },
  });
});
