'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { McqChoices } from '@/components/McqChoices';
import { extractKeyTerms } from '@/lib/highlightTerms';
import { FOCUS_EYEBROW, FOCUS_CONTEXT } from '@/lib/learnerCopy';
import {
  pageShell,
  readingContainer,
  elevatedCard,
  eyebrow,
  ghostLink,
  primaryButtonClass,
} from '@/lib/ui';

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
      <main className={pageShell}>
        <div className={`${readingContainer} space-y-4`}>
          <a href={`/courses/${courseId}`} className={ghostLink}>← Back to course</a>
          <div className="rounded-2xl border border-blue-500/30 bg-blue-950/25 p-6 text-blue-100">
            Preparing your practice… this will be ready in a moment.
          </div>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className={`${pageShell} p-8`}>
        <p className="text-gray-400">Loading practice…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className={pageShell}>
        <div className={`${readingContainer} space-y-4`}>
          <a href={`/courses/${courseId}`} className={ghostLink}>← Back to course</a>
          <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-red-200">{error}</div>
        </div>
      </main>
    );
  }

  if (showSummary) {
    return (
      <main className={pageShell}>
        <div className={`${readingContainer} space-y-6`}>
          <a href={`/courses/${courseId}`} className={ghostLink}>← Back to course</a>
          <div className="rounded-2xl border border-green-500/30 bg-green-950/25 p-8 space-y-2 text-center">
            <div className="text-2xl font-bold tracking-tight">Practice complete 🎉</div>
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
    return (
      <main className={`${pageShell} p-8`}>
        <p className="text-gray-400">No questions.</p>
      </main>
    );
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
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <a href={`/courses/${courseId}`} className={ghostLink}>← Back to course</a>

        <div className="space-y-1">
          <div className={`${eyebrow} text-yellow-300`}>{FOCUS_EYEBROW}</div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-gray-400">{FOCUS_CONTEXT}</p>
          <p className="pt-1 text-sm text-gray-500">Question {index + 1} of {questions.length}</p>
        </div>

        <section className={`${elevatedCard} p-6 space-y-5 sm:p-7`}>
          {question.question.length > 180 ? (
            <ScannableText
              text={question.question}
              keyTerms={focusKeyTerms}
              className="text-xl font-semibold leading-relaxed"
            />
          ) : (
            <h2 className="text-xl font-semibold leading-relaxed">{question.question}</h2>
          )}

          {question.type === 'mcq' && question.choices?.length ? (
            <McqChoices
              choices={question.choices}
              selected={answer}
              onSelect={setAnswer}
              disabled={submitting || !!feedback}
              keyTerms={focusKeyTerms}
            />
          ) : (
            <textarea
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none disabled:opacity-60"
              rows={4}
              placeholder="Write your answer…"
              value={answer}
              disabled={submitting || !!feedback}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {!feedback && (
            <button
              className={`${primaryButtonClass} px-6 py-3`}
              onClick={handleSubmit}
              disabled={!answer || submitting}
            >
              {submitting ? 'Checking your answer…' : 'Submit answer'}
            </button>
          )}

          {feedback && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
              {feedback.type === 'rubric' ? (
                <>
                  <div className={`font-medium ${feedback.passed ? 'text-green-400' : 'text-yellow-300'}`}>
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
                  <div className={`font-medium ${feedback.correct ? 'text-green-400' : 'text-red-400'}`}>
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
                        Model answer
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
              <button className={`${primaryButtonClass} px-6 py-3`} onClick={handleNext}>
                {index + 1 >= questions.length ? 'Finish' : 'Next question'}
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
