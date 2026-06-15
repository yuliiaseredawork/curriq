'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';

export default function PracticePage({
  params,
}: {
  params: Promise<{ courseId: string; practiceId: string }>;
}) {
  const { courseId, practiceId } = use(params);
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  const [practice, setPractice] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getPractice(courseId, practiceId)
      .then((result) => setPractice(result.practice))
      .catch((e) => setError(e.message ?? 'Failed to load practice'));
  }, [courseId, practiceId]);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="text-red-300">{error}</div>
      </main>
    );
  }

  if (!practice) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        Loading practice...
      </main>
    );
  }

  const question = practice.questions[currentIndex];

  function handleSubmit() {
    if (!answer) return;
    setFeedback({
      correct: answer.trim().toLowerCase() === question.answer.trim().toLowerCase(),
      explanation: `Ideal answer: ${question.answer}`,
    });
  }

  function handleNext() {
    setAnswer('');
    setFeedback(null);
    setCurrentIndex((i) => i + 1);
  }

  const completed = currentIndex >= practice.questions.length;

  if (completed) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <a href={`/courses/${courseId}`} className="text-blue-400">
            ← Back to course
          </a>
          <div className="rounded-xl border border-green-700 bg-green-950 p-6">
            Practice completed 🎉
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href={`/courses/${courseId}`} className="text-blue-400">
          ← Back to course
        </a>

        <div>
          <div className="text-sm text-yellow-300">Extra practice</div>
          <h1 className="text-3xl font-bold">{practice.title}</h1>
          <p className="text-gray-400">
            Question {currentIndex + 1} / {practice.questions.length}
          </p>
        </div>

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
              disabled={!answer}
            >
              Submit answer
            </button>
          )}

          {feedback && (
            <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3">
              <div className={feedback.correct ? 'text-green-400' : 'text-yellow-300'}>
                {feedback.correct ? 'Correct' : 'Review this'}
              </div>
              <p className="text-gray-300">{feedback.explanation}</p>
              <button
                className="rounded-lg bg-blue-500 px-5 py-3 text-white"
                onClick={handleNext}
              >
                Next question
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
