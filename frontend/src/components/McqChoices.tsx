import { ScannableText } from "./ScannableText";

// Honest-uncertainty option: submitted as the answer text (it never matches the
// correct choice, so grading counts it wrong) — but the learner isn't pushed to
// guess, which keeps mistake data and spaced-repetition scheduling honest.
export const NOT_SURE_CHOICE = "I’m not sure";

// The single multiple-choice renderer for the canonical session. Markup matches
// the previous inline versions (choices → buttons → inline ScannableText) so
// behaviour/appearance are unchanged; it just lives in one place now.
export function McqChoices({
  choices,
  selected,
  onSelect,
  disabled = false,
  keyTerms = [],
  allowNotSure = false,
}: {
  choices: string[];
  selected: string;
  onSelect: (choice: string) => void;
  disabled?: boolean;
  keyTerms?: string[];
  /** Render a quiet trailing "I'm not sure" option (graded as incorrect). */
  allowNotSure?: boolean;
}) {
  const notSureSelected = selected === NOT_SURE_CHOICE;
  return (
    <div className="space-y-2.5">
      {choices.map((choice, idx) => {
        const isSelected = selected === choice;
        return (
          <button
            key={choice}
            disabled={disabled}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
              isSelected
                ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30"
                : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
            }`}
            onClick={() => onSelect(choice)}
          >
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                isSelected
                  ? "border-blue-400 bg-blue-500 text-white"
                  : "border-white/15 text-gray-500"
              }`}
            >
              {String.fromCharCode(65 + idx)}
            </span>
            <ScannableText inline text={choice} keyTerms={keyTerms} />
          </button>
        );
      })}
      {allowNotSure && (
        <button
          disabled={disabled}
          className={`w-full rounded-xl border border-dashed px-4 py-2.5 text-center text-sm transition disabled:cursor-not-allowed ${
            notSureSelected
              ? "border-blue-500 bg-blue-500/10 text-blue-200 ring-1 ring-blue-500/30"
              : "border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300"
          }`}
          onClick={() => onSelect(NOT_SURE_CHOICE)}
        >
          {NOT_SURE_CHOICE}
        </button>
      )}
    </div>
  );
}
