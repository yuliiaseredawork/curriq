// Render + wiring test for the spaced-repetition rating control.
// Run from the frontend dir:  npx tsx src/components/RatingButtons.test.tsx
//
// Guards that Again / Hard / Good / Easy stay present, in order, and that each
// button is wired to call onRate with its rating key.
import assert from 'node:assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RatingButtons, RATINGS } from './RatingButtons';

// --- present in the rendered markup -----------------------------------------
const html = renderToStaticMarkup(createElement(RatingButtons, { onRate: () => {} }));
for (const label of ['Again', 'Hard', 'Good', 'Easy']) {
  assert.ok(html.includes(`>${label}</button>`), `rating "${label}" renders as a button`);
}
assert.strictEqual((html.match(/<button/g) ?? []).length, 4, 'exactly four rating buttons');

// --- wired: each button's onClick calls onRate with its key, in order -------
const calls: string[] = [];
const tree: any = RatingButtons({ onRate: (k: string) => calls.push(k) });
const buttons: any[] = tree.props.children;
assert.deepStrictEqual(
  buttons.map((b) => b.props.children),
  ['Again', 'Hard', 'Good', 'Easy'],
  'labels render in the canonical order',
);
buttons.forEach((b) => b.props.onClick());
assert.deepStrictEqual(calls, ['AGAIN', 'HARD', 'GOOD', 'EASY'], 'each button fires onRate with its key');

// --- disabled (busy) state respected ----------------------------------------
const disabledHtml = renderToStaticMarkup(
  createElement(RatingButtons, { onRate: () => {}, disabled: true }),
);
assert.strictEqual(
  (disabledHtml.match(/disabled=""/g) ?? []).length,
  4,
  'all four controls disable while a rating is in flight',
);

// --- the control carries no internal jargon ---------------------------------
for (const tok of ['COMPARISON', 'Overdue', 'NOT_STARTED']) {
  assert.ok(!html.includes(tok), `rating control leaks "${tok}"`);
}
// Keys stay as the internal action enum (unchanged in code/telemetry).
assert.deepStrictEqual(RATINGS.map((r) => r.key), ['AGAIN', 'HARD', 'GOOD', 'EASY']);

console.log('RatingButtons.test.tsx OK');
