// Local check:  npx tsx backend/src/agents/quiz-writer.test.ts
//
// Pure tests for recall/definition detection and first-question ordering.
import assert from "node:assert";

// The module constructs the Anthropic client at import time; a dummy key lets us
// import it for pure tests without real credentials.
process.env.ANTHROPIC_API_KEY ||= "sk-test-not-used";

(async () => {
  const {
    isRecall,
    leadWithNonRecall,
    shuffleMcqChoices,
    mcqQualityIssues,
    answerPositionStats,
  } = await import("./quiz-writer");

  const q = (id: string, question: string, kind: string): any => ({
    id,
    question,
    question_kind: kind,
  });

  // --- isRecall: definition/trivia detected regardless of the model's label --
  for (const text of [
    "What does 'availability' mean?",
    "Define quorum.",
    "What is meant by partition tolerance?",
    "What is the definition of a consumer group?",
  ]) {
    assert.ok(
      isRecall(q("x", text, "conceptual")),
      `definition is recall: "${text}"`,
    );
  }

  // --- isRecall: genuine conceptual/scenario questions are NOT recall --------
  for (const text of [
    "Why is partition tolerance not part of the trade-off?",
    "What happens when a network partition occurs?",
  ]) {
    assert.ok(!isRecall(q("x", text, "conceptual")), `not recall: "${text}"`);
  }
  // Explicit recall label is always recall.
  assert.ok(isRecall(q("x", "Anything", "recall")));

  // --- leadWithNonRecall: demote a leading definition ------------------------
  const recall = q("r", "What does 'availability' mean?", "recall");
  const conceptual = q(
    "c",
    "Why does CAP force a trade-off under partition?",
    "conceptual",
  );
  const application = q(
    "a",
    "A node is partitioned — what does the system sacrifice?",
    "application",
  );

  assert.deepStrictEqual(
    leadWithNonRecall([recall, conceptual, application]).map((x) => x.id),
    ["c", "r", "a"],
    "leading recall moves behind the first non-recall question; rest stable",
  );

  // Already-good order is unchanged.
  assert.deepStrictEqual(
    leadWithNonRecall([conceptual, recall, application]).map((x) => x.id),
    ["c", "r", "a"],
    "a non-recall first question is left in place",
  );

  // All recall → no-op.
  const r2 = q("r2", "Define quorum.", "recall");
  assert.deepStrictEqual(
    leadWithNonRecall([recall, r2]).map((x) => x.id),
    ["r", "r2"],
    "all-recall set is left unchanged",
  );

  // Empty / single — safe.
  assert.deepStrictEqual(leadWithNonRecall([]), []);
  assert.deepStrictEqual(
    leadWithNonRecall([conceptual]).map((x) => x.id),
    ["c"],
  );

  // --- shuffleMcqChoices: kills answer-position bias, changes nothing else ---
  const mcq = (id: string, answer: string, distractors: string[]): any => ({
    id,
    type: "mcq",
    question: `Q ${id}?`,
    // Model bias under test: the correct answer always listed first.
    choices: [answer, ...distractors],
    answer,
  });
  const biasedQuiz = [
    mcq("m1", "right one", ["wrong a", "wrong b", "wrong c"]),
    mcq("m2", "correct x", ["bad d", "bad e", "bad f"]),
    mcq("m3", "true y", ["off g", "off h", "off i"]),
    mcq("m4", "yes z", ["no j", "no k", "no l"]),
  ];

  // Deterministic with an injected rng; the choice SET and the answer are
  // untouched — only the order changes.
  let seed = 42;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const shuffled = shuffleMcqChoices(biasedQuiz, rng);
  for (let i = 0; i < biasedQuiz.length; i++) {
    assert.deepStrictEqual(
      [...shuffled[i].choices].sort(),
      [...biasedQuiz[i].choices].sort(),
      "shuffle preserves the exact choice set",
    );
    assert.ok(
      shuffled[i].choices.includes(shuffled[i].answer),
      "answer stays among the choices",
    );
  }
  // The all-first bias is actually broken (with this seed, not every answer
  // stays at position 0).
  const stillAllFirst = shuffled.every(
    (q2: any) => q2.choices[0] === q2.answer,
  );
  assert.ok(!stillAllFirst, "shuffle breaks the answer-always-first bias");
  // Non-MCQ questions pass through untouched.
  const short: any = {
    id: "s",
    type: "short",
    question: "Explain X.",
    answer: "because",
  };
  assert.strictEqual(
    shuffleMcqChoices([short], rng)[0],
    short,
    "short answers are untouched",
  );

  // --- answerPositionStats: detects "the answer is always A" ------------------
  const biasedStats = answerPositionStats(biasedQuiz);
  assert.deepStrictEqual(
    biasedStats.counts,
    [4, 0, 0, 0],
    "counts positions correctly",
  );
  assert.strictEqual(biasedStats.biased, true, "all-A distribution is flagged");
  const balanced = [
    { ...mcq("b1", "r1", ["w", "x", "y"]), choices: ["w", "r1", "x", "y"] },
    { ...mcq("b2", "r2", ["w", "x", "y"]), choices: ["w", "x", "r2", "y"] },
    { ...mcq("b3", "r3", ["w", "x", "y"]), choices: ["r3", "w", "x", "y"] },
    { ...mcq("b4", "r4", ["w", "x", "y"]), choices: ["w", "x", "y", "r4"] },
  ];
  assert.strictEqual(
    answerPositionStats(balanced).biased,
    false,
    "a spread distribution passes",
  );
  assert.strictEqual(
    answerPositionStats([short]).total,
    0,
    "short answers are ignored",
  );

  // --- mcqQualityIssues: length tells, filler, duplicates ---------------------
  // The classic giveaway: the correct answer is much longer than the rest.
  const longAnswer: any = {
    id: "l",
    type: "mcq",
    question: "Q?",
    choices: [
      "short a",
      "short b",
      "the correct answer, which is much longer and more detailed than every distractor around it",
      "short c",
    ],
    answer:
      "the correct answer, which is much longer and more detailed than every distractor around it",
  };
  assert.ok(
    mcqQualityIssues(longAnswer).some((i: string) => /much longer/.test(i)),
    "flags a correct answer that stands out by length",
  );

  const filler: any = {
    id: "f",
    type: "mcq",
    question: "Q?",
    choices: [
      "a real option here",
      "another real one",
      "None of the above",
      "ok",
    ],
    answer: "a real option here",
  };
  const fillerIssues = mcqQualityIssues(filler);
  assert.ok(
    fillerIssues.some((i: string) => /filler option/.test(i)),
    'flags "None of the above"',
  );
  assert.ok(
    fillerIssues.some((i: string) => /near-empty option/.test(i)),
    "flags a near-empty option",
  );

  const dupes: any = {
    id: "d",
    type: "mcq",
    question: "Q?",
    choices: ["same thing", "Same thing", "different a", "different b"],
    answer: "different a",
  };
  assert.ok(
    mcqQualityIssues(dupes).some((i: string) => /duplicate options/.test(i)),
    "flags duplicate options",
  );

  // A well-formed MCQ with parity-length options passes clean.
  const clean: any = {
    id: "ok",
    type: "mcq",
    question: "Q?",
    choices: [
      "consumers rebalance partitions",
      "brokers re-elect a controller",
      "producers switch to batching",
      "offsets reset to the earliest",
    ],
    answer: "consumers rebalance partitions",
  };
  assert.deepStrictEqual(
    mcqQualityIssues(clean),
    [],
    "a balanced MCQ has no soft issues",
  );
  assert.deepStrictEqual(
    mcqQualityIssues(short),
    [],
    "short answers are skipped",
  );

  console.log("quiz-writer.test.ts OK");
})();
