'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { KeyTerm } from './KeyTerm';

// Lightweight "scannable reading" layer: splits long text into shorter
// paragraphs and (optionally) highlights key terms — all via safe React
// tokenization (no dangerouslySetInnerHTML, so no XSS risk).
//
// Feature flag: decorative key-term highlighting on learner-facing text.
// Disabled — automatic highlighting of arbitrary noun phrases ("developers
// rarely", "consumers reading") read as broken markup and lowered trust. With
// it off, ScannableText still preserves all real formatting (paragraphs, line
// breaks, "Show more" clamping, inline rendering); it just renders plain text.
// Flip to `true` to restore highlighting. (Single-flag, reversible by design.)
const HIGHLIGHT_KEY_TERMS = false;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build one case-insensitive regex matching any key term (plural-tolerant). */
function buildTermRegex(terms: string[]): RegExp | null {
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const raw of terms) {
    const t = (raw ?? '').trim();
    if (t.length < 2) continue;
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(t);
    }
  }
  if (!uniq.length) return null;
  // Longest first so multi-word / longer terms win over their substrings.
  uniq.sort((a, b) => b.length - a.length);
  const parts = uniq.map((t) => `${escapeRegExp(t.replace(/s$/i, ''))}s?`);
  try {
    return new RegExp(`(?<!\\w)(${parts.join('|')})(?!\\w)`, 'gi');
  } catch {
    return null;
  }
}

/**
 * Split into readable paragraphs: honor newlines, then chunk long blocks at
 * sentence boundaries. LOSSLESS by construction — we split only at real
 * boundaries (sentence punctuation followed by whitespace) and re-join with a
 * single space, so every character of the source is preserved.
 *
 * The previous implementation used `String.match(/…/g)`, which silently DROPS
 * any text it can't anchor on. Mid-token periods (e.g. "e.g.", "i.e.", decimals)
 * broke the anchor and the head of the block was lost (it rendered starting
 * ", processing + auditing)" instead of the full sentence). Exported for tests.
 */
export function splitParagraphs(text: string, maxLen = 320): string[] {
  const blocks = text
    .split(/\n{1,}/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    if (block.length <= maxLen) {
      out.push(block);
      continue;
    }
    // Split only at whitespace following sentence punctuation — keeps "e.g."
    // and decimals intact and never discards characters.
    const sentences = block.split(/(?<=[.!?])\s+/);
    let acc = '';
    for (const s of sentences) {
      if (acc && (acc + ' ' + s).length > maxLen) {
        out.push(acc);
        acc = s;
      } else {
        acc = acc ? `${acc} ${s}` : s;
      }
    }
    if (acc) out.push(acc);
  }
  return out;
}

function highlight(
  text: string,
  regex: RegExp | null,
  perTerm: Map<string, number>,
  maxPerTerm: number,
  maxPerParagraph: number,
  keyPrefix: string,
): ReactNode[] {
  if (!regex) return [text];
  const nodes: ReactNode[] = [];
  let last = 0;
  let inParagraph = 0;
  let i = 0;
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const term = m[0];
    const stem = term.toLowerCase().replace(/s$/, '');
    const used = perTerm.get(stem) ?? 0;
    // Cap to avoid visual noise; skipped matches stay as plain text.
    if (used >= maxPerTerm || inParagraph >= maxPerParagraph) continue;
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(<KeyTerm key={`${keyPrefix}-${i}`}>{term}</KeyTerm>);
    last = m.index + term.length;
    perTerm.set(stem, used + 1);
    inParagraph += 1;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function ScannableText({
  text,
  keyTerms = [],
  className = '',
  clampChars,
  maxPerTerm = 2,
  maxPerParagraph = 6,
  inline = false,
}: {
  text?: string | null;
  keyTerms?: string[];
  className?: string;
  clampChars?: number;
  maxPerTerm?: number;
  maxPerParagraph?: number;
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const safe = (text ?? '').trim();

  // When the flag is off, no regex → highlight() returns plain text, so no
  // <KeyTerm> spans are ever produced (paragraph/clamp/inline behavior intact).
  const regex = useMemo(
    () => (HIGHLIGHT_KEY_TERMS ? buildTermRegex(keyTerms) : null),
    [keyTerms.join('|')],
  );

  const collapsible = !!clampChars && safe.length > (clampChars ?? 0);
  const isClamped = collapsible && !expanded;
  const shown = isClamped
    ? `${safe.slice(0, clampChars).replace(/\s+\S*$/, '')}…`
    : safe;
  const paragraphs = useMemo(() => splitParagraphs(shown), [shown]);

  if (!safe) return null;

  // Per-render term counters (shared across paragraphs for global per-term cap).
  const perTerm = new Map<string, number>();

  // Inline mode: single <span>, no paragraph splitting / clamp. Safe to nest
  // inside interactive elements like <button> (MCQ options stay clickable).
  if (inline) {
    return (
      <span className={className}>
        {highlight(safe, regex, perTerm, maxPerTerm, maxPerParagraph, 'i')}
      </span>
    );
  }

  return (
    <div className={className}>
      {paragraphs.map((p, idx) => (
        <p key={idx} className="leading-relaxed mb-2 last:mb-0">
          {highlight(p, regex, perTerm, maxPerTerm, maxPerParagraph, `p${idx}`)}
        </p>
      ))}
      {collapsible && (
        <button
          type="button"
          className="text-sm text-blue-400 hover:text-blue-300"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
