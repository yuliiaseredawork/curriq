// Defensive guard for flashcard answers. A well-formed answer is non-empty,
// doesn't begin with stray punctuation, doesn't end with a dangling separator,
// and has balanced parentheses. Used to detect (and avoid presenting) answers
// whose text was truncated/corrupted — independent of where the corruption came
// from. Pure; no I/O.

export type AnswerCheck = { valid: boolean; reason?: string };

export function validateFlashcardAnswer(text: string | null | undefined): AnswerCheck {
  const t = (text ?? '').trim();

  if (!t) return { valid: false, reason: 'empty' };

  // Leading stray punctuation signals a dropped head (e.g. ", processing…").
  if (/^[,.;:)]/.test(t)) return { valid: false, reason: 'leading punctuation' };

  // Dangling separators/openers at the end signal a cut tail. A terminal
  // sentence mark (. ! ?) or closing paren is fine.
  if (/[,;:(]$/.test(t)) return { valid: false, reason: 'terminal punctuation' };

  // Unbalanced parentheses signal a chopped clause (orphan ")" or unclosed "(").
  let depth = 0;
  for (const ch of t) {
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return { valid: false, reason: 'unbalanced parentheses' };
    }
  }
  if (depth !== 0) return { valid: false, reason: 'unbalanced parentheses' };

  return { valid: true };
}
