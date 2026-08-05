// Render + wiring test for the single MCQ renderer.
// Run from the frontend dir:  npx tsx src/components/McqChoices.test.tsx
import assert from "node:assert";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { McqChoices, NOT_SURE_CHOICE } from "./McqChoices";

const choices = [
  "Offsets are per partition",
  "Offsets are global",
  "Offsets are random",
];

// --- renders one button per choice ------------------------------------------
const html = renderToStaticMarkup(
  createElement(McqChoices, { choices, selected: "", onSelect: () => {} }),
);
assert.strictEqual(
  (html.match(/<button/g) ?? []).length,
  3,
  "one button per choice",
);
for (const c of choices) assert.ok(html.includes(c), `renders choice "${c}"`);

// --- selected choice is highlighted -----------------------------------------
const selectedHtml = renderToStaticMarkup(
  createElement(McqChoices, {
    choices,
    selected: choices[1],
    onSelect: () => {},
  }),
);
assert.strictEqual(
  (selectedHtml.match(/border-blue-500/g) ?? []).length,
  1,
  "exactly the selected choice gets the selected style",
);

// --- wired: each button calls onSelect with its choice -----------------------
const picked: string[] = [];
const tree: any = McqChoices({
  choices,
  selected: "",
  onSelect: (c: string) => picked.push(c),
});
// children = [mapped choice buttons, optional not-sure button] — flatten and
// keep only real elements so the wiring test survives the conditional child.
const buttons: any[] = [tree.props.children]
  .flat(2)
  .filter((b) => b && b.props);
buttons.forEach((b) => b.props.onClick());
assert.deepStrictEqual(
  picked,
  choices,
  "each choice fires onSelect with its value",
);

// --- disabled state ----------------------------------------------------------
const disabledHtml = renderToStaticMarkup(
  createElement(McqChoices, {
    choices,
    selected: "",
    onSelect: () => {},
    disabled: true,
  }),
);
assert.strictEqual(
  (disabledHtml.match(/disabled=""/g) ?? []).length,
  3,
  "all choices disable",
);

// --- "I'm not sure": opt-in honest-uncertainty option ------------------------
// Off by default (no fifth option unless asked for).
const plainHtml = renderToStaticMarkup(
  createElement(McqChoices, { choices, selected: "", onSelect: () => {} }),
);
assert.ok(!plainHtml.includes(NOT_SURE_CHOICE), "not-sure option is opt-in");

const notSureHtml = renderToStaticMarkup(
  createElement(McqChoices, {
    choices,
    selected: "",
    onSelect: () => {},
    allowNotSure: true,
  }),
);
assert.ok(
  notSureHtml.includes(NOT_SURE_CHOICE),
  "allowNotSure renders the option",
);
assert.strictEqual(
  (notSureHtml.match(/<button/g) ?? []).length,
  4,
  "not-sure renders as one extra button",
);

// Clicking it selects the sentinel value (graded as incorrect — it can never
// match the correct choice).
const notSurePicked: string[] = [];
const notSureTree: any = McqChoices({
  choices,
  selected: "",
  onSelect: (c: string) => notSurePicked.push(c),
  allowNotSure: true,
});
const allButtons: any[] = [notSureTree.props.children]
  .flat(2)
  .filter((b) => b && b.props);
allButtons[allButtons.length - 1].props.onClick();
assert.deepStrictEqual(
  notSurePicked,
  [NOT_SURE_CHOICE],
  "not-sure submits the sentinel choice",
);
assert.ok(
  !choices.includes(NOT_SURE_CHOICE),
  "the sentinel never collides with a real choice",
);

// Selected styling applies to the not-sure option too.
const notSureSelectedHtml = renderToStaticMarkup(
  createElement(McqChoices, {
    choices,
    selected: NOT_SURE_CHOICE,
    onSelect: () => {},
    allowNotSure: true,
  }),
);
assert.ok(
  /border-blue-500/.test(notSureSelectedHtml),
  "selected not-sure is highlighted",
);

console.log("McqChoices.test.tsx OK");
