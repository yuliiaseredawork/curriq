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
    <div className="space-y-2">
      {choices.map((choice) => (
        <button
          key={choice}
          disabled={disabled}
          className={`block w-full text-left rounded-lg border px-4 py-3 disabled:cursor-not-allowed ${
            selected === choice ? 'border-blue-500 bg-blue-950' : 'border-gray-700 bg-gray-950'
          }`}
          onClick={() => onSelect(choice)}
        >
          <ScannableText inline text={choice} keyTerms={keyTerms} />
        </button>
      ))}
    </div>
  );
}
