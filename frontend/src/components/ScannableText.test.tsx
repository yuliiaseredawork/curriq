// Render test for the (now-disabled) decorative highlighting.
// Run from the frontend dir:  npx tsx src/components/ScannableText.test.tsx
//
// Asserts learner-facing text renders WITHOUT any <mark> element or highlight
// CSS class even when keyTerms are passed, that the plain source text survives,
// and that real formatting (paragraph breaks) is preserved.
import assert from 'node:assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScannableText } from './ScannableText';

// The amber classes KeyTerm would apply if highlighting were on.
const HIGHLIGHT_CLASSES = ['bg-yellow-400/10', 'text-yellow-200'];

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ScannableText, props));

// Flashcard (front + back) and quiz (question + an inline option), each passed
// keyTerms that previously WOULD have been highlighted.
const flashFront = render({
  text: 'Offsets are tracked per partition and commitSync is used during shutdown.',
  keyTerms: ['offsets', 'partition', 'commitSync'],
  className: 'text-lg font-medium',
});
const flashBack = render({
  text: 'A consumer group coordinates partition assignment.',
  keyTerms: ['consumer group', 'partition assignment'],
});
const quizQuestion = render({
  text: 'Which statement about offsets is correct?',
  keyTerms: ['offsets'],
  className: 'text-xl font-semibold',
});
const quizOption = render({
  text: 'Offsets are stored per partition.',
  keyTerms: ['offsets', 'partition'],
  inline: true,
});

const cases: [string, string][] = [
  ['flashcard front', flashFront],
  ['flashcard back', flashBack],
  ['quiz question', quizQuestion],
  ['quiz option', quizOption],
];

for (const [name, html] of cases) {
  assert.ok(!/<mark[\s>]/i.test(html), `${name}: must contain no <mark> element`);
  for (const cls of HIGHLIGHT_CLASSES) {
    assert.ok(!html.includes(cls), `${name}: must contain no highlight class "${cls}"`);
  }
}

// Plain-text snapshots — the source text renders verbatim, undecorated.
assert.strictEqual(
  flashFront,
  '<div class="text-lg font-medium"><p class="leading-relaxed mb-2 last:mb-0">Offsets are tracked per partition and commitSync is used during shutdown.</p></div>',
);
assert.strictEqual(
  quizOption,
  '<span class="">Offsets are stored per partition.</span>',
);

// Real formatting preserved: blank lines become separate paragraphs.
const multiParagraph = render({ text: 'First paragraph.\n\nSecond paragraph.' });
assert.strictEqual((multiParagraph.match(/<p\b/g) ?? []).length, 2, 'paragraph breaks preserved as separate <p>');

console.log('snapshot — flashcard front:\n ', flashFront);
console.log('snapshot — quiz option:\n ', quizOption);
console.log('\nScannableText.test.tsx OK — no <mark>, no highlight classes, plain text preserved');
