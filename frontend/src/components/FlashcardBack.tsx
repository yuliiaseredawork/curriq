'use client';

import { ScannableText } from './ScannableText';
import { extractKeyTerms } from '@/lib/highlightTerms';
import {
  parseFlashcardBack,
  renderClozeText,
  FLASHCARD_ANSWER_LABEL,
  FLASHCARD_WHY_LABEL,
  FLASHCARD_WATCH_OUT_LABEL,
  FLASHCARD_SOURCE_NOTE_LABEL,
} from '@/lib/learnerCopy';

// The reveal endpoint's payload (api: POST /flashcards/:id/reveal). All fields
// optional so older stored cards (no labels, no source note) render safely.
export type RevealedBack = {
  back?: string | null;
  malformed?: boolean;
  sourceQuote?: string | null;
  misconceptionTarget?: string | null;
};

// One labeled section. Defined at module scope (not inside FlashcardBack) so it
// is a stable component, and the label stays small/subtle per the dark UI.
function BackSection({
  label,
  text,
  keyTerms,
  tone = 'default',
}: {
  label: string;
  text: string;
  keyTerms: string[];
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="space-y-0.5">
      <div
        className={`text-xs font-medium uppercase tracking-wide ${
          tone === 'warn' ? 'text-amber-300/70' : 'text-gray-500'
        }`}
      >
        {label}
      </div>
      <ScannableText
        text={renderClozeText(text)}
        keyTerms={keyTerms}
        className={tone === 'warn' ? 'text-sm text-gray-300' : 'text-gray-200'}
      />
    </div>
  );
}

/**
 * Renders a revealed flashcard back as scannable sections:
 *  - "Answer" / "Why it matters" / "Watch out" when the card uses those labels;
 *  - a single readable block (paragraphs preserved) for older freeform cards;
 *  - the source quote / note tucked inside a subtle "Source note" <details>,
 *    never shown as the main answer.
 * Display-only: no scheduling/rating here; cloze blanks render "_____". All
 * existing stored cards stay compatible (nothing is dropped).
 */
export function FlashcardBack({
  back,
  concept,
}: {
  back: RevealedBack;
  concept?: string | null;
}) {
  // Defensive: a back flagged as truncated/corrupted upstream keeps the existing
  // "skip this card" message rather than presenting broken text.
  if (back.malformed) {
    return (
      <p className="text-sm text-yellow-400">
        This answer looks incomplete and is being reviewed. Please skip this card for now.
      </p>
    );
  }

  const parsed = parseFlashcardBack(back.back);
  // A misconception stored separately reads as a "Watch out" when the back text
  // doesn't already provide one.
  const watchOut = parsed.watchOut ?? back.misconceptionTarget ?? null;
  const hasStructure = !!(parsed.answer || parsed.why || watchOut);
  // Source note can come from an embedded "Source:" label and/or the separate
  // stored quote — both belong under the disclosure, never the answer body.
  const hasSource = !!(parsed.sourceNote || back.sourceQuote);

  const keyTerms = extractKeyTerms({
    text: [back.back ?? '', parsed.answer ?? '', parsed.why ?? '', watchOut ?? ''],
    explicit: concept ? [concept] : [],
  });

  return (
    <div className="space-y-3">
      {hasStructure ? (
        <>
          {parsed.answer && (
            <BackSection label={FLASHCARD_ANSWER_LABEL} text={parsed.answer} keyTerms={keyTerms} />
          )}
          {parsed.why && (
            <BackSection label={FLASHCARD_WHY_LABEL} text={parsed.why} keyTerms={keyTerms} />
          )}
          {watchOut && (
            <BackSection
              label={FLASHCARD_WATCH_OUT_LABEL}
              text={watchOut}
              keyTerms={keyTerms}
              tone="warn"
            />
          )}
          {/* Never drop content: any unplaceable leftover renders plainly. */}
          {parsed.fallback && (
            <ScannableText
              text={renderClozeText(parsed.fallback)}
              keyTerms={keyTerms}
              className="text-gray-200"
            />
          )}
        </>
      ) : (
        <ScannableText
          text={renderClozeText(parsed.fallback ?? back.back ?? '')}
          keyTerms={keyTerms}
          className="text-gray-200"
        />
      )}

      {hasSource && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
            {FLASHCARD_SOURCE_NOTE_LABEL}
          </summary>
          <div className="mt-1 space-y-1">
            {parsed.sourceNote && (
              <p className="text-gray-400">{renderClozeText(parsed.sourceNote)}</p>
            )}
            {back.sourceQuote && <p className="italic text-gray-500">“{back.sourceQuote}”</p>}
          </div>
        </details>
      )}
    </div>
  );
}
