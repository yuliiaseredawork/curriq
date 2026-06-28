'use client';

import { useState } from 'react';
import { ScannableText } from './ScannableText';
import { extractKeyTerms } from '@/lib/highlightTerms';
import {
  flashcardBackSections,
  renderClozeText,
  SOURCE_NOTE_LABEL,
  WATCH_OUT_LABEL,
} from '@/lib/learnerCopy';

// The reveal endpoint's payload (api: POST /flashcards/:id/reveal). All fields
// optional so older stored cards (no labels, no source note) render safely.
export type RevealedBack = {
  back?: string | null;
  malformed?: boolean;
  sourceQuote?: string | null;
  misconceptionTarget?: string | null;
};

/**
 * Renders a revealed flashcard back as short, scannable sections:
 *  - "Answer" / "Why it matters" / "Watch out" labeled lines when the card uses
 *    them; a single readable block for older freeform cards (fully compatible).
 *  - the misconception trap as a "Watch out" line (only when the back doesn't
 *    already include one, so it's never doubled).
 *  - the source quote tucked behind a subtle "Source note" disclosure — never
 *    shown as the main answer.
 * Display-only: no scheduling/rating behavior here; cloze blanks render "_____".
 */
export function FlashcardBack({
  back,
  concept,
}: {
  back: RevealedBack;
  concept?: string | null;
}) {
  const [showSource, setShowSource] = useState(false);

  // Defensive: a back that looks truncated/corrupted is flagged upstream — keep
  // the existing "skip this card" message rather than presenting broken text.
  if (back.malformed) {
    return (
      <p className="text-sm text-yellow-400">
        This answer looks incomplete and is being reviewed. Please skip this card for now.
      </p>
    );
  }

  const sections = flashcardBackSections(back.back);
  const hasWatchOut = sections.some((s) => s.label === WATCH_OUT_LABEL);
  const keyTerms = extractKeyTerms({
    text: [back.back ?? '', ...sections.map((s) => s.body)],
    explicit: concept ? [concept] : [],
  });

  return (
    <div className="space-y-3">
      {sections.map((s, i) => {
        const watch = s.label === WATCH_OUT_LABEL;
        return (
          <div key={i} className="space-y-0.5">
            {s.label && (
              <div
                className={`text-xs font-medium uppercase tracking-wide ${
                  watch ? 'text-yellow-300' : 'text-gray-500'
                }`}
              >
                {s.label}
              </div>
            )}
            <ScannableText
              text={renderClozeText(s.body)}
              keyTerms={keyTerms}
              className={watch ? 'text-sm text-yellow-200' : 'text-gray-200'}
            />
          </div>
        );
      })}

      {back.misconceptionTarget && !hasWatchOut && (
        <p className="text-xs text-yellow-400">
          {WATCH_OUT_LABEL}: {back.misconceptionTarget}
        </p>
      )}

      {back.sourceQuote && (
        <div className="text-xs">
          <button
            type="button"
            className="text-gray-500 hover:text-gray-300"
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? `Hide ${SOURCE_NOTE_LABEL.toLowerCase()}` : SOURCE_NOTE_LABEL}
          </button>
          {showSource && (
            <p className="mt-1 italic text-gray-500">“{back.sourceQuote}”</p>
          )}
        </div>
      )}
    </div>
  );
}
