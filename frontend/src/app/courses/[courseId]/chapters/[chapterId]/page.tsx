'use client';

import { use, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';

export default function ChapterPage({
  params,
}: {
  params: Promise<{ courseId: string; chapterId: string }>;
}) {
  const { courseId, chapterId } = use(params);
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const api = createApiClient(getToken);

  const userId = user?.primaryEmailAddress?.emailAddress
    ? `email:${user.primaryEmailAddress.emailAddress.toLowerCase()}`
    : user?.id
      ? `clerk:${user.id}`
      : null;

  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  // Quiz generation state: '' | NOT_STARTED | GENERATING | READY | FAILED
  const [quizState, setQuizState] = useState('');

  async function loadNext() {
    if (!userId) return;
    setLoading(true);
    setError('');
    setFeedback(null);
    setAnswer('');
    try {
      const next = await api.getNextQuestion({ userId, courseId, chapterId });
      setStatus(next.status);
      setQuestion(next.question ?? null);
      setProgress(next.progress ?? null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load next question');
    } finally {
      setLoading(false);
    }
  }

  async function fetchQuizState(): Promise<string> {
    const result = await api.getQuizStatus(courseId);
    const ch = (result.chapters ?? []).find((c: any) => c.chapterId === chapterId);
    return ch?.status ?? 'NOT_STARTED';
  }

  async function ensureQuizAndLoad() {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const state = await fetchQuizState();

      if (state === 'READY') {
        setQuizState('READY');
        await loadNext();
        return;
      }

      if (state === 'NOT_STARTED') {
        // Kick off background generation, then wait.
        await api.retryChapterQuiz(courseId, chapterId);
        setQuizState('GENERATING');
        setLoading(false);
        return;
      }

      // GENERATING or FAILED — show the matching state; polling handles the rest.
      setQuizState(state);
      setLoading(false);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start chapter');
      setLoading(false);
    }
  }

  async function handleRetryQuiz() {
    setError('');
    setQuizState('GENERATING');
    try {
      await api.retryChapterQuiz(courseId, chapterId);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start quiz generation');
    }
  }

  async function handleSubmit() {
    if (!question || !answer || !userId) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.submitAnswer({
        userId,
        courseId,
        chapterId,
        questionId: question.id,
        userAnswer: answer,
      });
      setFeedback(result.feedback);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!authLoaded || !userLoaded || !userId) return;
    ensureQuizAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, userLoaded, userId]);

  // While the quiz is generating, poll status and load questions once READY.
  useEffect(() => {
    if (quizState !== 'GENERATING') return;
    const interval = setInterval(async () => {
      try {
        const state = await fetchQuizState();
        if (state === 'READY') {
          setQuizState('READY');
          await loadNext();
        } else if (state === 'FAILED') {
          setQuizState('FAILED');
        }
      } catch {
        // transient; keep polling
      }
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizState]);

  // Normalized progress (tolerant of old/new /study/next shapes).
  const totalQ = progress?.totalQuestions ?? 0;
  const answeredQ = progress?.answeredQuestions ?? progress?.answeredCount ?? 0;
  const currentQ = progress?.currentQuestionNumber ?? answeredQ + 1;
  const remainingQ = progress?.remainingQuestions ?? Math.max(totalQ - answeredQ, 0);
  const percentQ =
    progress?.completionPercent ??
    (totalQ > 0 ? Math.round((answeredQ / totalQ) * 100) : 0);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href={`/courses/${courseId}`} className="text-blue-400">
          ← Back to course
        </a>

        <h1 className="text-3xl font-bold">Study Chapter</h1>

        {loading && <p className="text-gray-300">Loading...</p>}

        {error && (
          <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        {progress && totalQ > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {status === 'COMPLETED'
                  ? `${totalQ} of ${totalQ} questions`
                  : `Question ${currentQ} of ${totalQ}`}
              </span>
              <span className="text-gray-400">{remainingQ} remaining</span>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${percentQ}%` }}
              />
            </div>
            <div className="text-xs text-gray-500">{percentQ}% complete</div>
          </div>
        )}

        {status === 'COMPLETED' && (
          <div className="rounded-xl border border-green-700 bg-green-950 p-5">
            Chapter completed 🎉
          </div>
        )}

        {quizState === 'GENERATING' && (
          <div className="rounded-xl border border-blue-800 bg-blue-950/40 p-5 text-blue-200">
            Quiz is still being generated. Please wait…
          </div>
        )}

        {quizState === 'FAILED' && (
          <div className="rounded-xl border border-red-700 bg-red-950 p-5 space-y-3">
            <p className="text-red-200">Quiz generation failed for this chapter.</p>
            <button
              className="rounded-lg bg-red-500 px-4 py-2 text-white"
              onClick={handleRetryQuiz}
            >
              Retry quiz
            </button>
          </div>
        )}

        {question && (
          <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <div className="text-sm text-gray-400">
              {question.difficulty} · {question.concept_tags?.join(', ')}
            </div>

            <h2 className="text-xl font-semibold">{question.question}</h2>

            {question.type === 'mcq' && question.choices?.length ? (
              <div className="space-y-2">
                {question.choices.map((choice: string) => (
                  <button
                    key={choice}
                    disabled={submitting || !!feedback}
                    className={`block w-full text-left rounded-lg border px-4 py-3 disabled:cursor-not-allowed ${
                      answer === choice
                        ? 'border-blue-500 bg-blue-950'
                        : 'border-gray-700 bg-gray-950'
                    } ${submitting && answer !== choice ? 'opacity-50' : ''}`}
                    onClick={() => setAnswer(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                className="w-full rounded-lg bg-gray-950 border border-gray-700 px-4 py-3 disabled:opacity-60"
                rows={4}
                placeholder="Write your answer..."
                value={answer}
                disabled={submitting || !!feedback}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}

            {!feedback && (
              <button
                className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
                onClick={handleSubmit}
                disabled={!answer || submitting}
              >
                {submitting ? 'Checking your answer…' : 'Submit answer'}
              </button>
            )}

            {submitting && (
              <p className="text-sm text-gray-400 animate-pulse">
                Checking your answer…
              </p>
            )}

            {feedback && (
              <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3">
                <div className={feedback.correct ? 'text-green-400' : 'text-red-400'}>
                  {feedback.correct ? 'Correct' : 'Not quite'}
                </div>
                <p className="text-gray-300">{feedback.explanation}</p>
                <button
                  className="rounded-lg bg-blue-500 px-5 py-3 text-white"
                  onClick={loadNext}
                >
                  Next question
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
