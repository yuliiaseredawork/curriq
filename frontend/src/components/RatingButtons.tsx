// The standard spaced-repetition rating control: Again / Hard / Good / Easy.
// These are the rating ACTION (not internal jargon) and must stay as-is. Kept
// here as a small component so the controls are render-testable; markup,
// labels, ordering and handler semantics match the original inline version.

// Softer, calmer styling: subtle tinted/bordered chips instead of loud solid
// fills. Full literal class strings so Tailwind includes them. Keys/labels and
// behaviour are unchanged.
export const RATINGS: Array<{ key: string; label: string; cls: string }> = [
  { key: 'AGAIN', label: 'Again', cls: 'border-red-500/25 bg-red-500/5 text-red-200 hover:border-red-500/40 hover:bg-red-500/10' },
  { key: 'HARD', label: 'Hard', cls: 'border-orange-500/25 bg-orange-500/5 text-orange-200 hover:border-orange-500/40 hover:bg-orange-500/10' },
  { key: 'GOOD', label: 'Good', cls: 'border-blue-500/25 bg-blue-500/5 text-blue-200 hover:border-blue-500/40 hover:bg-blue-500/10' },
  { key: 'EASY', label: 'Easy', cls: 'border-green-500/25 bg-green-500/5 text-green-200 hover:border-green-500/40 hover:bg-green-500/10' },
];

export function RatingButtons({
  onRate,
  disabled = false,
}: {
  onRate: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {RATINGS.map((r) => (
        <button
          key={r.key}
          disabled={disabled}
          className={`rounded-xl border ${r.cls} px-3 py-3.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100`}
          onClick={() => onRate(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
