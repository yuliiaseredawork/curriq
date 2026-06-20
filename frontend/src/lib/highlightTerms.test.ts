// Local verification for the highlight term extractor.
// Run from the frontend dir:  npx tsx src/lib/highlightTerms.test.ts
import assert from 'node:assert';
import { extractKeyTerms, titleTerms } from './highlightTerms';

const courseTitle = 'Apache Kafka: Core Concepts, Configuration, and Design Patterns';
const chapterTitle = 'Kafka Architecture: Brokers, Topics, Partitions, and Offsets';
const summary =
  'This chapter introduces the fundamental building blocks of Kafka. ' +
  'Learners will understand how brokers form a cluster, how topics are divided ' +
  'into partitions for scalability, and how offsets enable consumers to track ' +
  'their position in the log.';

const terms = extractKeyTerms({
  text: summary,
  emphasize: titleTerms(chapterTitle),
  deprioritize: titleTerms(courseTitle),
});

console.log('extracted:', terms);

// Useful domain terms should be present.
for (const t of ['brokers', 'cluster', 'topics', 'partitions', 'scalability', 'offsets', 'consumers']) {
  assert.ok(terms.includes(t), `expected "${t}" in terms`);
}
// Low-value / dominant terms should NOT be present.
for (const bad of ['kafka', 'chapter', 'learners', 'understand', 'introduces', 'fundamental', 'building', 'blocks', 'position']) {
  assert.ok(!terms.includes(bad), `did NOT expect "${bad}" in terms`);
}

// Multi-word phrases win and are returned.
const phraseTerms = extractKeyTerms({
  text: 'The consumer groups coordinate partition assignment during the poll loop. Consumer groups matter for offset management.',
  explicit: ['offsets'],
});
console.log('phrase terms:', phraseTerms);
assert.ok(phraseTerms.includes('consumer groups'), 'expected phrase "consumer groups"');
assert.ok(
  phraseTerms.some((t) => t === 'partition assignment' || t === 'poll loop'),
  'expected a multi-word technical phrase',
);

// Plural de-duplication: only one of broker/brokers.
const dedup = extractKeyTerms({ text: 'brokers and a broker and more brokers', explicit: ['broker'] });
console.log('dedup:', dedup);
assert.strictEqual(dedup.filter((t) => t.replace(/s$/, '') === 'broker').length, 1, 'broker/brokers should dedupe');

console.log('\nAll highlightTerms checks passed ✓');
