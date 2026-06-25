// Learner-facing copy helpers. These translate internal progress numbers and
// status enums into plain language for display ONLY — the underlying enums and
// metrics are unchanged in code/telemetry. Pure functions (easy to test).

export type LearningProgressView = {
  started: boolean;
  pct: number;
  headline: string;
  status: string;
};

/**
 * One progress indicator + one plain-language status for the course header.
 * Brand-new courses get an inviting starting state instead of a naked 0%.
 */
export function learningProgressView(input: {
  pct?: number | null;
  answered?: number | null;
}): LearningProgressView {
  const pct = Math.max(0, Math.min(100, Math.round(input.pct ?? 0)));
  const answered = input.answered ?? 0;
  const started = pct > 0 || answered > 0;

  if (!started) {
    return {
      started: false,
      pct: 0,
      headline: 'Ready when you are',
      status: 'Not started yet — begin with Chapter 1',
    };
  }

  // Range-safe single status (no per-band wording to maintain).
  const status = pct >= 100 ? 'Course complete' : 'In progress';
  return { started: true, pct, headline: `${pct}%`, status };
}

// Plain-language labels for the chapter-progress enum. Each carries a text label
// and a shape glyph so status is never conveyed by color alone.
export const CHAPTER_STATUS_LABELS: Record<string, { text: string; icon: string }> = {
  NOT_STARTED: { text: 'Not started yet', icon: '○' },
  IN_PROGRESS: { text: 'In progress', icon: '◐' },
  COMPLETED: { text: 'Completed', icon: '●' },
};

export function chapterStatusLabel(status?: string | null): { text: string; icon: string } {
  return CHAPTER_STATUS_LABELS[status ?? ''] ?? CHAPTER_STATUS_LABELS.NOT_STARTED;
}

/** Neutral session progress, e.g. "1 of 20" (no internal task vocabulary). */
export function sessionProgressLabel(index: number, total: number): string {
  return `${index + 1} of ${total}`;
}
