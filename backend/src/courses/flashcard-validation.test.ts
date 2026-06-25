// Local check:  npx tsx backend/src/courses/flashcard-validation.test.ts
import assert from 'node:assert';
import { validateFlashcardAnswer } from './flashcard-validation';

// --- valid answers ---------------------------------------------------------
// Well-formed prose, including commas, balanced parens and an "(e.g., …)" clause
// (the exact shape of the card that was rendering corrupted in the UI).
assert.ok(
  validateFlashcardAnswer(
    'Two separate groups each maintain independent offsets and every group reads ALL partitions autonomously — useful for independent use-cases (e.g., processing + auditing). One group with two consumers splits the partitions between them.',
  ).valid,
  'well-formed answer with (e.g., …) is valid',
);
assert.ok(validateFlashcardAnswer('A consumer group coordinates partition assignment.').valid);
assert.ok(validateFlashcardAnswer('Nested (parens (work) too) and end here.').valid, 'balanced nested parens valid');
assert.ok(validateFlashcardAnswer('  trims surrounding whitespace.  ').valid, 'trims before checking');

// --- invalid: empty --------------------------------------------------------
assert.strictEqual(validateFlashcardAnswer('').valid, false);
assert.strictEqual(validateFlashcardAnswer('   ').reason, 'empty');
assert.strictEqual(validateFlashcardAnswer(null).reason, 'empty');
assert.strictEqual(validateFlashcardAnswer(undefined).reason, 'empty');

// --- invalid: leading punctuation (the reported symptom) -------------------
assert.strictEqual(
  validateFlashcardAnswer(', processing + auditing)').reason,
  'leading punctuation',
  'dropped-head answer is rejected',
);
for (const c of [', x', '. x', '; x', ': x', ') x']) {
  assert.strictEqual(validateFlashcardAnswer(c).valid, false, `leading "${c[0]}" rejected`);
}

// --- invalid: terminal dangling separator ----------------------------------
for (const c of ['cut off here,', 'cut off here;', 'cut off here:', 'opens but never (']) {
  assert.strictEqual(validateFlashcardAnswer(c).valid, false, `terminal "${c.slice(-1)}" rejected`);
}
// A normal terminal period / ? / ! / ) is fine.
assert.ok(validateFlashcardAnswer('Ends normally.').valid);
assert.ok(validateFlashcardAnswer('Is it though?').valid);
assert.ok(validateFlashcardAnswer('A closing clause (like this).').valid);

// --- invalid: unbalanced parentheses ---------------------------------------
assert.strictEqual(validateFlashcardAnswer('text with orphan close) here.').reason, 'unbalanced parentheses');
assert.strictEqual(validateFlashcardAnswer('text with unclosed (open here.').reason, 'unbalanced parentheses');

console.log('flashcard-validation.test.ts OK');
