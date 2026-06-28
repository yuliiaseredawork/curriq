'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { RatingButtons } from '@/components/RatingButtons';
import { McqChoices } from '@/components/McqChoices';
import { extractKeyTerms } from '@/lib/highlightTerms';
import {
  sessionProgressLabel,
  sessionEmptyState,
  questionHeading,
  questionEyebrow,
  questionFocus,
  taskContextLine,
  flashcardRatedLine,
  renderClozeText,
} from '@/lib/learnerCopy';
import { parseSessionScope } from '@/lib/sessionScope';

function SessionInner() {
  const { getToken, isLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const api = createApiClient(getToken);

  // Scope params on the same session: all-courses, one course, or one chapter.
  const searchParams = useSearchParams();
  const { courseId: scopeCourseId, chapterId: scopeChapterId } = parseSessionScope(searchParams);

  const userId = user?.primaryEmailAddress?.emailAddress
    ? `email:${user.primaryEmailAddress.emailAddress.toLowerCase()}`
    : user?.id
      ? `clerk:${user.id}`
      : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [goal, setGoal] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);

  // Per-task interaction state (reset on advance).
  const [back, setBack] = useState<any>(null); // flashcard reveal
  const [rated, setRated] = useState<any>(null); // flashcard rating result
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<any>(null); // review/quiz feedback
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.getSessionToday(scopeCourseId, scopeChapterId);
      setGoal(res.goal);
      setTasks(res.tasks ?? []);
      setIndex(0);
      resetTaskState();
    } catch (e: any) {
      setError(e.message ?? 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded || !userLoaded) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userLoaded, scopeCourseId, scopeChapterId]);

  function resetTaskState() {
    setBack(null);
    setRated(null);
    setAnswer('');
    setFeedback(null);
  }

  function advance() {
    resetTaskState();
    setReviewed((n) => n + 1);
    setIndex((i) => i + 1);
  }

  const task = tasks[index];

  // --- Flashcard handlers ---------------------------------------------------
  async function handleReveal() {
    try {
      setBack(await api.revealFlashcard(task.cardId, task.courseId));
    } catch (e: any) {
      setError(e.message ?? 'Failed to reveal');
    }
  }

  async function handleRate(r: string) {
    setBusy(true);
    try {
      const result = await api.rateFlashcard(task.cardId, task.courseId, r);
      setRated({ rating: r, ...result });
    } catch (e: any) {
      setError(e.message ?? 'Failed to rate');
    } finally {
      setBusy(false);
    }
  }

  // --- Review / quiz handlers ----------------------------------------------
  async function handleSubmit() {
    if (!answer || !task) return;
    setBusy(true);
    setError('');
    try {
      let raw: any;
      if (task.kind === 'review') {
        raw = await api.answerReview(task.reviewId, answer);
      } else {
        raw = await api.submitAnswer({
          userId: userId ?? '',
          courseId: task.courseId,
          chapterId: task.chapterId,
          questionId: task.questionId,
          userAnswer: answer,
        });
      }
      setFeedback(normalizeFeedback(task.kind, raw));
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit answer');
    } finally {
      setBusy(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/" className="text-blue-400">← Home</a>
        {children}
      </div>
    </main>
  );

  if (loading) return <Shell><p className="text-gray-300">Loading your session…</p></Shell>;
  if (error) return <Shell><div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">{error}</div></Shell>;

  // Empty session (no current task): distinguish completion vs. a still-
  // preparing new course vs. genuinely nothing due.
  if (!task) {
    const empty = sessionEmptyState({
      reviewed,
      scopeCourseId,
      scopeChapterId,
      chapterReady: goal?.chapterReady,
    });
    const preparing = empty.kind === 'preparing';
    const backHref = 'backHref' in empty ? empty.backHref : undefined;
    return (
      <Shell>
        <div
          className={`rounded-xl border p-6 space-y-2 ${
            preparing ? 'border-blue-800 bg-blue-950/40' : 'border-green-700 bg-green-950'
          }`}
        >
          <div className="text-2xl font-bold">{empty.title}</div>
          <p className="text-gray-200">{empty.body}</p>
          {backHref && (
            <a href={backHref} className="inline-block text-blue-300">
              ← Back to course
            </a>
          )}
        </div>
      </Shell>
    );
  }

  const keyTermsForQuestion = task.question
    ? extractKeyTerms({
        text: [task.question.question, ...((task.question.choices as string[]) ?? [])],
        explicit: task.question.concept_tags ?? [],
      })
    : [];

  return (
    <Shell>
      <div className="flex items-center justify-between text-sm">
        <span className="text-blue-300">
          {sessionProgressLabel(index, tasks.length)} · {task.courseTitle}
        </span>
      </div>

      {/* progress bar across the session */}
      <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
        <div className="h-full bg-blue-500" style={{ width: `${Math.round((index / tasks.length) * 100)}%` }} />
      </div>

      {task.kind === 'flashcard'
        ? renderFlashcard()
        : renderQuestion()}
    </Shell>
  );

  // ------------------------------------------------------------------------
  function renderFlashcard() {
    const keyTerms = extractKeyTerms({ text: [task.front, back?.back], explicit: [task.concept] });
    return (
      <>
        <div className="text-sm text-purple-300">{task.concept}</div>
        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4 min-h-[180px]">
          <ScannableText text={renderClozeText(task.front)} keyTerms={keyTerms} className="text-lg font-medium" />
          {back && (
            <div className="border-t border-gray-800 pt-4 space-y-2">
              {back.malformed ? (
                <p className="text-sm text-yellow-400">
                  This answer looks incomplete and is being reviewed. Please skip this card for now.
                </p>
              ) : (
                <ScannableText text={renderClozeText(back.back)} keyTerms={keyTerms} className="text-gray-200" />
              )}
              {back.sourceQuote && <p className="text-xs text-gray-500 italic">“{back.sourceQuote}”</p>}
              {back.misconceptionTarget && (
                <p className="text-xs text-yellow-400">Watch out: {back.misconceptionTarget}</p>
              )}
            </div>
          )}
        </section>

        {!back ? (
          <button className="w-full rounded-lg bg-white text-black px-5 py-3 font-medium" onClick={handleReveal}>
            Show answer
          </button>
        ) : rated ? (
          <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3 text-center">
            <p className="text-gray-300">{flashcardRatedLine(rated.rating, rated.intervalDays)}</p>
            <button className="rounded-lg bg-blue-500 px-5 py-3 text-white" onClick={advance}>
              {index + 1 < tasks.length ? 'Next task' : 'Finish session'}
            </button>
          </div>
        ) : (
          <RatingButtons onRate={handleRate} disabled={busy} />
        )}
      </>
    );
  }

  function renderQuestion() {
    const q = task.question;
    const context = taskContextLine(task);
    const focus = questionFocus(task);
    return (
      <>
        <div>
          <div className="text-sm text-blue-300">{questionEyebrow(task)}</div>
          <h1 className="text-2xl font-bold">{questionHeading(task)}</h1>
          {context && <p className="mt-1 text-sm text-gray-400">{context}</p>}
        </div>

        <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
          {focus && (
            <span className="inline-block rounded-full border border-gray-700 px-3 py-0.5 text-xs text-gray-400">
              Focus: {focus}
            </span>
          )}
          {q.question.length > 180 ? (
            <ScannableText text={q.question} keyTerms={keyTermsForQuestion} className="text-xl font-semibold" />
          ) : (
            <h2 className="text-xl font-semibold">{q.question}</h2>
          )}

          {q.type === 'mcq' && q.choices?.length ? (
            <McqChoices
              choices={q.choices}
              selected={answer}
              onSelect={setAnswer}
              disabled={busy || !!feedback}
              keyTerms={keyTermsForQuestion}
            />
          ) : (
            <textarea
              className="w-full rounded-lg bg-gray-950 border border-gray-700 px-4 py-3 disabled:opacity-60"
              rows={4}
              placeholder="Write your answer..."
              value={answer}
              disabled={busy || !!feedback}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {!feedback && (
            <button
              className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
              onClick={handleSubmit}
              disabled={!answer || busy}
            >
              {busy ? 'Checking your answer…' : 'Submit answer'}
            </button>
          )}

          {feedback && (
            <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className={feedback.correct ? 'text-green-400' : 'text-yellow-300'}>{feedback.headline}</span>
                {feedback.meta && <span className="text-xs text-gray-400">{feedback.meta}</span>}
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
              {feedback.explanation && (
                <ScannableText text={feedback.explanation} keyTerms={keyTermsForQuestion} className="text-gray-300" />
              )}
              {feedback.idealAnswer && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Ideal answer</div>
                  <ScannableText
                    text={feedback.idealAnswer}
                    keyTerms={keyTermsForQuestion}
                    clampChars={160}
                    className="text-sm text-gray-400"
                  />
                </div>
              )}
              <button className="rounded-lg bg-blue-500 px-5 py-3 text-white" onClick={advance}>
                {index + 1 < tasks.length ? 'Next task' : 'Finish session'}
              </button>
            </div>
          )}
        </section>
      </>
    );
  }
}

// useSearchParams (scope param) must be read inside a Suspense boundary.
export default function SessionPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" />}>
      <SessionInner />
    </Suspense>
  );
}

/** Normalize the two answer-feedback shapes (reviews vs. study) into one view model. */
function normalizeFeedback(kind: string, raw: any) {
  if (kind === 'review') {
    const fb = raw.feedback ?? {};
    const correct = fb.type === 'rubric' ? raw.score >= 70 : !!fb.correct;
    return {
      correct,
      headline: fb.type === 'rubric' ? `Score ${raw.score}/100` : correct ? 'Correct' : 'Not quite',
      meta:
        raw.quality && raw.intervalDays != null
          ? `Rated ${raw.quality} · next review in ${raw.intervalDays}d`
          : undefined,
      explanation: fb.type === 'rubric' ? fb.feedback : fb.explanation,
      idealAnswer: raw.idealAnswer,
      strengths: fb.strengths,
      missingConcepts: fb.missingConcepts,
    };
  }
  // quiz (study/answer)
  const fb = raw.feedback ?? {};
  return {
    correct: !!fb.correct,
    headline: fb.correct ? 'Correct' : 'Not quite',
    meta: undefined,
    explanation: fb.explanation,
    idealAnswer: fb.ideal_answer,
    strengths: undefined,
    missingConcepts: undefined,
  };
}
