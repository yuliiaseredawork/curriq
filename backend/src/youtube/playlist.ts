export function extractPlaylistId(playlistUrl: string): string {
  const url = new URL(playlistUrl);

  const playlistId = url.searchParams.get('list');

  if (!playlistId) {
    throw new Error('Playlist URL must contain list= parameter');
  }

  return playlistId;
}

// Temporary MVP version.
// Later we will replace this with real YouTube Data API.
export async function getPlaylistVideos(playlistUrl: string): Promise<string[]> {
  const playlistId = extractPlaylistId(playlistUrl);

  console.log('Resolved playlist id:', playlistId);

  return [
    'dQw4w9WgXcQ',
  ];
}