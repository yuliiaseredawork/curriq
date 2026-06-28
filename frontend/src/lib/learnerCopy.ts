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

// Plain-language view of a course's generation status. `generating` drives the
// "still building" UI (non-clickable card + spinner); `terminal` (READY/FAILED)
// is when polling can stop. Display-only — the raw enum is unchanged in
// code/telemetry. FAILED keeps its own dedicated UI, so no label is needed here.
export type CourseStatusView = { generating: boolean; terminal: boolean; label: string };

export function courseStatusLabel(status?: string | null): CourseStatusView {
  switch (status) {
    case 'READY':
      return { generating: false, terminal: true, label: 'Ready' };
    case 'FAILED':
      return { generating: false, terminal: true, label: 'Couldn’t generate' };
    case 'CREATED':
    case 'INGESTING':
    case 'PROCESSING':
    case 'OUTLINING':
      return { generating: true, terminal: false, label: 'Generating…' };
    default:
      // Unknown/missing status: treat as still working (never a dead link).
      return { generating: true, terminal: false, label: 'Generating…' };
  }
}

/** True while a course is still being built (used to drive background polling). */
export function isCoursePending(status?: string | null): boolean {
  return courseStatusLabel(status).generating;
}

/** Primary learning CTA copy: invite into a new course vs. resume one in progress. */
export function primaryCtaLabel(started: boolean): string {
  return started ? 'Continue learning' : 'Start learning';
}

// Course card CTA: a READY card opens the course hub (the learning path), it
// does NOT jump straight into a session.
export const START_COURSE_LABEL = 'Start course';

// Intro for a chapter's outcome bullets (rendered from the generated
// learning_objectives), so chapters read as "what you'll be able to do" rather
// than a generic "this chapter introduces…" summary.
export const CHAPTER_OUTCOMES_INTRO = "By the end, you'll be able to:";

// --- Session task presentation (coaching copy, display-only) ----------------
// A session task is shaped like { kind, reason, conceptTitle?, question? } where
// question carries { difficulty?, concept_tags? }. These helpers turn that into
// warm, learner-facing copy without exposing raw difficulty/tag metadata.

type SessionTaskLike = {
  kind?: string;
  reason?: string | null;
  conceptTitle?: string | null;
  question?: { concept_tags?: string[] | null } | null;
};

/** Heading for a question task: the concept for reviews, a warm label for new ones. */
export function questionHeading(task: SessionTaskLike): string {
  if (task.kind === 'review' && task.conceptTitle) return task.conceptTitle;
  return 'Check your understanding';
}

/** Short eyebrow above the heading. */
export function questionEyebrow(task: SessionTaskLike): string {
  return task.kind === 'review' ? 'Review' : 'Practice';
}

