// Local check:  npx tsx src/lib/landingCopy.test.ts  (from frontend/)
//
// Guards the public landing page's copy: CTA labels exist and are non-empty,
// the "how it works" / value / focused-learning lists are short and structured
// (no dense paragraphs), and nothing leaks internal/backend wording.
import assert from "node:assert";
import {
  LANDING_NAV_SIGN_IN_LABEL,
  LANDING_NAV_CTA_LABEL,
  LANDING_PRIMARY_CTA_LABEL,
  LANDING_SOURCE_HINT,
  LANDING_SIGN_UP_LINK_LABEL,
  LANDING_AUDIENCE,
  HOW_IT_WORKS_LABEL,
  HOW_IT_WORKS_STEPS,
  VALUE_CARDS,
  FOCUSED_LEARNING_LABEL,
  FOCUSED_LEARNING_POINTS,
  LANDING_PRICING_LABEL,
  LANDING_PRICING_TITLE,
  LANDING_PRICING_BODY,
  LANDING_FAQ_LABEL,
  LANDING_FAQ,
  LANDING_WALKTHROUGH_TITLE,
  LANDING_WALKTHROUGH_BODY,
  LANDING_FOOTER_LINKS,
  PREVIEW_COURSE_TITLE,
  PREVIEW_CHAPTER_DONE,
  PREVIEW_CHAPTER_CURRENT,
  PREVIEW_QUESTION,
  PREVIEW_TAKEAWAY,
  PREVIEW_REVIEW_NOTE,
  PREVIEW_CTA_CAPTION,
} from "./landingCopy";

