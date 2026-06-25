// Maps a raw generation error to a short, user-safe failure reason. The raw
// error (stack traces, provider messages) is kept in logs only — never shown to
// the learner. Pure; no I/O. Used by the generation pipelines before they
// persist a FAILED status so the stored `error_message` is always presentable.

export type FailureReason = string;

const GENERIC: FailureReason = 'Course generation failed. Please try again.';

// Ordered: first matching pattern wins. Keep messages plain-language and
// actionable; never echo provider/internal text.
const RULES: Array<{ test: RegExp; reason: FailureReason }> = [
  {
    test: /transcript|caption|subtitle|no usable text from (the )?(video|playlist)/i,
    reason: 'We couldn’t find usable transcripts for this video or playlist. Try one with captions.',
  },
  {
    test: /pdf|could not read text|no text|empty document|scanned|image-only/i,
    reason: 'We couldn’t read text from this PDF. It may be empty, scanned, or image-only.',
  },
  {
    test: /timeout|timed out|etimedout|deadline exceeded/i,
    reason: 'Course generation timed out. Please try again.',
  },
  {
    test: /rate limit|429|overloaded|throttl|quota/i,
    reason: 'The service was busy. Please try again in a few minutes.',
  },
  {
    test: /invalid.*youtube|youtube.*invalid|not.*valid.*url/i,
    reason: 'This doesn’t look like a valid YouTube URL.',
  },
];

export function toUserSafeReason(error: unknown): FailureReason {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  for (const rule of RULES) {
    if (rule.test.test(raw)) return rule.reason;
  }
  return GENERIC;
}
