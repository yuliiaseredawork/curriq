// Local check:  npx tsx src/lib/learnerCopy.test.ts  (from frontend/)
import assert from 'node:assert';
import {
  learningProgressView,
  chapterStatusLabel,
  sessionProgressLabel,
  CHAPTER_STATUS_LABELS,
} from './learnerCopy';

// --- New course: inviting, no naked 0% and no four-metric line --------------
const fresh = learningProgressView({ pct: 0, answered: 0 });
assert.strictEqual(fresh.started, false);
assert.strictEqual(fresh.pct, 0);
assert.match(fresh.status, /Not started yet/);
assert.ok(!fresh.headline.includes('0%'), 'new course does not show a naked 0%');

// --- In progress ------------------------------------------------------------
const mid = learningProgressView({ pct: 12, answered: 3 });
assert.strictEqual(mid.headline, '12%');
assert.strictEqual(mid.status, 'In progress');

// Started via answered questions even when pct rounds to 0.
const byAnswers = learningProgressView({ pct: 0, answered: 2 });
assert.strictEqual(byAnswers.started, true);
assert.strictEqual(byAnswers.status, 'In progress');

// --- Complete ---------------------------------------------------------------
assert.strictEqual(learningProgressView({ pct: 100, answered: 40 }).status, 'Course complete');

// --- Clamp / guards ---------------------------------------------------------
assert.strictEqual(learningProgressView({ pct: 150 }).pct, 100);
assert.strictEqual(learningProgressView({ pct: -5, answered: 0 }).started, false);
assert.strictEqual(learningProgressView({}).started, false);

// --- Chapter enum → plain language + non-color (shape glyph) indicator -------
const ns = chapterStatusLabel('NOT_STARTED');
assert.strictEqual(ns.text, 'Not started yet');
assert.ok(ns.icon.length > 0, 'status carries a non-color shape glyph');
assert.ok(!ns.text.includes('NOT_STARTED'));
assert.strictEqual(chapterStatusLabel('IN_PROGRESS').text, 'In progress');
assert.strictEqual(chapterStatusLabel('COMPLETED').text, 'Completed');
// Unknown/empty falls back invitingly (never blank, never a raw enum).
assert.strictEqual(chapterStatusLabel(undefined).text, 'Not started yet');
assert.strictEqual(chapterStatusLabel('WEIRD').text, 'Not started yet');
// Every mapped status has both a text label and an icon (a11y: not color-only).
for (const [, v] of Object.entries(CHAPTER_STATUS_LABELS)) {
  assert.ok(v.text.length > 0 && v.icon.length > 0);
}

// --- Neutral session progress -----------------------------------------------
assert.strictEqual(sessionProgressLabel(0, 20), '1 of 20');
assert.strictEqual(sessionProgressLabel(19, 20), '20 of 20');

// --- No internal vocabulary leaks across any produced copy ------------------
const FORBIDDEN = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'COMPARISON',
  'Overdue flashcard',
  'Mastery',
  'Quizzes',
  'Retention',
  'Reviews',
];
const allCopy = [
  fresh.headline,
  fresh.status,
  mid.headline,
  mid.status,
  ...Object.values(CHAPTER_STATUS_LABELS).map((v) => v.text),
  sessionProgressLabel(0, 20),
].join(' | ');
for (const tok of FORBIDDEN) {
  assert.ok(!allCopy.includes(tok), `learner copy leaks "${tok}"`);
}

console.log('learnerCopy.test.ts OK');
