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
    } catch (e: any) {
      setError(e.message ?? 'Failed to load next question');
    } finally {
      setLoading(false);
    }
  }

  async function ensureQuizAndLoad() {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      try {
        await api.getQuiz(courseId, chapterId);
      } catch {
        await api.generateQuiz(courseId, chapterId);
      }
      await loadNext();
    } catch (e: any) {
      setError(
        e.message?.includes('Service Unavailable')
          ? 'Quiz generation is taking too long. Please wait a bit and try opening this chapter again.'
          : e.message ?? 'Failed to start chapter',
      );
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!question || !answer || !userId) return;
    setLoading(true);
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
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoaded || !userLoaded || !userId) return;
    ensureQuizAndLoad();
  }, [authLoaded, userLoaded, userId]);

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

        {status === 'COMPLETED' && (
          <div className="rounded-xl border border-green-700 bg-green-950 p-5">
            Chapter completed 🎉
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
                    className={`block w-full text-left rounded-lg border px-4 py-3 ${
                      answer === choice
                        ? 'border-blue-500 bg-blue-950'
                        : 'border-gray-700 bg-gray-950'
                    }`}
                    onClick={() => setAnswer(choice)}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                className="w-full rounded-lg bg-gray-950 border border-gray-700 px-4 py-3"
                rows={4}
                placeholder="Write your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}

            {!feedback && (
              <button
                className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
                onClick={handleSubmit}
                disabled={!answer || loading}
              >
                Submit answer
              </button>
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
