// The standard spaced-repetition rating control: Again / Hard / Good / Easy.
// These are the rating ACTION (not internal jargon) and must stay as-is. Kept
// here as a small component so the controls are render-testable; markup,
// labels, ordering and handler semantics match the original inline version.

export const RATINGS: Array<{ key: string; label: string; cls: string }> = [
  { key: 'AGAIN', label: 'Again', cls: 'bg-red-600' },
  { key: 'HARD', label: 'Hard', cls: 'bg-orange-600' },
  { key: 'GOOD', label: 'Good', cls: 'bg-blue-600' },
  { key: 'EASY', label: 'Easy', cls: 'bg-green-600' },
];

export function RatingButtons({
  onRate,
  disabled = false,
}: {
  onRate: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {RATINGS.map((r) => (
        <button
          key={r.key}
          disabled={disabled}
          className={`rounded-lg ${r.cls} px-3 py-3 text-sm font-medium text-white disabled:opacity-50`}
          onClick={() => onRate(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
