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

// State-aware course-card view. A card stays calm and informative: one subtle
// status line under the title + a CTA that invites ("Start course") or resumes
// ("Continue"). Progress is optional — without it a READY card reads "Learning
// path ready". Display-only; no internal metadata leaks.
export type CourseCardView = { started: boolean; ctaLabel: string; statusLine: string };

export function courseCardView(progress?: {
  completionPercent?: number | null;
  answeredQuestions?: number | null;
  totalQuestions?: number | null;
} | null): CourseCardView {
  const pct = Math.max(0, Math.min(100, Math.round(progress?.completionPercent ?? 0)));
  const answered = progress?.answeredQuestions ?? 0;
  const total = progress?.totalQuestions ?? 0;
  const started = pct > 0 || answered > 0;
  if (!started) {
    return { started: false, ctaLabel: START_COURSE_LABEL, statusLine: 'Learning path ready' };
  }
  const statusLine =
    pct > 0 ? `${pct}% in progress` : total > 0 ? `${answered} / ${total} done` : 'In progress';
  return { started: true, ctaLabel: 'Continue', statusLine };
}

// Home "today's plan" breakdown: learner-facing label + rows.
export const WHATS_INCLUDED_LABEL = "What's included today";

/** "20 practice items" / "1 practice item" (no internal task vocabulary). */
export function practiceItemsLabel(count: number): string {
  return `${count} practice item${count === 1 ? '' : 's'}`;
}

/** Hide 0-task courses from the breakdown — unless every course is at 0. */
export function visibleBreakdownCourses<T extends { taskCount?: number | null }>(
  courses: T[],
): T[] {
  const withTasks = courses.filter((c) => (c.taskCount ?? 0) > 0);
  return withTasks.length > 0 ? withTasks : courses;
}

// "Add new material" → a premium, secondary "create" card.
export const CREATE_NEW_PATH_HEADING = 'Create a new learning path';
export const CREATE_NEW_PATH_HELPER =
  'Paste a video, playlist, or PDF. Curriq turns it into chapters, practice, and review.';

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
// A revealed card back reads best as short labeled sections. Newer cards may use
// "Answer:" / "Why it matters:" / "Watch out:" / "Source note:" lines; older
// freeform cards have none and render as one safe block. The rating prompt
// frames the SM-2 rating as one clear memory judgement before Again/Hard/Good/Easy.

export const FLASHCARD_RATING_PROMPT = 'How well did you remember this?';
export const FLASHCARD_ANSWER_LABEL = 'Answer';
export const FLASHCARD_WHY_LABEL = 'Why it matters';
export const FLASHCARD_WATCH_OUT_LABEL = 'Watch out';
export const FLASHCARD_SOURCE_NOTE_LABEL = 'Source note';
// Calm review framing for the flashcard front (replaces a loud uppercase
// "FLASHCARD · <long concept>" header) + a warm post-rating confirmation.
export const FLASHCARD_REVIEW_EYEBROW = 'Review';
export const FLASHCARD_SAVED_LABEL = 'Saved for review';

/**
 * A concise one-line takeaway from a longer feedback/explanation string: the
 * first sentence, trimmed to ~maxLen with an ellipsis. Display-only — used to
 * surface a short "Takeaway" before any detailed block. Returns null when empty.
 */
