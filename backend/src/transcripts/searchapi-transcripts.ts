type SearchApiTranscriptSegment = {
  text: string;
  start: number;
  duration?: number;
};

type SearchApiResponse = {
  transcripts?: SearchApiTranscriptSegment[];
  error?: string;
};

export type TranscriptSegment = {
  text: string;
  offset: number;
  duration?: number;
};

export async function fetchTranscriptFromSearchApi(
  videoId: string,
): Promise<TranscriptSegment[]> {
  const apiKey = process.env.SEARCHAPI_API_KEY;

  if (!apiKey) {
    throw new Error('SEARCHAPI_API_KEY is not configured');
  }

  const url = new URL('https://www.searchapi.io/api/v1/search');

  url.searchParams.set('engine', 'youtube_transcripts');
  url.searchParams.set('video_id', videoId);

  // Important: if English is not available, return first available transcript.
  url.searchParams.set('only_available', 'true');

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SearchAPI transcript error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as SearchApiResponse;

  if (!data.transcripts?.length) {
    throw new Error(`No transcript returned for video ${videoId}`);
  }

  return data.transcripts.map((s) => ({
    text: s.text,
    offset: s.start,
    duration: s.duration,
  }));
}