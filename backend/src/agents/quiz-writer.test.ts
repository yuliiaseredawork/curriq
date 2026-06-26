// Local check:  npx tsx backend/src/agents/quiz-writer.test.ts
//
// Pure tests for recall/definition detection and first-question ordering.
import assert from 'node:assert';

// The module constructs the Anthropic client at import time; a dummy key lets us
// import it for pure tests without real credentials.
process.env.ANTHROPIC_API_KEY ||= 'sk-test-not-used';

(async () => {
  const { isRecall, leadWithNonRecall } = await import('./quiz-writer');

  const q = (id: string, question: string, kind: string): any => ({
    id,
    question,
    question_kind: kind,
  });

  // --- isRecall: definition/trivia detected regardless of the model's label --
  for (const text of [
    "What does 'availability' mean?",
    'Define quorum.',
    'What is meant by partition tolerance?',
    'What is the definition of a consumer group?',
  ]) {
    assert.ok(isRecall(q('x', text, 'conceptual')), `definition is recall: "${text}"`);
  }

  // --- isRecall: genuine conceptual/scenario questions are NOT recall --------
  for (const text of [
    'Why is partition tolerance not part of the trade-off?',
    'What happens when a network partition occurs?',
  ]) {
    assert.ok(!isRecall(q('x', text, 'conceptual')), `not recall: "${text}"`);
  }
  // Explicit recall label is always recall.
  assert.ok(isRecall(q('x', 'Anything', 'recall')));

  // --- leadWithNonRecall: demote a leading definition ------------------------
  const recall = q('r', "What does 'availability' mean?", 'recall');
  const conceptual = q('c', 'Why does CAP force a trade-off under partition?', 'conceptual');
  const application = q('a', 'A node is partitioned — what does the system sacrifice?', 'application');

  assert.deepStrictEqual(
    leadWithNonRecall([recall, conceptual, application]).map((x) => x.id),
    ['c', 'r', 'a'],
    'leading recall moves behind the first non-recall question; rest stable',
  );

  // Already-good order is unchanged.
  assert.deepStrictEqual(
    leadWithNonRecall([conceptual, recall, application]).map((x) => x.id),
    ['c', 'r', 'a'],
    'a non-recall first question is left in place',
  );

  // All recall → no-op.
  const r2 = q('r2', 'Define quorum.', 'recall');
  assert.deepStrictEqual(
    leadWithNonRecall([recall, r2]).map((x) => x.id),
    ['r', 'r2'],
    'all-recall set is left unchanged',
  );

  // Empty / single — safe.
  assert.deepStrictEqual(leadWithNonRecall([]), []);
  assert.deepStrictEqual(leadWithNonRecall([conceptual]).map((x) => x.id), ['c']);

  console.log('quiz-writer.test.ts OK');
})();
