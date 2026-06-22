// Parse a YouTube URL into a source type + identifiers.
// Supports playlists, watch links, youtu.be, Shorts, and embeds.

export type ParsedYouTube = {
  sourceType: 'YOUTUBE_PLAYLIST' | 'YOUTUBE_VIDEO';
  playlistId?: string;
  videoId?: string;
};

export class InvalidYouTubeUrlError extends Error {
  constructor() {
    super('INVALID_YOUTUBE_URL');
    this.name = 'InvalidYouTubeUrlError';
  }
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeUrl(raw: string): ParsedYouTube {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new InvalidYouTubeUrlError();
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
  const isYouTube =
    host === 'youtube.com' || host === 'youtu.be' || host.endsWith('.youtube.com');
  if (!isYouTube) throw new InvalidYouTubeUrlError();

  // If a playlist id is present, treat it as a playlist (per product rule).
  const list = url.searchParams.get('list');
  if (list && list.trim()) {
    return { sourceType: 'YOUTUBE_PLAYLIST', playlistId: list.trim() };
  }

  // Otherwise resolve a single video id from the various URL shapes.
  let videoId: string | undefined;
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    videoId = segments[0];
  } else if (url.pathname === '/watch') {
    videoId = url.searchParams.get('v') ?? undefined;
  } else if (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'v') {
    videoId = segments[1];
  }

  if (videoId && VIDEO_ID.test(videoId)) {
    return { sourceType: 'YOUTUBE_VIDEO', videoId };
  }

  throw new InvalidYouTubeUrlError();
}
