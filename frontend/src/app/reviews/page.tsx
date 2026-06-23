'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { extractKeyTerms } from '@/lib/highlightTerms';

export default function ReviewsPage() {
  const { getToken, isLoaded } = useAuth();
  const api = createApiClient(getToken);

  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [concept, setConcept] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [reviewed, setReviewed] = useState(0);

  async function loadNext() {
    setLoading(true);
    setError('');
    setFeedback(null);
    setAnswer('');
    try {
      const { status, body } = await api.nextReview();
      if (status === 202 || body.status === 'PREPARING') {
        setPreparing(true);
        return;
      }
      setPreparing(false);
      if (body.status === 'NO_REVIEWS') {
        setDone(true);
        return;
      }
      setReviewId(body.reviewId);
      setConcept(body.concept);
      setQuestion(body.question);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  useEffect(() => {
    if (!preparing) return;
    const t = setInterval(loadNext, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing]);

  async function handleSubmit() {
    if (!answer || !question) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.answerReview(reviewId, answer);
      setFeedback(result);
      setReviewed((n) => n + 1);
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  }

  const keyTerms = question
    ? extractKeyTerms({
        text: [question.question, ...((question.choices as string[]) ?? [])],
        explicit: question.concept_tags ?? [],
      })
    : [];

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/" className="text-blue-400">← Home</a>
        {children}
      </div>
    </main>
  );

  if (preparing) return <Shell><div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-6 text-yellow-200">Preparing your reviews… one moment.</div></Shell>;
  if (loading) return <Shell><p className="text-gray-300">Loading…</p></Shell>;
  if (error) return <Shell><div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">{error}</div></Shell>;
  if (done) {
    return (
      <Shell>
        <div className="rounded-xl border border-green-700 bg-green-950 p-6">
          <div className="text-2xl font-bold">All caught up 🎉</div>
          <p className="text-gray-200 mt-1">
            {reviewed > 0 ? `You reviewed ${reviewed} concept${reviewed === 1 ? '' : 's'} today.` : 'No reviews are due right now.'}
          </p>
        </div>
      </Shell>
    );
  }
  if (!question) return <Shell><p className="text-gray-300">Nothing to review.</p></Shell>;

  return (
    <Shell>
      <div>
        <div className="text-sm text-blue-300">Daily review · {reviewed} done</div>
        <h1 className="text-2xl font-bold">{concept?.title}</h1>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <div className="text-sm text-gray-400">
          {question.difficulty} · {question.concept_tags?.join(', ')}
        </div>
        {question.question.length > 180 ? (
          <ScannableText text={question.question} keyTerms={keyTerms} className="text-xl font-semibold" />
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
                <ScannableText inline text={choice} keyTerms={keyTerms} />
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
            <div className="flex items-center justify-between">
              <span className={feedback.score >= 70 ? 'text-green-400' : 'text-yellow-300'}>
                {feedback.feedback?.type === 'rubric'
                  ? `Score ${feedback.score}/100`
                  : feedback.feedback?.correct
                    ? 'Correct'
                    : 'Not quite'}
              </span>
              <span className="text-xs text-gray-400">
                Rated {feedback.quality} · next review in {feedback.intervalDays}d
              </span>
            </div>
            {feedback.feedback?.type === 'rubric' ? (
              <>
                {feedback.feedback.strengths?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-green-400">What you got right</div>
                    <ul className="list-disc pl-5 text-sm text-gray-300">
                      {feedback.feedback.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {feedback.feedback.missingConcepts?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-yellow-300">What you missed</div>
                    <ul className="list-disc pl-5 text-sm text-gray-300">
                      {feedback.feedback.missingConcepts.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                <ScannableText text={feedback.feedback.feedback} keyTerms={keyTerms} className="text-gray-300" />
              </>
            ) : (
              <ScannableText text={feedback.feedback?.explanation} keyTerms={keyTerms} className="text-gray-300" />
            )}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Ideal answer</div>
              <ScannableText text={feedback.idealAnswer} keyTerms={keyTerms} clampChars={160} className="text-sm text-gray-400" />
            </div>
            <button className="rounded-lg bg-blue-500 px-5 py-3 text-white" onClick={loadNext}>
              Next review
            </button>
          </div>
        )}
      </section>
    </Shell>
  );
}
