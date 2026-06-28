import { ScannableText } from './ScannableText';

// The single multiple-choice renderer for the canonical session. Markup matches
// the previous inline versions (choices → buttons → inline ScannableText) so
// behaviour/appearance are unchanged; it just lives in one place now.
export function McqChoices({
  choices,
  selected,
  onSelect,
  disabled = false,
  keyTerms = [],
}: {
  choices: string[];
  selected: string;
  onSelect: (choice: string) => void;
  disabled?: boolean;
  keyTerms?: string[];
}) {
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
                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
            onClick={() => onSelect(choice)}
          >
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs font-semibold ${
                isSelected ? 'border-blue-400 bg-blue-500 text-white' : 'border-white/15 text-gray-500'
              }`}
            >
              {String.fromCharCode(65 + idx)}
            </span>
            <ScannableText inline text={choice} keyTerms={keyTerms} />
          </button>
        );
      })}
    </div>
  );
}
