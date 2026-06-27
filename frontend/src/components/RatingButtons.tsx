// The standard spaced-repetition rating control: Again / Hard / Good / Easy.
// These are the rating ACTION (not internal jargon) and must stay as-is. Kept
// here as a small component so the controls are render-testable; markup,
// labels, ordering and handler semantics match the original inline version.

// Softer, calmer styling: subtle tinted/bordered chips instead of loud solid
// fills. Full literal class strings so Tailwind includes them. Keys/labels and
// behaviour are unchanged.
export const RATINGS: Array<{ key: string; label: string; cls: string }> = [
  { key: 'AGAIN', label: 'Again', cls: 'border border-red-800 bg-red-950/40 text-red-200 hover:bg-red-950/70' },
  { key: 'HARD', label: 'Hard', cls: 'border border-orange-800 bg-orange-950/40 text-orange-200 hover:bg-orange-950/70' },
  { key: 'GOOD', label: 'Good', cls: 'border border-blue-800 bg-blue-950/40 text-blue-200 hover:bg-blue-950/70' },
  { key: 'EASY', label: 'Easy', cls: 'border border-green-800 bg-green-950/40 text-green-200 hover:bg-green-950/70' },
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
          className={`rounded-lg ${r.cls} px-3 py-3 text-sm font-medium transition disabled:opacity-50`}
          onClick={() => onRate(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
