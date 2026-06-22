// Local check:  npx tsx backend/src/youtube/parse-youtube-url.test.ts
import assert from 'node:assert';
import { parseYouTubeUrl, InvalidYouTubeUrlError } from './parse-youtube-url';

const cases: Array<[string, { sourceType: string; playlistId?: string; videoId?: string }]> = [
  ['https://www.youtube.com/playlist?list=PL123', { sourceType: 'YOUTUBE_PLAYLIST', playlistId: 'PL123' }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123', { sourceType: 'YOUTUBE_PLAYLIST', playlistId: 'PL123' }],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
  ['https://youtu.be/dQw4w9WgXcQ', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
  ['https://youtu.be/dQw4w9WgXcQ?si=abc', { sourceType: 'YOUTUBE_VIDEO', videoId: 'dQw4w9WgXcQ' }],
];

for (const [url, expected] of cases) {
  const got = parseYouTubeUrl(url);
  assert.deepStrictEqual(got, expected, `for ${url} got ${JSON.stringify(got)}`);
  console.log('ok:', url, '→', JSON.stringify(got));
}

for (const bad of ['https://example.com/watch?v=x', 'not a url', 'https://www.youtube.com/watch?v=tooShort']) {
  assert.throws(() => parseYouTubeUrl(bad), InvalidYouTubeUrlError, `expected throw for ${bad}`);
}

console.log('\nAll parse-youtube-url checks passed ✓');
