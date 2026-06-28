'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { RatingButtons } from '@/components/RatingButtons';
import { FlashcardBack } from '@/components/FlashcardBack';
import { extractKeyTerms } from '@/lib/highlightTerms';
import {
  flashcardRatedLine,
  renderClozeText,
  FLASHCARD_RATING_PROMPT,
  FLASHCARD_REVIEW_EYEBROW,
  FLASHCARD_SAVED_LABEL,
} from '@/lib/learnerCopy';
import { pageShell, elevatedCard, eyebrow, ghostLink, primaryButtonClass } from '@/lib/ui';

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
    <main className={pageShell}>
      <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8 sm:px-8 sm:py-10">
        <a href="/" className={ghostLink}>← Home</a>
        {children}
      </div>
    </main>
  );

  if (loading) return <Shell><p className="text-gray-300">Loading…</p></Shell>;
  if (error) return <Shell><div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-red-200">{error}</div></Shell>;
  if (done) {
    return (
      <Shell>
        <div className="rounded-2xl border border-green-500/30 bg-green-950/25 p-8 text-center">
          <div className="text-2xl font-bold tracking-tight">Review complete for today 🎉</div>
          <p className="mt-1 text-gray-300">
            {reviewed > 0 ? `You reviewed ${reviewed} card${reviewed === 1 ? '' : 's'}.` : 'No flashcards are due.'}
          </p>
        </div>
      </Shell>
    );
  }
  if (!card) return <Shell><p className="text-gray-300">No cards.</p></Shell>;

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`${eyebrow} text-purple-300`}>{FLASHCARD_REVIEW_EYEBROW}</span>
          <span className="truncate rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-xs text-gray-400">
            {card.concept}
          </span>
        </div>
        <span className="shrink-0 text-gray-500">{totalDue} due · {reviewed} done</span>
      </div>

      <section className={`${elevatedCard} flex min-h-[200px] flex-col justify-center gap-4 p-6 sm:p-7`}>
        <ScannableText
          text={renderClozeText(card.front)}
          keyTerms={keyTerms}
          className="text-xl font-medium leading-relaxed"
        />

        {back && (
          <div className="border-t border-white/10 pt-4">
            <FlashcardBack back={back} concept={card.concept} />
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
          <button className={`${primaryButtonClass} px-6 py-3`} onClick={loadNext}>
            Next card
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-center text-sm font-medium text-gray-300">{FLASHCARD_RATING_PROMPT}</p>
          <RatingButtons onRate={handleRate} disabled={rating} />
        </div>
      )}
    </Shell>
  );
}
