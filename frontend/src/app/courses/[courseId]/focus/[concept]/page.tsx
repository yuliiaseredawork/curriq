'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { extractKeyTerms } from '@/lib/highlightTerms';
import { FOCUS_EYEBROW, FOCUS_CONTEXT } from '@/lib/learnerCopy';

export default function FocusPracticePage({
  params,
}: {
  params: Promise<{ courseId: string; concept: string }>;
}) {
  const { courseId, concept } = use(params);
  const { getToken, isLoaded } = useAuth();
  const api = createApiClient(getToken);

  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [conceptName, setConceptName] = useState('');
  const [questions, setQuestions] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [completed, setCompleted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [mastery, setMastery] = useState<any>(null);

  async function loadSession() {
    setLoading(true);
    setError('');
    try {
      const { status, body } = await api.startFocusSession(courseId, concept);
      if (status === 202 || body.status === 'PREPARING') {
        setPreparing(true);
        return;
      }
      setPreparing(false);
      setTitle(body.title);
      setConceptName(body.concept);
      setQuestions(body.questions ?? []);
      setIndex(body.currentQuestionIndex ?? 0);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start practice');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // While remediation is still being prepared, poll until it's ready.
  useEffect(() => {
    if (!preparing) return;
    const t = setInterval(loadSession, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing]);

  const question = questions[index];

  async function handleSubmit() {
    if (!answer || !question) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.submitFocusAnswer(courseId, concept, {
        questionId: question.id,
        userAnswer: answer,
      });
      setFeedback(result.feedback);
      if (result.completed) {
        setCompleted(true);
        setMastery(result.mastery);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    if (completed || index + 1 >= questions.length) {
      setShowSummary(true);
      return;
    }
    setAnswer('');
    setFeedback(null);
    setIndex((i) => i + 1);
  }

  if (preparing) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <a href={`/courses/${courseId}`} className="text-blue-400">← Back to course</a>
          <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-6 text-yellow-200">
            Preparing your practice… this will be ready in a moment.
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-gray-950 text-white p-8">Loading practice…</main>;
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <a href={`/courses/${courseId}`} className="text-blue-400">← Back to course</a>
          <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">{error}</div>
        </div>
      </main>
    );
  }

  if (showSummary) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <a href={`/courses/${courseId}`} className="text-blue-400">← Back to course</a>
          <div className="rounded-xl border border-green-700 bg-green-950 p-6 space-y-2">
            <div className="text-2xl font-bold">Practice complete 🎉</div>
            {mastery && (
              <p className="text-gray-200">
                Mastery for <span className="font-semibold">{conceptName}</span>: {mastery.masteryScore}%{' '}
                <span className={mastery.delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                  ({mastery.delta >= 0 ? '+' : ''}{mastery.delta})
                </span>{' '}
                — {mastery.state === 'MASTERED' ? 'Mastered! 🏆' : 'keep going'}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (!question) {
    return <main className="min-h-screen bg-gray-950 text-white p-8">No questions.</main>;
  }

  // Highlight terms mined from the visible question/choices/feedback + tags.
  const focusKeyTerms = extractKeyTerms({
    text: [
      question.question,
      ...((question.choices as string[]) ?? []),
      feedback?.feedback,
      feedback?.explanation,
      feedback?.ideal_answer,
      ...((feedback?.missingConcepts as string[]) ?? []),
    ],
    explicit: question.concept_tags ?? [],
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href={`/courses/${courseId}`} className="text-blue-400">← Back to course</a>

        <div>
          <div className="text-sm text-yellow-300">{FOCUS_EYEBROW}</div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-sm text-gray-400">{FOCUS_CONTEXT}</p>
          <p className="text-gray-400">Question {index + 1} / {questions.length}</p>
        </div>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          {question.question.length > 180 ? (
            <ScannableText
              text={question.question}
              keyTerms={focusKeyTerms}
              className="text-xl font-semibold"
            />
          ) : (
            <h2 className="text-xl font-semibold">{question.question}</h2>
          )}

          {question.type === 'mcq' && question.choices?.length ? (
            <div className="space-y-2">
              {question.choices.map((choice: string) => (
                <button
                  key={choice}
                  disabled={submitting || !!feedback}
                  className={`block w-full text-left rounded-lg border px-4 py-3 disabled:cursor-not-allowed ${
                    answer === choice ? 'border-blue-500 bg-blue-950' : 'border-gray-700 bg-gray-950'
                  }`}
                  onClick={() => setAnswer(choice)}
                >
                  <ScannableText inline text={choice} keyTerms={focusKeyTerms} />
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

          {feedback && (
            <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3">
              {feedback.type === 'rubric' ? (
                <>
                  <div className={feedback.passed ? 'text-green-400' : 'text-yellow-300'}>
                    Score {feedback.score}/100 — {feedback.passed ? 'Passed' : 'Keep practicing'}
                  </div>
                  {feedback.strengths?.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-green-400">What you got right</div>
                      <ul className="list-disc pl-5 text-sm text-gray-300">
                        {feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {feedback.missingConcepts?.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-yellow-300">What you missed</div>
                      <ul className="list-disc pl-5 text-sm text-gray-300">
                        {feedback.missingConcepts.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {feedback.misconceptions?.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-red-400">Misconceptions</div>
                      <ul className="list-disc pl-5 text-sm text-gray-300">
                        {feedback.misconceptions.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  <ScannableText
                    text={feedback.feedback}
                    keyTerms={focusKeyTerms}
                    className="text-gray-300"
                  />
                </>
              ) : (
                <>
                  <div className={feedback.correct ? 'text-green-400' : 'text-red-400'}>
                    {feedback.correct ? 'Correct' : 'Not quite'}
                  </div>
                  <ScannableText
                    text={feedback.explanation}
                    keyTerms={focusKeyTerms}
                    clampChars={240}
                    className="text-gray-300"
                  />
                  {!feedback.correct && feedback.ideal_answer && (
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Ideal answer
                      </div>
                      <ScannableText
                        text={feedback.ideal_answer}
                        keyTerms={focusKeyTerms}
                        clampChars={160}
                        className="text-sm text-gray-400"
                      />
                    </div>
                  )}
                </>
              )}
              <button className="rounded-lg bg-blue-500 px-5 py-3 text-white" onClick={handleNext}>
                {index + 1 >= questions.length ? 'Finish' : 'Next question'}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