/** A single readable focus concept (the first tag), or null if unusable. */
export function questionFocus(task: SessionTaskLike): string | null {
  const raw = task.question?.concept_tags?.[0]?.trim();
  if (!raw || raw.length > 40) return null;
  // Title-case simple slugs/phrases for display; leave acronyms/casing as-is.
  return raw
    .split(/\s+/)
    .map((w) => (/[A-Z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

// Whitelist: only known, learner-safe planner reasons become coaching copy.
// Anything else (flashcard/internal/unknown reasons) renders nothing.
const TASK_CONTEXT_COPY: Record<string, string> = {
  'At risk of forgetting': "You're starting to forget this — let's lock it in.",
  'Weak area': "Let's strengthen this weak spot.",
  'Due before your deadline': 'This helps keep you on track for your deadline.',
  'Finish the chapter you started': 'Picking up where you left off.',
};

/** Optional "why this matters" line for a task, or null when not whitelisted. */
export function taskContextLine(task: SessionTaskLike): string | null {
  return (task.reason && TASK_CONTEXT_COPY[task.reason]) ?? null;
}

// --- Course-page chapter labels + flashcard result (display-only) ------------

/**
 * Calm, learner-facing quiz-readiness badge text (or null to hide). Readiness
 * is noise before a learner starts, so READY/NOT_STARTED are hidden until then;
 * preparing/failed always show because the learner needs to know.
 */
export function quizBadge(
  quizState: string | undefined,
  started: boolean,
): { text: string } | null {
  switch (quizState) {
    case 'GENERATING':
      return { text: 'Preparing…' };
    case 'FAILED':
      return { text: 'Couldn’t prepare practice' };
    case 'READY':
      return started ? { text: 'Ready' } : null;
    default: // NOT_STARTED / unknown
      return null;
  }
}

/** Chapter question count: an inviting "N practice questions" before starting,
 *  real "answered / total" progress once started. */
export function chapterQuestionsLabel(input: {
  started: boolean;
  answered?: number | null;
  total?: number | null;
}): string {
  const total = input.total ?? 0;
  if (total <= 0) return 'Questions are being prepared';
  if (!input.started) return `${total} practice question${total === 1 ? '' : 's'}`;
  return `${input.answered ?? 0} / ${total} questions`;
}

/** Chapter CTA label by progress status. "Start here" replaces "Study chapter". */
export function chapterCtaLabel(chapterStatus?: string | null): string {
  if (chapterStatus === 'COMPLETED') return 'Review chapter';
  if (chapterStatus === 'IN_PROGRESS') return 'Continue chapter';
  return 'Start here';
}

// --- Progressive disclosure (reduce on-screen text density) ------------------
// How many items a card shows before a "Show more" control. Display-only: the
// full content is always one click away — nothing is removed from the data.
export const DEFAULT_VISIBLE_OBJECTIVES = 2;
export const DEFAULT_VISIBLE_FOCUS_AREAS = 2;

export const SHOW_MORE_LABEL = 'Show more';
export const SHOW_LESS_LABEL = 'Show less';
export const SHOW_DETAILS_LABEL = 'Show details';
export const HIDE_DETAILS_LABEL = 'Hide details';
export const SHOW_MORE_FOCUS_LABEL = 'Show more focus areas';
export const SHOW_FEWER_FOCUS_LABEL = 'Show fewer';

/** Toggle label for a show-more / show-less control. */
export function showMoreLabel(expanded: boolean): string {
  return expanded ? SHOW_LESS_LABEL : SHOW_MORE_LABEL;
}

/** Toggle label for a subtle show / hide details control. */
export function detailsToggleLabel(expanded: boolean): string {
  return expanded ? HIDE_DETAILS_LABEL : SHOW_DETAILS_LABEL;
}

/** Toggle label for the focus-areas list (top N shown by default). */
export function focusListToggleLabel(expanded: boolean): string {
  return expanded ? SHOW_FEWER_FOCUS_LABEL : SHOW_MORE_FOCUS_LABEL;
}

// --- Home page copy + mode (display-only) -----------------------------------
export const HOME_HERO_HEADLINE = 'Turn any video or PDF into a guided learning path.';
export const HOME_VALUE_PROP =
  'Curriq tells you what to study next, checks your understanding, and brings weak concepts back before you forget them.';
export const HOME_HERO_STEPS =
  'Add content → get a learning path → practice with grounded questions → review weak concepts.';
export const TODAYS_PLAN_LABEL = "Today's learning plan";
export const CONTINUE_LEARNING_LABEL = 'Continue learning';
export const YOUR_COURSES_LABEL = 'Your courses';
export const CREATE_LEARNING_PATH_LABEL = 'Create learning path';
export const CAUGHT_UP_TITLE = "You're caught up for now.";
export const CAUGHT_UP_BODY = 'Review a course or add new material when you’re ready.';

/**
 * Home layout mode. First-run (welcoming hero + creation) only once we know the
 * learner has zero courses; while loading we assume the returning layout so the
 * hero never flashes mid-load.
 */
export function homeMode(input: { hasCourses: boolean; loadingCourses: boolean }): 'first-run' | 'returning' {
  if (input.loadingCourses) return 'returning';
  return input.hasCourses ? 'returning' : 'first-run';
}

/** Friendly post-rating confirmation, e.g. "Marked as hard · next review tomorrow". */
export function flashcardRatedLine(rating: string, intervalDays: number): string {
  const when =
    intervalDays <= 0
      ? 'later today'
      : intervalDays === 1
        ? 'tomorrow'
        : `in ${intervalDays} days`;
  return `Marked as ${String(rating).toLowerCase()} · next review ${when}`;
}

// --- Flashcard back presentation (display-only) ------------------------------
// A revealed card back reads best as short labeled sections. Newer cards use
// "Answer:" / "Why it matters:" / "Watch out:" lines; older freeform cards have
// none and render as one block (unchanged). The rating prompt frames the SM-2
// rating as one clear memory judgement before Again/Hard/Good/Easy.

export const FLASHCARD_RATING_PROMPT = 'How well did you remember this?';
export const SOURCE_NOTE_LABEL = 'Source note';
export const ANSWER_LABEL = 'Answer';
export const WHY_LABEL = 'Why it matters';
export const WATCH_OUT_LABEL = 'Watch out';

export type FlashcardSection = { label: string | null; body: string };

// Leading labels recognized at the start of a back line (canonical ← matcher).
const FLASHCARD_BACK_LABELS: Array<{ canonical: string; match: RegExp }> = [
  { canonical: ANSWER_LABEL, match: /^answer$/i },
  { canonical: WHY_LABEL, match: /^(why it matters|why)$/i },
  { canonical: WATCH_OUT_LABEL, match: /^(watch[ -]?out|trap|gotcha)$/i },
];

/**
 * Split a flashcard back into readable sections. A line beginning with a
 * recognized "Label: …" becomes a labeled section; everything else is plain
 * text, with consecutive unlabeled lines merged so an OLD freeform card stays a
 * single block and renders exactly as before. Pure and display-only — never
 * mutates stored text; cloze blanks are handled at render time.
 */
export function flashcardBackSections(back: string | null | undefined): FlashcardSection[] {
  const text = (back ?? '').trim();
  if (!text) return [];
  const out: FlashcardSection[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let label: string | null = null;
    let body = line;
    // A label is a short word/phrase immediately before a colon with content
    // after it (so prose like "Why does X happen" is never treated as a label).
    const m = line.match(/^([A-Za-z][A-Za-z -]{1,18}?):\s*(.+)$/);
    if (m) {
      const found = FLASHCARD_BACK_LABELS.find((l) => l.match.test(m[1].trim()));
      if (found) {
        label = found.canonical;
        body = m[2].trim();
      }
    }
    const prev = out[out.length - 1];
    if (label === null && prev && prev.label === null) {
      prev.body = `${prev.body}\n${body}`;
    } else {
      out.push({ label, body });
    }
  }
  return out;
}

// Above-the-fold hero for the course page. Before starting, the page introduces
// the chapters as the recommended path; once started, it's a resume point.
export type CourseHero = { title: string; subtitle: string; ctaLabel: string };

export function courseHero(input: { started: boolean; hasChapters: boolean }): CourseHero {
  if (input.started) {
    return {
      title: 'Continue learning',
      subtitle: 'Pick up where you left off — Curriq will coach you through what’s next.',
      ctaLabel: 'Continue learning',
    };
  }
  return {
    title: 'Your learning path is ready',
    subtitle: input.hasChapters
      ? 'The chapters below are your recommended path. Curriq will coach you through them, one step at a time.'
      : 'Curriq will coach you through this course, one step at a time.',
    ctaLabel: 'Start learning',
  };
}

// Copy for an empty session (no current task). Three distinct cases so a
// brand-new course never reads as "nothing is due":
//  - complete:  finished a queue this session (returning learner).
//  - preparing: a course-scoped session with nothing yet — quizzes may still be
//               generating; offer a way back to the course.
//  - caught-up: an all-courses session with genuinely nothing due.
export type SessionEmptyState =
  | { kind: 'complete'; title: string; body: string; backHref?: string }
  | { kind: 'preparing'; title: string; body: string; backHref: string }
  | { kind: 'caught-up'; title: string; body: string };

export function sessionEmptyState(input: {
  reviewed: number;
  scopeCourseId?: string | null;
  scopeChapterId?: string | null;
  chapterReady?: boolean;
}): SessionEmptyState {
  // Chapter-scoped session: a focused, chapter-specific message.
  if (input.scopeChapterId && input.scopeCourseId) {
    const backHref = `/courses/${input.scopeCourseId}`;
    // Quiz isn't ready yet (and nothing answered this session) → "preparing".
    if (!input.chapterReady && input.reviewed === 0) {
      return {
        kind: 'preparing',
        title: 'Getting this chapter ready 🛠️',
        body: 'Chapter practice is being prepared. Give it a moment, then reload.',
        backHref,
      };
    }
    // Questions exist but none left to do (finished now or earlier).
    return {
      kind: 'complete',
      title: input.reviewed > 0 ? 'Chapter practice complete 🎉' : 'All done here 🎉',
      body: "You've finished this chapter's practice for now.",
      backHref,
    };
  }

  if (input.reviewed > 0) {
    const n = input.reviewed;
    return {
      kind: 'complete',
      title: 'Session complete 🎉',
      body: `You reviewed ${n} item${n === 1 ? '' : 's'}.`,
    };
  }
  if (input.scopeCourseId) {
    return {
      kind: 'preparing',
      title: 'Setting up your session 🛠️',
      body: 'Your course is still getting ready. New questions appear here as they finish generating — give it a moment, then reload.',
      backHref: `/courses/${input.scopeCourseId}`,
    };
  }
  return {
    kind: 'caught-up',
    title: 'All caught up 🎉',
    body: 'Nothing is due right now. Check back later.',
  };
}

// Focus-practice copy (coached, mirrors the main session).
export const FOCUS_EYEBROW = 'Focus practice';
export const FOCUS_CONTEXT = 'Strengthen this weak spot';

// Shared button styles so every primary action looks the same. Primary actions
// read as blue; secondary actions are quiet/bordered. Padding/sizing is added
// per call site (these cover color/shape/font/disabled only) to avoid
// conflicting Tailwind padding utilities.
export const primaryButtonClass =
  'inline-block rounded-lg bg-blue-500 font-medium text-white hover:bg-blue-400 disabled:opacity-50';
export const secondaryButtonClass =
  'inline-block rounded-lg border border-gray-700 font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50';

// Learner-facing names for the course's progress metrics (display-only — the
// underlying retention/mastery data is unchanged in code/telemetry).
export const METRIC_REMEMBERED_LABEL = 'Remembered';
export const METRIC_SOLID_LEARNING_LABEL = 'Solid / Still learning';
export const METRIC_NEEDS_LOOK_LABEL = 'Needs another look';
export const METRIC_READY_TO_REVIEW_LABEL = 'Ready to review';

/** "~N a day to stay on track" — pace without exposing planner mechanics. */
export function stayOnTrackLine(perDay: number): string {
  return `~${perDay} a day to stay on track`;
}

/**
 * Render learner-facing blanks: replace cloze placeholders like "{{blank}}" (or
 * any "{{ … }}") with a plain "_____". Display-only — stored data is untouched.
 */
export function renderClozeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\{\{\s*[^{}]*\}\}/g, '_____');
}
