// Local check:  npx tsx src/lib/demoCourses.test.ts  (from frontend/)
//
// The demo content is the product's first impression — hold it to the same
// quality bar the quiz generator enforces: real MCQs (answer among choices,
// varied answer positions, option length parity), a structured flashcard, and
// a legally-safe catalog (attribution links only, no scraped content).
import assert from "node:assert";
import {
  DEMO_COURSE,
  DEMO_RATING_INTERVALS,
  PREBUILT_CATALOG,
  PREBUILT_CATALOG_LABEL,
} from "./demoCourses";

// --- playable course shape -----------------------------------------------------
assert.ok(DEMO_COURSE.title.length > 0);
assert.ok(
  DEMO_COURSE.chapters.length >= 2,
  "shows a real learning path (2+ chapters)",
);
for (const ch of DEMO_COURSE.chapters) {
  assert.ok(ch.objectives.length >= 2, `chapter has objectives: ${ch.title}`);
}
assert.ok(DEMO_COURSE.questions.length >= 3, "at least 3 practice questions");

// --- MCQ quality: same bar as the generator ------------------------------------
const positions: number[] = [];
for (const q of DEMO_COURSE.questions) {
  assert.strictEqual(q.choices.length, 4, `4 choices: ${q.id}`);
  assert.ok(
    q.choices.includes(q.answer),
    `answer is among the choices: ${q.id}`,
  );
  assert.strictEqual(
    new Set(q.choices).size,
    4,
    `choices are distinct: ${q.id}`,
  );
  positions.push(q.choices.indexOf(q.answer));

  // Length parity: the correct answer must not stand out by length.
  const distractorLens = q.choices
    .filter((c) => c !== q.answer)
    .map((c) => c.length);
  const meanDistractor =
    distractorLens.reduce((a, b) => a + b, 0) / distractorLens.length;
  assert.ok(
    q.answer.length <= meanDistractor * 1.6,
    `answer length doesn't give it away: ${q.id}`,
  );

  assert.ok(q.explanation.length > 0, `has an explanation: ${q.id}`);
  assert.ok(q.mixUp.length > 0, `names the mix-up for the summary: ${q.id}`);
}
// The correct answer is not always in the same slot (and never all-A).
assert.ok(
  new Set(positions).size > 1,
  "answer positions vary across questions",
);
assert.ok(
  !positions.every((p) => p === 0),
  "the answer is not always option A",
);

// The flagship differentiator line exists (mistake-biased remediation).
assert.ok(
  DEMO_COURSE.questions.some((q) =>
    /persistence with reliability/.test(q.mixUp),
  ),
  'includes the "conflated persistence with reliability" mix-up',
);

// --- flashcard: structured back + illustrative schedule -------------------------
assert.ok(
  /Answer:/.test(DEMO_COURSE.flashcard.back),
  "flashcard back is structured",
);
assert.ok(
  /Watch out:/.test(DEMO_COURSE.flashcard.back),
  "flashcard names the trap",
);
for (const rating of ["AGAIN", "HARD", "GOOD", "EASY"]) {
  assert.ok(rating in DEMO_RATING_INTERVALS, `demo schedule covers ${rating}`);
}

// --- catalog: metadata + attribution only ---------------------------------------
assert.ok(PREBUILT_CATALOG_LABEL.length > 0);
assert.ok(
  PREBUILT_CATALOG.length >= 5 && PREBUILT_CATALOG.length <= 10,
  "5-10 prebuilt entries",
);
for (const c of PREBUILT_CATALOG) {
  assert.ok(
    c.title.length > 0 && c.creator.length > 0,
    `attribution present: ${c.title}`,
  );
  assert.ok(
    /^https:\/\//.test(c.creatorUrl),
    `attribution is a link: ${c.title}`,
  );
  assert.ok(c.objectives.length >= 2, `objectives present: ${c.title}`);
}

// --- no internal wording anywhere in demo copy ----------------------------------
const allDemoCopy = JSON.stringify({ DEMO_COURSE, PREBUILT_CATALOG });
for (const bad of ["chunk", "INTERNAL", "generator dashboard"]) {
  assert.ok(
    !new RegExp(`\\b${bad}\\b`, "i").test(allDemoCopy),
    `demo copy leaks "${bad}"`,
  );
}

console.log("demoCourses.test.ts OK");
