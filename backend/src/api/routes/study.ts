import { Hono } from 'hono';
import { z } from 'zod';

import { loadQuiz } from '../../storage/course-artifacts';
import { evaluateAnswer } from '../../agents/answer-feedback';
import {
  saveProgress,
  saveMistake,
  getChapterProgress,
} from '../../storage/study-state';
import { getChapterProgress } from '../../storage/study-state';

const AnswerInput = z.object({
  userId: z.string().default('demo-user'),
  courseId: z.string(),
  chapterId: z.string(),
  questionId: z.string(),
  userAnswer: z.string(),
});

const NextInput = z.object({
  userId: z.string().default('demo-user'),
  courseId: z.string(),
  chapterId: z.string(),
});

export const study = new Hono();

study.post('/answer', async (c) => {
  const body = await c.req.json();
  const input = AnswerInput.parse(body);

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

  const feedback = await evaluateAnswer({
    question: question.question,
    questionType: question.type,
    choices: question.choices,
    correctAnswer: question.answer,
    userAnswer: input.userAnswer,
    sourceQuote: question.source_quote,
    conceptTags: question.concept_tags ?? [],
  });

  await saveProgress({
    userId: input.userId,
    courseId: input.courseId,
    chapterId: input.chapterId,
    questionId: input.questionId,
    correct: feedback.correct,
  });

  if (!feedback.correct) {
    await saveMistake({
      userId: input.userId,
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

  const quiz = await loadQuiz(input.courseId, input.chapterId);

  const progress = await getChapterProgress({
    userId: input.userId,
    courseId: input.courseId,
    chapterId: input.chapterId,
  });

  const answeredQuestionIds = new Set(
    progress.map((item: any) => item.questionId),
  );

  const nextQuestion = quiz.questions.find(
    (q: any) => !answeredQuestionIds.has(q.id),
  );

  if (!nextQuestion) {
    return c.json({
      status: 'COMPLETED',
      message: 'All questions in this chapter have been answered.',
      courseId: input.courseId,
      chapterId: input.chapterId,
      answeredCount: answeredQuestionIds.size,
      totalQuestions: quiz.questions.length,
    });
  }

  const { answer, source_quote, source_chunk_id, ...safeQuestion } =
    nextQuestion;

  return c.json({
    status: 'NEXT_QUESTION',
    courseId: input.courseId,
    chapterId: input.chapterId,
    progress: {
      answeredCount: answeredQuestionIds.size,
      totalQuestions: quiz.questions.length,
    },
    question: safeQuestion,
  });
});