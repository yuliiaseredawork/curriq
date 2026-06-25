import { createHash } from 'crypto';
import type { ParsedYouTube } from '../youtube/parse-youtube-url';

// A stable, per-user dedup key derived from the *source*, not its title/filename.
// Same source -> same key. Stored on the course (`source_key`) and looked up on
// create to block duplicates. Pure.

/** YouTube: the normalized playlist/video id (already extracted by the parser). */
export function youtubeSourceKey(parsed: ParsedYouTube): string {
  if (parsed.sourceType === 'YOUTUBE_PLAYLIST') {
    return `youtube:playlist:${parsed.playlistId}`;
  }
  return `youtube:video:${parsed.videoId}`;
}

/** PDF: SHA-256 of the file bytes (computed server-side from the uploaded object). */
export function pdfSourceKey(bytes: Uint8Array): string {
  return `pdf:sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export type ExistingCourse = { courseId: string; title: string } | null | undefined;

export type DedupDecision =
  | { duplicate: false }
  | { duplicate: true; existingCourseId: string; existingTitle: string };

/** Given the lookup result for a source key, decide block vs. allow. */
export function dedupDecision(existing: ExistingCourse): DedupDecision {
  if (existing && existing.courseId) {
    return {
      duplicate: true,
      existingCourseId: existing.courseId,
      existingTitle: existing.title,
    };
  }
  return { duplicate: false };
}