export function firstSentence(text: string | null | undefined, maxLen = 160): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  // First sentence boundary (., !, ?) followed by whitespace; else the whole text.
  const m = t.match(/^[\s\S]*?[.!?](?=\s)/);
  let s = (m ? m[0] : t).trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen).replace(/\s+\S*$/, '')}…`;
  return s || null;
}

// A leading correctness verdict to strip from a takeaway so it doesn't echo the
// "Correct"/"Not quite" headline shown right above it.
const LEADING_VERDICT_RE =
  /^(not quite|correct|incorrect|wrong|that's (right|wrong)|nope|yes|close)[\s,.!:;—–-]*/i;
// The grader prepends 'the correct answer is "X".' — stripped so it never
// becomes the takeaway text (we surface the answer separately, see
// correctAnswerLabel).
const CORRECT_ANSWER_CLAUSE_RE =
  /^the\s+(?:correct\s+|right\s+)?answer\s+is\s*[“"'][^“”"']*[”"']?\.?\s*/i;

/** Plain status word for an answer result (centralized so it never drifts). */
export function feedbackStatusLabel(correct: boolean): string {
  return correct ? 'Correct' : 'Not quite';
}

/** Eyebrow above the one-line takeaway: warmer for a correct answer. */
export function feedbackEyebrow(correct: boolean): string {
  return correct ? 'Remember this' : 'Takeaway';
}

// Internal/backend wording that must never reach a learner. Order matters:
// verb phrases first, then bare terms. Replacements read like a coach, not a
// retrieval pipeline.
const INTERNAL_WORDING_REPLACEMENTS: Array<[RegExp, string]> = [
  // Keep the article's original case ("The chunk states" → "The material states").
  [/\b(the)\s+(?:source\s+)?chunks?\s+(states?|says?|mentions?|notes?|shows?|describes?|explains?)\b/gi, '$1 material $2'],
  [/\baccording to the\s+(?:source\s+)?chunks?\b/gi, 'from the lesson'],
  [/\bthe model (?:says|states|notes)\b/gi, 'the material says'],
  [/\b(?:the\s+)?source\s+chunks?\b/gi, 'the source material'],
  [/\bchunks?\b/gi, 'the source material'],
];

/**
 * Strip internal/backend wording from generated learner-facing text — most
 * importantly "chunk"/"source chunk"/"the chunk states…" — and replace it with
 * coach-friendly phrasing. Display-only, defensive, idempotent-ish (safe to run
 * on text that has none). Never throws.
 */
export function scrubInternalWording(text: string | null | undefined): string {
  let t = (text ?? '').toString();
  for (const [re, repl] of INTERNAL_WORDING_REPLACEMENTS) t = t.replace(re, repl);
  return t.replace(/\s{2,}/g, ' ').trim();
}

/**
 * One concise takeaway for an answer-feedback panel: scrubs internal wording,
 * strips a leading verdict ("Not quite"/"Correct") AND the grader's
 * 'the correct answer is "X".' clause, then returns the first sentence — so the
 * takeaway is the actual learning point, never an echo of the headline. Null
 * when nothing useful remains.
 */
export function feedbackTakeaway(explanation: string | null | undefined): string | null {
  let s = scrubInternalWording(explanation).replace(LEADING_VERDICT_RE, '').trim();
  s = s.replace(CORRECT_ANSWER_CLAUSE_RE, '').trim();
  return firstSentence(s);
}

/**
 * The detail to show under "Show details": the scrubbed explanation MINUS the
 * first sentence (already shown as the takeaway), so the two never duplicate.
 * Null when there's nothing beyond the takeaway.
 */
export function feedbackDetail(explanation: string | null | undefined): string | null {
  let s = scrubInternalWording(explanation).replace(LEADING_VERDICT_RE, '').trim();
  s = s.replace(CORRECT_ANSWER_CLAUSE_RE, '').trim();
  const m = s.match(/^[\s\S]*?[.!?](?=\s)/);
  const rest = (m ? s.slice(m[0].length) : '').trim();
  return rest || null;
}

/**
 * The correct MCQ option as "A. <text>" (letter from its position) or just the
 * text when it isn't among the choices. Null when there's no answer. Lets the UI
 * show "Correct answer: …" plainly instead of burying it in prose.
 */
export function correctAnswerLabel(
  correctAnswer: string | null | undefined,
  choices?: string[] | null,
): string | null {
  const ans = (correctAnswer ?? '').trim();
  if (!ans) return null;
  if (choices?.length) {
    const idx = choices.findIndex((c) => (c ?? '').trim().toLowerCase() === ans.toLowerCase());
    if (idx >= 0) return `${String.fromCharCode(65 + idx)}. ${ans}`;
  }
  return ans;
}

/** Optional "why your answer was tempting": the grader's "(Common mix-up: …)". */
export function mixUpNote(explanation: string | null | undefined): string | null {
  const m = (explanation ?? '').match(/\(common mix-?up:\s*([^)]+)\)/i);
  return m ? m[1].trim() : null;
}

/** Hard-truncate coach text at a word boundary with an ellipsis. Defensive. */
export function truncateCoachText(text: string | null | undefined, maxLength = 200): string {
  const t = (text ?? '').trim();
  if (t.length <= maxLength) return t;
  return `${t.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

// A flashcard back, split into the sections we know how to present. Any field
// may be null. `fallback` holds text that has no recognized label (an entire
// older card, or leftover that didn't fit a section) so content is NEVER lost.
export type ParsedFlashcardBack = {
  answer: string | null;
  why: string | null;
  watchOut: string | null;
  sourceNote: string | null;
  fallback: string | null;
};

type BackField = 'answer' | 'why' | 'watchOut' | 'sourceNote';

// Recognized leading labels (each must be followed by a colon). Deliberately
// small and literal — no fuzzy NLP — so "Why does X happen" is never mistaken
// for a "Why" label.
const FLASHCARD_BACK_FIELD_LABELS: Array<{ field: BackField; match: RegExp }> = [
  { field: 'answer', match: /^answer$/i },
  { field: 'why', match: /^(why it matters|why)$/i },
  { field: 'watchOut', match: /^(watch[ -]?out|trap|gotcha)$/i },
  { field: 'sourceNote', match: /^(source note|source)$/i },
];

/**
 * Parse a flashcard back into labeled sections, safely. Detects simple
 * "Label: …" lines (Answer / Why / Why it matters / Watch out / Source /
 * Source note); unrecognized or label-free text falls back to `fallback`.
 * Leading text before the first label becomes the answer when none was labeled.
 * Pure, display-only — never mutates stored text and never drops content.
 */
export function parseFlashcardBack(text: string | null | undefined): ParsedFlashcardBack {
  const empty: ParsedFlashcardBack = {
    answer: null,
    why: null,
    watchOut: null,
    sourceNote: null,
    fallback: null,
  };
  const raw = (text ?? '').trim();
  if (!raw) return empty;

  const buckets: Record<BackField, string[]> = { answer: [], why: [], watchOut: [], sourceNote: [] };
  const preamble: string[] = [];
  let current: BackField | null = null;
  let sawLabel = false;

  for (const rawLine of raw.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) {
      // Preserve a paragraph break inside the section we're collecting.
      (current ? buckets[current] : preamble).push('');
      continue;
    }
    const m = line.match(/^([A-Za-z][A-Za-z -]{1,18}?):\s*(.*)$/);
    const matched = m ? FLASHCARD_BACK_FIELD_LABELS.find((l) => l.match.test(m[1]!.trim())) : undefined;
    if (matched) {
      sawLabel = true;
      current = matched.field;
      const rest = (m![2] ?? '').trim();
      if (rest) buckets[current].push(rest);
    } else if (current) {
      buckets[current].push(line);
    } else {
      preamble.push(line);
    }
  }

  // No recognized labels anywhere → render the original text as one safe block.
  if (!sawLabel) return { ...empty, fallback: raw };

  const join = (lines: string[]): string | null => {
    const s = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return s || null;
  };

  let answer = join(buckets.answer);
  let fallback: string | null = null;
  const pre = join(preamble);
  if (pre) {
    // Unlabeled lead text is the answer when none was labeled; otherwise keep
    // it as fallback so nothing is ever dropped.
    if (!answer) answer = pre;
    else fallback = pre;
  }

  return {
    answer,
    why: join(buckets.why),
    watchOut: join(buckets.watchOut),
    sourceNote: join(buckets.sourceNote),
    fallback,
  };
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
  'inline-flex items-center justify-center rounded-xl bg-blue-500 font-medium text-white shadow-sm shadow-blue-900/40 transition hover:bg-blue-400 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100';
export const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-xl border border-white/10 font-medium text-gray-200 transition hover:bg-white/5 disabled:opacity-50';

// Learner-facing names for the course's progress metrics (display-only — the
// underlying retention/mastery data is unchanged in code/telemetry).
export const METRIC_REMEMBERED_LABEL = 'Remembered';
export const METRIC_SOLID_LEARNING_LABEL = 'Solid / Still learning';
export const METRIC_NEEDS_LOOK_LABEL = 'Needs another look';
export const METRIC_READY_TO_REVIEW_LABEL = 'Review queue';

/** "~N a day to stay on track" — pace without exposing planner mechanics. */
export function stayOnTrackLine(perDay: number): string {
  return `~${perDay} a day to stay on track`;
}

/** Deadline pace status — encouraging, not scolding ("Behind" → "Needs catch-up"). */
export function scheduleStatusLabel(onTrack: boolean): string {
  return onTrack ? 'On track' : 'Needs catch-up';
}

/**
 * Render learner-facing blanks: replace cloze placeholders like "{{blank}}" (or
 * any "{{ … }}") with a plain "_____". Display-only — stored data is untouched.
 */
export function renderClozeText(text: string | null | undefined): string {
  return (text ?? '').replace(/\{\{\s*[^{}]*\}\}/g, '_____');
}
