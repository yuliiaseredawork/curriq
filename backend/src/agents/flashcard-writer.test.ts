// Local check:  npx tsx backend/src/agents/flashcard-writer.test.ts
//
// Pure tests for the flashcard writer: prompt guardrails (atomicity, short
// front, concise structured back, interview-prep guidance, good/bad examples)
// and the soft quality helper. No network/LLM call.
import assert from 'node:assert';

// The module constructs the Anthropic client at import time; a dummy key lets us
// import it for pure tests without real credentials.
process.env.ANTHROPIC_API_KEY ||= 'sk-test-not-used';

(async () => {
  const { buildPrompt, SYSTEM, flashcardQualityIssues, flashcardCorrectiveFeedback } = await import(
    './flashcard-writer'
  );

  // --- buildPrompt encodes the quality bar ----------------------------------
  const prompt = buildPrompt({
    concept: 'System design interview pacing',
    chunks: [{ id: 1, video_id: 'vid-1', text: 'Cap requirements gathering at ~5 minutes.' }],
    count: 4,
  });
  const mustContain: [string, RegExp][] = [
    ['atomicity', /tests ONE thing/i],
    ['10–20 second answer', /10[–-]20 seconds/],
    ['short concrete front', /Short, concrete/i],
    ['banned vague fronts', /What is the likely\s*\n?\s*consequence\?/i],
    ['structured concise back', /Concise and STRUCTURED/i],
    ['Answer/Why/Watch out labels', /Why it matters:/],
    ['watch out label', /Watch out:/],
    ['interview-prep guidance', /interview prep/i],
    ['good example', /GOOD front:/],
    ['bad example', /BAD front:/],
    ['source quote not in back', /Put any verbatim source.*sourceQuote/is],
  ];
  for (const [name, re] of mustContain) {
    assert.ok(re.test(prompt), `buildPrompt must encode: ${name}`);
  }
  // SYSTEM frames atomic, fast, structured cards.
  assert.ok(/ATOMIC/.test(SYSTEM) && /spaced repetition/i.test(SYSTEM), 'SYSTEM frames atomic SR cards');
  // The count + chunk grounding are embedded.
  assert.ok(prompt.includes('Cap requirements gathering at ~5 minutes.'), 'chunk text embedded');
  assert.ok(/Write 4 active-recall flashcards/.test(prompt), 'count embedded in the task');

  // --- quality helper: flags a vague front ----------------------------------
  const vague = flashcardQualityIssues({
    type: 'scenario',
    front: 'What is the likely consequence?',
    back: 'Answer: You run out of time for the actual design.',
  });
  assert.ok(vague.some((i) => /vague front/.test(i)), 'flags a vague front');

  for (const f of ['Explain consumer groups.', 'Describe partitioning.', 'What should you know about CAP?']) {
    assert.ok(
      flashcardQualityIssues({ type: 'definition', front: f, back: 'Answer: ok.' }).some((i) =>
        /vague front/.test(i),
      ),
      `flags vague front: "${f}"`,
    );
  }

  // --- quality helper: overlong front / back --------------------------------
  assert.ok(
    flashcardQualityIssues({
      type: 'scenario',
      front: `What should you do next ${'x'.repeat(220)}?`,
      back: 'Answer: move on.',
    }).some((i) => /front too long/.test(i)),
    'flags an overlong front',
  );
  assert.ok(
    flashcardQualityIssues({
      type: 'scenario',
      front: 'What should you do next?',
      back: 'x'.repeat(400),
    }).some((i) => /back too long/.test(i)),
    'flags an overlong back',
  );

  // --- quality helper: two questions in one card ----------------------------
  assert.ok(
    flashcardQualityIssues({
      type: 'scenario',
      front: 'What should you do next? And why does it matter?',
      back: 'Answer: move on.',
    }).some((i) => /more than one question/.test(i)),
    'flags two questions crammed into one front',
  );

  // --- quality helper: source quote dominating the answer -------------------
  const quote = 'Requirements should be capped at five minutes in a system design interview.';
  assert.ok(
    flashcardQualityIssues({
      type: 'scenario',
      front: 'What should you do next?',
      back: quote,
      sourceQuote: quote,
    }).some((i) => /source quote dominates/.test(i)),
    'flags a back that is just the source quote',
  );

  // --- quality helper: leaked cloze placeholders ----------------------------
  assert.ok(
    flashcardQualityIssues({
      type: 'scenario',
      front: 'What should you do next?',
      back: 'Answer: move on to {{blank}}.',
    }).some((i) => /\{\{blank\}\} placeholder leaked into the back/.test(i)),
    'flags a {{blank}} that leaked into the back',
  );
  assert.ok(
    flashcardQualityIssues({
      type: 'definition',
      front: 'Kafka uses {{blank}} offsets.',
      back: 'Answer: per-partition.',
    }).some((i) => /non-cloze front/.test(i)),
    'flags a {{blank}} in a non-cloze front',
  );
  // A legitimate cloze front (blank in the front) is NOT flagged for that.
  assert.ok(
    !flashcardQualityIssues({
      type: 'cloze',
      front: 'Kafka tracks {{blank}} offsets per partition.',
      back: 'consumer',
    }).some((i) => /\{\{blank\}\}/.test(i)),
    'a real cloze front keeps its blank',
  );

  // --- quality helper: a good scenario card has no issues -------------------
  const good = flashcardQualityIssues({
    type: 'scenario',
    front:
      "You're 10 minutes into a 45-minute system design interview and still refining requirements. What should you do next?",
    back:
      'Answer: Move on to the design — cap requirements at about five minutes.\nWhy it matters: It leaves time for architecture, scaling, and trade-offs.\nWatch out: Being thorough is not the same as showing design depth.',
  });
  assert.deepStrictEqual(good, [], 'a strong, atomic scenario card has no soft issues');

  // --- correctiveFeedback names the issues + the fix guidance ---------------
  const fb = flashcardCorrectiveFeedback(['card 1: vague front: "What is the likely consequence?"']);
  assert.ok(fb.includes('What is the likely consequence?'), 'echoes the concrete issue');
  assert.ok(/Answer \/ Why\s*\n?\s*it matters \/ Watch out|Answer.*Watch out/is.test(fb), 'guides structured backs');
  assert.ok(/sourceQuote/.test(fb), 'guides moving quotes into sourceQuote');

  console.log('flashcard-writer.test.ts OK');
})();
