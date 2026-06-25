// The session is the one canonical learning entry. "All courses" vs "one
// course" is just a SCOPE PARAMETER (?courseId=) on the same /session route and
// the same GET /session/today endpoint. These pure helpers keep that contract
// in one place so every entry point links/reads scope identically.

export function parseSessionScope(
  search: string | URLSearchParams | null | undefined,
): string | undefined {
  if (!search) return undefined;
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : search;
  const id = params.get('courseId')?.trim();
  return id ? id : undefined;
}

/** Canonical link to the session, optionally scoped to one course. */
export function sessionHref(courseId?: string | null): string {
  return courseId ? `/session?courseId=${encodeURIComponent(courseId)}` : '/session';
}
