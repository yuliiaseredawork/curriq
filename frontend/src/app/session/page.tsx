'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { RatingButtons } from '@/components/RatingButtons';
import { McqChoices } from '@/components/McqChoices';
import { FlashcardBack } from '@/components/FlashcardBack';
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
  primaryButtonClass,
  FLASHCARD_RATING_PROMPT,
  FLASHCARD_REVIEW_EYEBROW,
  FLASHCARD_SAVED_LABEL,
  feedbackTakeaway,
} from '@/lib/learnerCopy';
import { parseSessionScope } from '@/lib/sessionScope';
import {
  pageShell,
  readingContainer,
  elevatedCard,
  eyebrow,
  ghostLink,
  progressTrack,
  progressFill,
} from '@/lib/ui';

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
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <a href="/" className={ghostLink}>← Home</a>
        {children}
      </div>
    </main>
  );

  if (loading) return <Shell><p className="text-gray-300">Loading your session…</p></Shell>;
  if (error) return <Shell><div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-red-200">{error}</div></Shell>;

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
          className={`rounded-2xl border p-8 space-y-2 text-center ${
            preparing ? 'border-blue-500/30 bg-blue-950/30' : 'border-green-500/30 bg-green-950/25'
          }`}
        >
          <div className="text-2xl font-bold tracking-tight">{empty.title}</div>
          <p className="text-gray-300">{empty.body}</p>
          {backHref && (
            <a href={backHref} className="inline-block pt-1 text-sm text-blue-300 hover:text-blue-200">
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
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-300">
            {sessionProgressLabel(index, tasks.length)}
          </span>
          <span className="ml-3 truncate text-gray-500">{task.courseTitle}</span>
        </div>
        <div className={progressTrack}>
          <div
            className={progressFill}
            style={{ width: `${Math.round((index / tasks.length) * 100)}%` }}
          />
        </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${eyebrow} text-purple-300`}>{FLASHCARD_REVIEW_EYEBROW}</span>
          {task.concept && (
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-xs text-gray-400">
              {task.concept}
            </span>
          )}
        </div>
        <section className={`${elevatedCard} flex min-h-[200px] flex-col justify-center gap-4 p-6 sm:p-7`}>
          <ScannableText
            text={renderClozeText(task.front)}
            keyTerms={keyTerms}
            className="text-xl font-medium leading-relaxed"
          />
          {back && (
            <div className="border-t border-white/10 pt-4">
              <FlashcardBack back={back} concept={task.concept} />
            </div>
          )}
        </section>

        {!back ? (
          <button
            className="w-full rounded-xl bg-white px-5 py-3.5 font-medium text-black transition hover:bg-gray-100"
            onClick={handleReveal}
          >
            Show answer
          </button>
        ) : rated ? (
          <div className="rounded-2xl border border-green-500/25 bg-green-950/20 p-5 text-center space-y-3">
            <div className="text-sm font-medium text-green-300">{FLASHCARD_SAVED_LABEL} ✓</div>
            <p className="text-sm text-gray-400">{flashcardRatedLine(rated.rating, rated.intervalDays)}</p>
            <button className={`${primaryButtonClass} px-6 py-3`} onClick={advance}>
              {index + 1 < tasks.length ? 'Next task' : 'Finish session'}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="text-center text-sm font-medium text-gray-300">{FLASHCARD_RATING_PROMPT}</p>
            <RatingButtons onRate={handleRate} disabled={busy} />
          </div>
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
          <div className={`${eyebrow} text-blue-300`}>{questionEyebrow(task)}</div>
          <h1 className="text-2xl font-bold tracking-tight">{questionHeading(task)}</h1>
          {context && <p className="mt-1 text-sm text-gray-400">{context}</p>}
        </div>

        <section className={`${elevatedCard} p-6 space-y-5 sm:p-7`}>
          {focus && (
            <span className="inline-block rounded-full border border-white/10 bg-white/[0.03] px-3 py-0.5 text-xs text-gray-400">
              Focus: {focus}
            </span>
          )}
          {q.question.length > 180 ? (
            <ScannableText text={q.question} keyTerms={keyTermsForQuestion} className="text-xl font-semibold leading-relaxed" />
          ) : (
            <h2 className="text-xl font-semibold leading-relaxed">{q.question}</h2>
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
              className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 transition placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none disabled:opacity-60"
              rows={4}
              placeholder="Write your answer…"
              value={answer}
              disabled={busy || !!feedback}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {!feedback && (
            <button
              className={`${primaryButtonClass} px-6 py-3`}
              onClick={handleSubmit}
              disabled={!answer || busy}
            >
              {busy ? 'Checking your answer…' : 'Submit answer'}
            </button>
          )}

          {feedback && (() => {
            // Lead with one concise takeaway; tuck the longer explanation +
            // strengths/gaps behind "Show details" and collapse the model answer
            // so the result never lands as a wall of text. Grading is unchanged.
            const fullExplanation = (feedback.explanation ?? '').trim();
            // Strip a leading "Not quite"/"Correct" so the takeaway never echoes
            // the verdict shown right above it.
            const takeaway = feedbackTakeaway(fullExplanation);
            const moreThanTakeaway =
              fullExplanation.length > 0 &&
              (takeaway === null || fullExplanation.length > takeaway.replace(/…$/, '').length);
            const hasDetails =
              (feedback.strengths?.length ?? 0) > 0 ||
              (feedback.missingConcepts?.length ?? 0) > 0 ||
              moreThanTakeaway;
            return (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${feedback.correct ? 'text-green-400' : 'text-yellow-300'}`}>{feedback.headline}</span>
                  {feedback.meta && <span className="text-xs text-gray-400">{feedback.meta}</span>}
                </div>

                {takeaway && (
                  <div>
                    <div className={`${eyebrow} text-gray-500`}>Takeaway</div>
                    <p className="text-gray-200">{takeaway}</p>
                  </div>
                )}

                {hasDetails && (
                  <details>
                    <summary className="cursor-pointer text-sm text-gray-400 transition hover:text-gray-200">
                      Show details
                    </summary>
                    <div className="mt-3 space-y-3">
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
                      {moreThanTakeaway && (
                        <ScannableText text={fullExplanation} keyTerms={keyTermsForQuestion} className="text-sm text-gray-300" />
                      )}
                    </div>
                  </details>
                )}

                {feedback.idealAnswer && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-gray-500">
                      Model answer
                    </summary>
                    <ScannableText
                      text={feedback.idealAnswer}
                      keyTerms={keyTermsForQuestion}
                      clampChars={200}
                      className="mt-1 text-sm text-gray-400"
                    />
                  </details>
                )}

                <button className={`${primaryButtonClass} px-6 py-3`} onClick={advance}>
                  {index + 1 < tasks.length ? 'Next task' : 'Finish session'}
                </button>
              </div>
            );
          })()}
        </section>
      </>
    );
  }
}

// useSearchParams (scope param) must be read inside a Suspense boundary.
export default function SessionPage() {
  return (
    <Suspense fallback={<div className={pageShell} />}>
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
