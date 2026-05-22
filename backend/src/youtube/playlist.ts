export function extractPlaylistId(playlistUrl: string): string {
  const url = new URL(playlistUrl);
  const playlistId = url.searchParams.get('list');

  if (!playlistId) {
    throw new Error('Playlist URL must contain list= parameter');
  }

  return playlistId;
}

type PlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      resourceId?: {
        videoId?: string;
      };
      title?: string;
    };
  }>;
};

export async function getPlaylistVideos(playlistUrl: string): Promise<string[]> {
  const playlistId = extractPlaylistId(playlistUrl);
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured');
  }

  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');

    url.searchParams.set('part', 'snippet');
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YouTube API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as PlaylistItemsResponse;

    for (const item of data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;

      if (videoId) {
        videoIds.push(videoId);
      }
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return videoIds;
}