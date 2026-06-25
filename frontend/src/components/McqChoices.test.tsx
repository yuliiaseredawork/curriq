// Render + wiring test for the single MCQ renderer.
// Run from the frontend dir:  npx tsx src/components/McqChoices.test.tsx
import assert from 'node:assert';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { McqChoices } from './McqChoices';

const choices = ['Offsets are per partition', 'Offsets are global', 'Offsets are random'];

// --- renders one button per choice ------------------------------------------
const html = renderToStaticMarkup(
  createElement(McqChoices, { choices, selected: '', onSelect: () => {} }),
);
assert.strictEqual((html.match(/<button/g) ?? []).length, 3, 'one button per choice');
for (const c of choices) assert.ok(html.includes(c), `renders choice "${c}"`);

// --- selected choice is highlighted -----------------------------------------
const selectedHtml = renderToStaticMarkup(
  createElement(McqChoices, { choices, selected: choices[1], onSelect: () => {} }),
);
assert.strictEqual(
  (selectedHtml.match(/border-blue-500/g) ?? []).length,
  1,
  'exactly the selected choice gets the selected style',
);

// --- wired: each button calls onSelect with its choice -----------------------
const picked: string[] = [];
const tree: any = McqChoices({ choices, selected: '', onSelect: (c: string) => picked.push(c) });
const buttons: any[] = tree.props.children;
buttons.forEach((b) => b.props.onClick());
assert.deepStrictEqual(picked, choices, 'each choice fires onSelect with its value');

// --- disabled state ----------------------------------------------------------
const disabledHtml = renderToStaticMarkup(
  createElement(McqChoices, { choices, selected: '', onSelect: () => {}, disabled: true }),
);
assert.strictEqual((disabledHtml.match(/disabled=""/g) ?? []).length, 3, 'all choices disable');

console.log('McqChoices.test.tsx OK');
