// Local check:  npx tsx backend/src/courses/source-key.test.ts
import assert from 'node:assert';
import { youtubeSourceKey, pdfSourceKey, dedupDecision } from './source-key';

// --- PDF content hash: identical bytes -> identical key, different -> different
const a = new TextEncoder().encode('Kafka cheatsheet contents …');
const aCopy = new TextEncoder().encode('Kafka cheatsheet contents …');
const b = new TextEncoder().encode('A different document');

assert.strictEqual(pdfSourceKey(a), pdfSourceKey(aCopy), 'identical content → identical key');
assert.notStrictEqual(pdfSourceKey(a), pdfSourceKey(b), 'different content → different key');
assert.match(pdfSourceKey(a), /^pdf:sha256:[0-9a-f]{64}$/, 'stable namespaced sha256 shape');

// --- YouTube: normalized id, independent of the rest of the URL --------------
assert.strictEqual(
  youtubeSourceKey({ sourceType: 'YOUTUBE_PLAYLIST', playlistId: 'PL123' }),
  'youtube:playlist:PL123',
);
assert.strictEqual(
  youtubeSourceKey({ sourceType: 'YOUTUBE_VIDEO', videoId: 'abcDEF12345' }),
  'youtube:video:abcDEF12345',
);
// Same playlist via different URL shapes yields the same key (parser normalizes
// to playlistId, so equal ids → equal keys).
assert.strictEqual(
  youtubeSourceKey({ sourceType: 'YOUTUBE_PLAYLIST', playlistId: 'PL123' }),
  youtubeSourceKey({ sourceType: 'YOUTUBE_PLAYLIST', playlistId: 'PL123' }),
);

// --- dedup decision (the create-time block outcome) --------------------------
assert.deepStrictEqual(dedupDecision(null), { duplicate: false });
assert.deepStrictEqual(dedupDecision(undefined), { duplicate: false });
assert.deepStrictEqual(
  dedupDecision({ courseId: 'c-existing', title: 'Kafka Course' }),
  { duplicate: true, existingCourseId: 'c-existing', existingTitle: 'Kafka Course' },
  'an existing non-failed course → block with a link to it',
);

console.log('source-key.test.ts OK');