// --- CTA + nav labels: demo-first (try before signup) --------------------------
assert.strictEqual(LANDING_NAV_SIGN_IN_LABEL, "Sign in");
assert.strictEqual(LANDING_NAV_CTA_LABEL, "Try the demo");
assert.strictEqual(LANDING_PRIMARY_CTA_LABEL, "Try the demo course");
assert.ok(
  /no signup/i.test(LANDING_SOURCE_HINT),
  "hint sells the zero-friction demo",
);
assert.ok(!/^https?:\/\//.test(LANDING_SOURCE_HINT), "hint is not a raw URL");
assert.ok(LANDING_SIGN_UP_LINK_LABEL.length > 0, "a signup path still exists");

// --- Audience: the interview-prep wedge, named concretely ----------------------
assert.ok(
  /backend engineers/i.test(LANDING_AUDIENCE),
  "audience names backend engineers",
);
assert.ok(
  /system design/i.test(LANDING_AUDIENCE),
  "audience names system design prep",
);
assert.ok(
  /Kafka|RabbitMQ|distributed/i.test(LANDING_AUDIENCE),
  "audience names concrete topics",
);

// --- How it works: short, structured steps (no dense paragraphs) -------------
assert.strictEqual(HOW_IT_WORKS_LABEL, "How it works");
assert.ok(
  HOW_IT_WORKS_STEPS.length >= 3 && HOW_IT_WORKS_STEPS.length <= 5,
  "a compact 3-5 step list",
);
for (const step of HOW_IT_WORKS_STEPS) {
  assert.ok(
    step.title.length > 0 && step.title.length <= 60,
    `step title is short: "${step.title}"`,
  );
  assert.ok(
    step.body.length > 0 && step.body.length <= 120,
    `step body is one short sentence: "${step.body}"`,
  );
}

// --- Value cards: exactly heading + one short sentence ------------------------
assert.strictEqual(VALUE_CARDS.length, 3, "exactly 3 value cards");
for (const card of VALUE_CARDS) {
  assert.ok(
    card.title.length > 0 && card.title.length <= 60,
    `value card title is short: "${card.title}"`,
  );
  assert.ok(
    card.body.length > 0 && card.body.length <= 160,
    `value card body is one short sentence: "${card.body}"`,
  );
}

// --- Focused-learning strip: short pills, not paragraphs ----------------------
assert.strictEqual(FOCUSED_LEARNING_LABEL, "Built for focused learning");
assert.ok(
  FOCUSED_LEARNING_POINTS.length >= 3,
  "at least 3 focused-learning points",
);
for (const point of FOCUSED_LEARNING_POINTS) {
  assert.ok(
    point.length > 0 && point.length <= 40,
    `focused-learning point is a short pill: "${point}"`,
  );
}

// --- Credibility: pricing, FAQ, walkthrough, footer/legal ----------------------
assert.strictEqual(LANDING_PRICING_LABEL, "Pricing");
assert.strictEqual(LANDING_PRICING_TITLE, "Free while in beta");
assert.ok(
  LANDING_PRICING_BODY.length > 0 && LANDING_PRICING_BODY.length <= 200,
  "pricing body is short",
);

assert.strictEqual(LANDING_FAQ_LABEL, "FAQ");
assert.ok(LANDING_FAQ.length >= 3 && LANDING_FAQ.length <= 6, "a compact FAQ");
for (const item of LANDING_FAQ) {
  assert.ok(
    item.q.endsWith("?"),
    `FAQ question reads as a question: "${item.q}"`,
  );
  assert.ok(
    item.a.length > 0 && item.a.length <= 220,
    `FAQ answer stays short: "${item.a}"`,
  );
}
assert.ok(
  LANDING_FAQ.some((i) => /demo/i.test(i.a)),
  "FAQ points at the no-signup demo",
);

assert.ok(
  LANDING_WALKTHROUGH_TITLE.length > 0 && LANDING_WALKTHROUGH_BODY.length > 0,
  "walkthrough placeholder copy exists",
);

const footerLabels = LANDING_FOOTER_LINKS.map((l) => l.label);
for (const required of ["Privacy", "Terms", "Contact"]) {
  assert.ok(footerLabels.includes(required), `footer has a ${required} link`);
}
assert.ok(
  LANDING_FOOTER_LINKS.some((l) => l.href === "/privacy"),
  "Privacy links to /privacy",
);
assert.ok(
  LANDING_FOOTER_LINKS.some((l) => l.href === "/terms"),
  "Terms links to /terms",
);

// --- Product preview copy: present, short, no raw URLs ------------------------
for (const text of [
  PREVIEW_COURSE_TITLE,
  PREVIEW_CHAPTER_DONE,
  PREVIEW_CHAPTER_CURRENT,
  PREVIEW_QUESTION,
  PREVIEW_TAKEAWAY,
  PREVIEW_REVIEW_NOTE,
]) {
  assert.ok(text.length > 0, "preview copy is non-empty");
  assert.ok(
    !/^https?:\/\//.test(text),
    `preview copy is not a raw URL: "${text}"`,
  );
}

// --- No internal/backend wording anywhere in landing copy ---------------------
const allLandingCopy = [
  LANDING_NAV_SIGN_IN_LABEL,
  LANDING_NAV_CTA_LABEL,
  LANDING_PRIMARY_CTA_LABEL,
  LANDING_SOURCE_HINT,
  LANDING_SIGN_UP_LINK_LABEL,
  LANDING_AUDIENCE,
  HOW_IT_WORKS_LABEL,
  ...HOW_IT_WORKS_STEPS.flatMap((s) => [s.title, s.body]),
  ...VALUE_CARDS.flatMap((c) => [c.title, c.body]),
  FOCUSED_LEARNING_LABEL,
  ...FOCUSED_LEARNING_POINTS,
  LANDING_PRICING_TITLE,
  LANDING_PRICING_BODY,
  ...LANDING_FAQ.flatMap((i) => [i.q, i.a]),
  LANDING_WALKTHROUGH_TITLE,
  LANDING_WALKTHROUGH_BODY,
  PREVIEW_COURSE_TITLE,
  PREVIEW_CHAPTER_DONE,
  PREVIEW_CHAPTER_CURRENT,
  PREVIEW_QUESTION,
  PREVIEW_TAKEAWAY,
  PREVIEW_REVIEW_NOTE,
  PREVIEW_CTA_CAPTION,
].join(" | ");
for (const bad of [
  "chunk",
  "adaptive AI course",
  "generator dashboard",
  "planner mechanics",
  "record",
  "raw",
]) {
  assert.ok(
    !new RegExp(`\\b${bad}\\b`, "i").test(allLandingCopy),
    `landing copy leaks internal wording: "${bad}"`,
  );
}

console.log("landingCopy.test.ts OK");
