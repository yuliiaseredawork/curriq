// Local check:  npx tsx backend/src/agents/outliner.test.ts
//
// Pure tests for the outliner: prompt guardrails, soft quality detection, and
// the (shape-compatible) schema bounds. No network/LLM call.
import assert from 'node:assert';

// The module constructs the Anthropic client at import time; a dummy key lets us
// import it for pure tests without real credentials.
process.env.ANTHROPIC_API_KEY ||= 'sk-test-not-used';

(async () => {
  const { buildPrompt, outlineQualityIssues, correctiveFeedback, OutlineSchema } = await import(
    './outliner'
  );

  // Helper: run the quality detector on a single chapter title (clean summary +
  // objectives so only the title can trigger an issue).
  const titleHasGenericIssue = (title: string): boolean =>
    outlineQualityIssues({
      title: 'Course',
      chapters: [
        {
          id: 'c1',
          title,
          summary: 'Coordinate consumers so partitions stay balanced across instances in the group.',
          learning_objectives: ['Explain how partitions are assigned', 'Configure rebalancing safely'],
          source_video_ids: ['v1'],
        },
      ],
    } as any).some((i) => /generic chapter title/.test(i));

  // --- buildPrompt includes the key guardrails ------------------------------
  const prompt = buildPrompt([{ id: 1, video_id: 'vid-1', text: 'Kafka consumer groups and rebalancing.' }]);
  const mustContain: [string, RegExp][] = [
    ['source-specific titles', /Specific to the source/i],
    ['banned generic titles', /Introduction, Overview, Basics/],
    ['prefer fewer, deeper', /Prefer 4-6 substantial chapters\. Never more than 8/],
    ['prerequisite ordering', /prerequisite progression/i],
    ['observable objectives', /observable verb/i],
    ['anti "This chapter covers/introduces"', /This chapter introduces\/covers\/explains\/discusses/],
    ['content-type adaptation', /interview prep/i],
    ['grounding requirement', /supported by the chunks/i],
  ];
  for (const [name, re] of mustContain) {
    assert.ok(re.test(prompt), `buildPrompt must encode: ${name}`);
  }
  // The chunk text + id are embedded for grounding.
  assert.ok(prompt.includes('Kafka consumer groups and rebalancing.'), 'chunk text embedded');
  assert.ok(prompt.includes('video_id="vid-1"'), 'chunk video_id embedded');

  // --- outlineQualityIssues: flags soft issues ------------------------------
  const flagged: any = {
    title: 'Course',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Introduction',
        summary: 'This chapter introduces the topic broadly for the reader before later detail.',
        learning_objectives: ['Understand the basics of Kafka thoroughly', 'Know about brokers'],
        source_video_ids: ['v1'],
      },
    ],
  };
  const issues = outlineQualityIssues(flagged);
  assert.ok(issues.some((i) => /generic chapter title/.test(i)), 'flags a generic title');
  assert.ok(issues.some((i) => /meta summary/.test(i)), 'flags a "This chapter introduces…" summary');
  assert.ok(issues.some((i) => /vague objective/.test(i)), 'flags a vague objective');

  // --- stricter generic-title detection: prefix templates + bare words ------
  for (const t of [
    'Introduction to CAP Theorem',
    'Overview of Consensus',
    'Basics of Sharding',
    'Fundamentals of Distributed Systems',
    'Getting Started with Kafka',
    'Introduction',
  ]) {
    assert.ok(titleHasGenericIssue(t), `flags generic title: "${t}"`);
  }
  for (const t of [
    'Introducing Backpressure in Streams',
    'Partition Tolerance and the CAP Trade-off',
    'Consumer Groups and Partition Rebalancing',
  ]) {
    assert.ok(!titleHasGenericIssue(t), `does not flag specific title: "${t}"`);
  }

  // --- correctiveFeedback names the concrete issues + the fix guidance ------
  const feedback = correctiveFeedback(['generic chapter title: "Introduction to CAP Theorem"']);
  assert.ok(feedback.includes('Introduction to CAP Theorem'), 'echoes the concrete issue');
  assert.ok(/Introduction to X/.test(feedback), 'guides replacing "Introduction to X" titles');
  assert.ok(/observable/i.test(feedback), 'guides observable objectives');

  // --- outlineQualityIssues: clean, source-specific outline → no issues -----
  const clean: any = {
    title: 'Kafka Consumer Internals',
    chapters: [
      {
        id: 'chapter-1',
        title: 'Consumer Groups and Partition Rebalancing',
        summary:
          'Coordinate multiple consumers so partitions are balanced and no message is processed twice within a group.',
        learning_objectives: [
          'Explain how a consumer group splits partitions',
          'Configure a group to rebalance across instances',
        ],
        source_video_ids: ['v1'],
      },
    ],
  };
  assert.deepStrictEqual(outlineQualityIssues(clean), [], 'clean outline has no soft issues');

  // --- OutlineSchema accepts a good outline ---------------------------------
  assert.ok(OutlineSchema.safeParse(clean).success, 'schema accepts a good outline');

  // --- OutlineSchema rejects (shape unchanged, bounds tightened) ------------
  const tooManyChapters = {
    title: 'X',
    chapters: Array.from({ length: 9 }, (_, i) => ({
      id: `chapter-${i}`,
      title: `Specific Topic ${i}`,
      summary: 'A meaningful, source-grounded summary describing what the learner can do next.',
      learning_objectives: ['Explain the first idea clearly', 'Apply the second idea in practice'],
      source_video_ids: ['v1'],
    })),
  };
  assert.ok(!OutlineSchema.safeParse(tooManyChapters).success, 'rejects > 8 chapters');

  const emptyObjective = {
    ...clean,
    chapters: [{ ...clean.chapters[0], learning_objectives: ['', 'Explain something specific here'] }],
  };
  assert.ok(!OutlineSchema.safeParse(emptyObjective).success, 'rejects an empty objective');

  const longObjective = {
    ...clean,
    chapters: [
      { ...clean.chapters[0], learning_objectives: ['Explain something useful', 'x'.repeat(200)] },
    ],
  };
  assert.ok(!OutlineSchema.safeParse(longObjective).success, 'rejects an extremely long objective');

  console.log('outliner.test.ts OK');
})();
