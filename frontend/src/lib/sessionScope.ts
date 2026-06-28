// The session is the one canonical learning entry. "All courses" vs "one
// course" is just a SCOPE PARAMETER (?courseId=) on the same /session route and
// the same GET /session/today endpoint. These pure helpers keep that contract
// in one place so every entry point links/reads scope identically.

export type SessionScope = { courseId?: string; chapterId?: string };

export function parseSessionScope(
  search: string | URLSearchParams | null | undefined,
): SessionScope {
  if (!search) return {};
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const courseId = params.get('courseId')?.trim() || undefined;
  // A chapter scope only makes sense within a course scope.
  const chapterId = courseId ? params.get('chapterId')?.trim() || undefined : undefined;
  return { courseId, chapterId };
}

/**
 * Canonical link to the session: all-courses, one course, or one chapter.
 * Chapter scope requires a course scope (a chapterId without a courseId is
 * ignored).
 */
export function sessionHref(courseId?: string | null, chapterId?: string | null): string {
  if (!courseId) return '/session';
  const base = `/session?courseId=${encodeURIComponent(courseId)}`;
  return chapterId ? `${base}&chapterId=${encodeURIComponent(chapterId)}` : base;
}
