// Deterministic concept tag normalization — collapses obvious duplicates
// (scaling/scalability, partition/partitions, trade-off/trade-offs, offset/
// offsets, ...) BEFORE the LLM consolidation step does the real semantic
// grouping. Keeps evidence counts accurate and reduces noise.

// Single-word synonyms (non-plural). Plurals are handled by singularizeWord.
const SYNONYMS: Record<string, string> = {
  scalability: 'scaling',
  scalable: 'scaling',
  ordering: 'ordering',
  parallelism: 'parallelism',
};

function singularizeWord(w: string): string {
  if (w.length > 4 && /s$/.test(w) && !/(ss|us|is|as)$/.test(w)) {
    return w.slice(0, -1);
  }
  return w;
}

function normWord(w: string): string {
  const lower = w.toLowerCase();
  const mapped = SYNONYMS[lower] ?? lower;
  const singular = singularizeWord(mapped);
  return SYNONYMS[singular] ?? singular;
}

/** Normalize a raw concept tag to a canonical-ish key for de-duplication. */
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .split(/[\s/]+/)
    .filter(Boolean)
    .map(normWord)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Aggregate raw tags into normalized tags with evidence counts (desc). */
export function dedupeTags(
  tags: string[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tags) {
    const n = normalizeTag(t);
    if (!n) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** Overlap (intersection size) between two normalized concept lists. */
export function tagOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map(normalizeTag));
  return a.map(normalizeTag).filter((t) => setB.has(t)).length;
}
