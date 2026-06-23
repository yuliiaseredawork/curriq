'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { extractKeyTerms } from '@/lib/highlightTerms';

const RATINGS: Array<{ key: string; label: string; cls: string }> = [
  { key: 'AGAIN', label: 'Again', cls: 'bg-red-600' },
  { key: 'HARD', label: 'Hard', cls: 'bg-orange-600' },
  { key: 'GOOD', label: 'Good', cls: 'bg-blue-600' },
  { key: 'EASY', label: 'Easy', cls: 'bg-green-600' },
];

export default function FlashcardsPage() {
  const { getToken, isLoaded } = useAuth();
  const api = createApiClient(getToken);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [card, setCard] = useState<any>(null);
  const [totalDue, setTotalDue] = useState(0);
  const [back, setBack] = useState<any>(null);
  const [rating, setRating] = useState(false);
  const [rated, setRated] = useState<any>(null);
  const [done, setDone] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  async function loadNext() {
    setLoading(true);
    setError('');
    setBack(null);
    setRated(null);
    try {
      const res = await api.nextFlashcard();
      if (res.status === 'NO_CARDS') {
        setDone(true);
        return;
      }
      setCard(res);
      setTotalDue(res.progress?.totalDue ?? 0);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load flashcard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  async function handleReveal() {
    try {
      setBack(await api.revealFlashcard(card.cardId, card.courseId));
    } catch (e: any) {
      setError(e.message ?? 'Failed to reveal');
    }
  }

  async function handleRate(r: string) {
    setRating(true);
    try {
      const result = await api.rateFlashcard(card.cardId, card.courseId, r);
      setRated({ rating: r, ...result });
      setReviewed((n) => n + 1);
    } catch (e: any) {
      setError(e.message ?? 'Failed to rate');
    } finally {
      setRating(false);
    }
  }

  const keyTerms = card
    ? extractKeyTerms({ text: [card.front, back?.back], explicit: [card.concept] })
    : [];

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <a href="/" className="text-blue-400">← Home</a>
        {children}
      </div>
    </main>
  );

  if (loading) return <Shell><p className="text-gray-300">Loading…</p></Shell>;
  if (error) return <Shell><div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">{error}</div></Shell>;
  if (done) {
    return (
      <Shell>
        <div className="rounded-xl border border-green-700 bg-green-950 p-6">
          <div className="text-2xl font-bold">Review complete for today 🎉</div>
          <p className="text-gray-200 mt-1">
            {reviewed > 0 ? `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}.` : 'No flashcards are due.'}
          </p>
        </div>
      </Shell>
    );
  }
  if (!card) return <Shell><p className="text-gray-300">No cards.</p></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between text-sm">
        <span className="text-purple-300">{card.courseTitle} · {card.concept}</span>
        <span className="text-gray-500">{totalDue} due · {reviewed} done</span>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4 min-h-[180px]">
        <div className="text-xs uppercase tracking-wide text-gray-500">{card.type}</div>
        <ScannableText text={card.front} keyTerms={keyTerms} className="text-lg font-medium" />

        {back && (
          <div className="border-t border-gray-800 pt-4 space-y-2">
            <ScannableText text={back.back} keyTerms={keyTerms} className="text-gray-200" />
            {back.sourceQuote && (
              <p className="text-xs text-gray-500 italic">“{back.sourceQuote}”</p>
            )}
            {back.misconceptionTarget && (
              <p className="text-xs text-yellow-400">Watch out: {back.misconceptionTarget}</p>
            )}
          </div>
        )}
      </section>

      {!back ? (
        <button
          className="w-full rounded-lg bg-white text-black px-5 py-3 font-medium"
          onClick={handleReveal}
        >
          Show answer
        </button>
      ) : rated ? (
        <div className="rounded-lg border border-gray-700 bg-gray-950 p-4 space-y-3 text-center">
          <p className="text-gray-300">
            Rated <span className="font-semibold">{rated.rating}</span> · next review in {rated.intervalDays} day{rated.intervalDays === 1 ? '' : 's'}
          </p>
          <button className="rounded-lg bg-blue-500 px-5 py-3 text-white" onClick={loadNext}>
            Next card
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <button
              key={r.key}
              disabled={rating}
              className={`rounded-lg ${r.cls} px-3 py-3 text-sm font-medium text-white disabled:opacity-50`}
              onClick={() => handleRate(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}
