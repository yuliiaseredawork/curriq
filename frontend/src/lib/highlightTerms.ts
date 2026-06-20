// Frontend key-term extraction for the scannable-reading layer.
//
// Derives meaningful, course-specific terms from the VISIBLE text (plus any
// explicit metadata), so highlights help the learner instead of just marking
// the obvious course name. No AI, no network — pure heuristics:
//   - multi-word technical phrases (noun phrases) preferred over single words
//   - single technical nouns that survive a generic-word stoplist
//   - explicit terms (concept_tags / focus rawConcepts) always included
//   - singular/plural de-duplication
//   - broad/dominant course-title words deprioritized when specifics exist
//   - capped to keep the UI quiet
//
// The returned terms feed ScannableText, which does the safe matching
// (escaping, word boundaries, longest-first, per-term/paragraph caps).

const STOPWORDS = new Set<string>([
  // generic English (>= 4 chars)
  'this', 'that', 'these', 'those', 'with', 'from', 'into', 'onto', 'upon',
  'your', 'yours', 'they', 'them', 'their', 'there', 'then', 'than', 'also',
  'such', 'some', 'many', 'most', 'more', 'less', 'very', 'just', 'only',
  'each', 'every', 'both', 'when', 'what', 'which', 'where', 'while', 'because',
  'about', 'over', 'under', 'between', 'across', 'within', 'during', 'after',
  'before', 'here', 'have', 'been', 'being', 'does', 'done', 'make', 'makes',
  'made', 'like', 'want', 'need', 'needs', 'used', 'uses', 'using', 'work',
  'works', 'working', 'help', 'helps', 'allow', 'allows', 'able', 'would',
  'could', 'should', 'must', 'even', 'well', 'much', 'will', 'them', 'they',
  'other', 'another', 'same', 'different', 'often', 'usually', 'common',
  'simple', 'several', 'various', 'including', 'include', 'includes',
  // instructional / meta words
  'course', 'courses', 'chapter', 'chapters', 'lesson', 'lessons', 'module',
  'modules', 'section', 'sections', 'unit', 'units', 'learn', 'learns',
  'learned', 'learning', 'learner', 'learners', 'understand', 'understands',
  'understanding', 'introduce', 'introduces', 'introduced', 'introduction',
  'overview', 'fundamental', 'fundamentals', 'basic', 'basics', 'concept',
  'concepts', 'example', 'examples', 'cover', 'covers', 'covered', 'covering',
  'implement', 'implements', 'implemented', 'implementing', 'question',
  'questions', 'answer', 'answers', 'correct', 'incorrect', 'explain',
  'explains', 'explanation', 'review', 'reviews', 'practice', 'study',
  'studies', 'building', 'build', 'builds', 'built', 'block', 'blocks',
  'form', 'forms', 'formed', 'divide', 'divides', 'divided', 'enable',
  'enables', 'enabled', 'track', 'tracks', 'tracked', 'tracking', 'position',
  'positions', 'goal', 'goals', 'able', 'allow', 'demonstrate', 'describe',
  'discuss', 'explore', 'identify', 'apply', 'note', 'notes',
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter(
    (t) => /[a-z]/.test(t),
  );
}

/** Stable key for de-duping singular/plural; for phrases, stems the last word. */
function stemKey(term: string): string {
  const parts = term.toLowerCase().trim().split(/\s+/);
  const last = parts[parts.length - 1];
  const lastStem = last.length > 4 ? last.replace(/s$/, '') : last;
  parts[parts.length - 1] = lastStem;
  return parts.join(' ');
}

function isContentful(token: string): boolean {
  // >= 4 so short function words (the/are/for/how/into) never join phrases.
  return token.length >= 4 && !STOPWORDS.has(token);
}
function isCandidateSingle(token: string): boolean {
  return token.length >= 4 && !STOPWORDS.has(token) && /[a-z]/.test(token[0]);
}

/** Significant words from a title (used as emphasize / deprioritize sources). */
export function titleTerms(title?: string): string[] {
  return tokenize(title ?? '').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

export function extractKeyTerms(input: {
  text?: string | Array<string | null | undefined>;
  explicit?: string[];
  emphasize?: string[]; // boosted (e.g. chapter/focus title words)
  deprioritize?: string[]; // suppressed when specifics exist (e.g. course title)
  max?: number;
}): string[] {
  const max = input.max ?? 12;
  const texts = (Array.isArray(input.text) ? input.text : [input.text]).filter(
    (t): t is string => !!t && t.trim().length > 0,
  );
  const blob = texts.join('. ');
  const tokens = tokenize(blob);

  const emphasize = new Set((input.emphasize ?? []).map(stemKey));
  const deprioritize = new Set((input.deprioritize ?? []).map(stemKey));

  type Cand = { term: string; score: number; broad: boolean; multi: boolean };
  const byKey = new Map<string, Cand>();
  const upsert = (term: string, score: number, multi: boolean) => {
    const key = stemKey(term);
    if (!key) return;
    const broad = deprioritize.has(key);
    const existing = byKey.get(key);
    if (!existing || score > existing.score) {
      byKey.set(key, { term: term.toLowerCase().trim(), score, broad, multi });
    }
  };

  // 1) Explicit metadata terms — always included, highest priority.
  for (const t of input.explicit ?? []) {
    const term = t.trim();
    if (term.length >= 2) upsert(term, 1000, /\s/.test(term));
  }

  // 2) Multi-word phrases (3-grams then 2-grams of contentful tokens).
  for (const n of [3, 2]) {
    const counts = new Map<string, number>();
    for (let i = 0; i + n <= tokens.length; i++) {
      const gram = tokens.slice(i, i + n);
      if (!gram.every(isContentful)) continue;
      const phrase = gram.join(' ');
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
    for (const [phrase, count] of counts) {
      // 3-grams are usually junk unless they recur; 2-grams kept once.
      if (n === 3 && count < 2) continue;
      upsert(phrase, 400 + n * 30 + count * 40, true);
    }
  }

  // 3) Single technical nouns.
  const singleCounts = new Map<string, number>();
  for (const t of tokens) {
    if (isCandidateSingle(t)) singleCounts.set(t, (singleCounts.get(t) ?? 0) + 1);
  }
  for (const [word, count] of singleCounts) {
    const boost = emphasize.has(stemKey(word)) ? 250 : 0;
    upsert(word, 120 + boost + count * 15, false);
  }

  // Rank: non-broad first; broad terms only kept if specifics are scarce.
  const all = [...byKey.values()].sort((a, b) => b.score - a.score);
  const specific = all.filter((c) => !c.broad);
  const broad = all.filter((c) => c.broad);
  const chosen = specific.length >= 2 ? specific : [...specific, ...broad];

  return chosen.slice(0, max).map((c) => c.term);
}
