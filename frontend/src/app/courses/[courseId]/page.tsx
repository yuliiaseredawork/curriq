'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { extractKeyTerms, titleTerms } from '@/lib/highlightTerms';
import { courseIdentity } from '@/lib/courseIdentity';
import {
  learningProgressView,
  chapterStatusLabel,
  courseHero,
  CHAPTER_OUTCOMES_INTRO,
  quizBadge,
  chapterQuestionsLabel,
  chapterCtaLabel,
  DEFAULT_VISIBLE_OBJECTIVES,
  DEFAULT_VISIBLE_FOCUS_AREAS,
  showMoreLabel,
  detailsToggleLabel,
  focusListToggleLabel,
  primaryButtonClass,
  stayOnTrackLine,
  METRIC_REMEMBERED_LABEL,
  METRIC_SOLID_LEARNING_LABEL,
  METRIC_NEEDS_LOOK_LABEL,
  METRIC_READY_TO_REVIEW_LABEL,
} from '@/lib/learnerCopy';
import { sessionHref } from '@/lib/sessionScope';
import {
  pageShell,
  readingContainer,
  primaryCard,
  subtleCard,
  accentCard,
  sectionHeading,
  eyebrow,
  ghostLink,
  progressTrack,
  progressFill,
  secondaryButtonClass,
} from '@/lib/ui';

export default function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);
  const router = useRouter();
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const api = createApiClient(getToken);

  const userId = user?.primaryEmailAddress?.emailAddress
    ? `email:${user.primaryEmailAddress.emailAddress.toLowerCase()}`
    : user?.id
      ? `clerk:${user.id}`
      : null;

  const [course, setCourse] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState('');
  const [focusAreas, setFocusAreas] = useState<any[]>([]);
  const [masteredAreas, setMasteredAreas] = useState<any[]>([]);
  const [focusPreparing, setFocusPreparing] = useState(false);
  const [showMastered, setShowMastered] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showMetricDetails, setShowMetricDetails] = useState(false);
  // Per-card progressive disclosure (keyed by chapter id / concept slug) so each
  // card expands independently and cards stay short by default.
  const [expandedObjectives, setExpandedObjectives] = useState<Record<string, boolean>>({});
  const [expandedCovers, setExpandedCovers] = useState<Record<string, boolean>>({});
  const [quizStatus, setQuizStatus] = useState<Record<string, any>>({});
  const [retention, setRetention] = useState<any>(null);
  const [cardsDue, setCardsDue] = useState<number | null>(null);

  async function loadRetention() {
    try {
      setRetention(await api.getRetention(courseId));
    } catch {
      // best-effort
    }
    try {
      const f = await api.getFlashcardsDue(courseId);
      setCardsDue(f.cardsDue ?? 0);
    } catch {
      // best-effort
    }
  }

  async function loadFocusAreas() {
    try {
      const res = await api.getFocusAreas(courseId);
      setFocusAreas(res.active ?? []);
      setMasteredAreas(res.mastered ?? []);
      setFocusPreparing(!!res.preparing);
    } catch {
      // best-effort
    }
  }

  async function loadQuizStatus() {
    try {
      const result = await api.getQuizStatus(courseId);
      const byChapter: Record<string, any> = {};
      for (const ch of result.chapters ?? []) byChapter[ch.chapterId] = ch;
      setQuizStatus(byChapter);
    } catch {
      // quiz status is best-effort; don't block the page on it
    }
  }

  useEffect(() => {
    if (!authLoaded || !userLoaded || !userId) return;

    Promise.all([
      api.getCourse(courseId),
      api.getCourseProgress(courseId, userId),
    ])
      .then(([courseResult, progressResult]) => {
        setCourse(courseResult);
        setProgress(progressResult);
      })
      .catch((e) => setError(e.message ?? 'Failed to load course'));

    loadFocusAreas();
    loadQuizStatus();
    loadRetention();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, authLoaded, userLoaded, userId]);

  // Poll quiz status while any chapter is still generating.
  useEffect(() => {
    const anyGenerating = Object.values(quizStatus).some(
      (s: any) => s.status === 'GENERATING',
    );
    if (!anyGenerating) return;
    const interval = setInterval(loadQuizStatus, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizStatus]);

  // Poll focus areas while consolidation is preparing them.
  useEffect(() => {
    if (!focusPreparing) return;
    const interval = setInterval(loadFocusAreas, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPreparing]);

  async function handleRetryQuiz(chapterId: string) {
    setQuizStatus((prev) => ({
      ...prev,
      [chapterId]: { ...prev[chapterId], chapterId, status: 'GENERATING' },
    }));
    try {
      await api.retryChapterQuiz(courseId, chapterId);
    } catch (e: any) {
      setError(e.message ?? 'Failed to start quiz generation');
    } finally {
      loadQuizStatus();
    }
  }

  function handleOpenFocus(conceptSlug: string) {
    router.push(`/courses/${courseId}/focus/${encodeURIComponent(conceptSlug)}`);
  }

  function handleContinue() {
    // Canonical entry: a course-scoped session (same endpoint as "Start
    // Session", just scoped) — no separate single-course/chapter flow.
    router.push(sessionHref(courseId));
  }

  if (error) {
    return (
      <main className={pageShell}>
        <div className={readingContainer}>
          <a href="/" className={ghostLink}>
            ← My courses
          </a>
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-red-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className={`${pageShell} p-8`}>
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  // One source of truth for "has the learner started this course?". Drives the
  // hero copy and whether the empty progress/metrics blocks are shown at all.
  const progressView = learningProgressView({
    pct: retention?.learningProgress ?? progress?.completionPercent ?? 0,
    answered: progress?.answeredQuestions ?? 0,
  });
  const started = progressView.started;

  // Highlight terms are derived from visible text + existing metadata (no AI).
  // Course-title words are deprioritized so the broad course name doesn't
  // dominate; focus-area concepts are always eligible.
  const courseTitleWords = titleTerms(course.outline?.title);
  const focusRawConcepts = [...focusAreas, ...masteredAreas].flatMap(
    (fa) => fa.rawConcepts ?? [],
  );

  return (
    <main className={pageShell}>
      <div className={`${readingContainer} space-y-6`}>
        <a href="/" className={ghostLink}>
          ← My courses
        </a>

        {(() => {
          const id = courseIdentity(course.outline.title);
          return (
            <div className="flex items-center gap-3">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border text-2xl ${id.accentClass}`}>
                {id.icon}
              </span>
              <div className="min-w-0">
                <div className={`${eyebrow} ${id.accentClass.split(' ').find((x) => x.startsWith('text-')) ?? 'text-gray-400'}`}>
                  {id.category}
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{course.outline.title}</h1>
              </div>
            </div>
          );
        })()}

        {/* Above the fold: the course launch area — introduce the learning path
            (new) or resume it (started). */}
        {(() => {
          const hasChapters = (course.outline.chapters?.length ?? 0) > 0;
          const hero = courseHero({ started, hasChapters });
          return (
            <div className={`${accentCard} space-y-4 p-6`}>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">{hero.title}</h2>
                <p className="mt-1.5 text-sm text-gray-300">{hero.subtitle}</p>
              </div>
              {started && (
                <p className="text-sm font-medium text-blue-200">
                  {progressView.headline} · {progressView.status}
                </p>
              )}
              <button
                className={`${primaryButtonClass} px-6 py-3 shadow-md shadow-blue-900/50`}
                onClick={handleContinue}
              >
                {hero.ctaLabel} →
              </button>
            </div>
          );
        })()}

        {/* Progress + metrics only matter once the learner has started — a
            brand-new course shows the path instead of empty analytics. */}
        {started && (progress || retention) && (
          <div className={`${primaryCard} p-5 space-y-3`}>
            <div className="flex items-baseline justify-between">
              <div className={`${eyebrow} text-gray-400`}>Learning progress</div>
              <div className="text-2xl font-semibold">{progressView.headline}</div>
            </div>
            <div className={progressTrack}>
              <div className={progressFill} style={{ width: `${progressView.pct}%` }} />
            </div>
            <div className="text-sm text-gray-400">{progressView.status}</div>
          </div>
        )}

        {started && (course.metadata?.targetDate || retention || cardsDue) && (
          <div className={`${primaryCard} p-5 space-y-4`}>
            {/* Actionable, always visible: what's ready + the deadline. */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
              {cardsDue != null && cardsDue > 0 && (
                <div>
                  <div className="text-xs text-gray-500">{METRIC_READY_TO_REVIEW_LABEL}</div>
                  <a href="/flashcards" className="text-lg font-semibold text-purple-300">{cardsDue}</a>
                </div>
              )}
              {course.metadata?.targetDate && (() => {
                const target = new Date(course.metadata.targetDate).getTime();
                const daysLeft = Math.ceil((target - Date.now()) / 86400000);
                const remaining = retention ? retention.total - retention.mastered : 0;
                const perDay = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
                // On-track vs an even burn-down (mirrors backend scheduleStatus).
                let onTrack = true;
                const created = course.metadata.createdAt
                  ? new Date(course.metadata.createdAt).getTime()
                  : null;
                if (created && retention && retention.total > 0) {
                  const totalDays = Math.max(1, Math.ceil((target - created) / 86400000));
                  const elapsed = Math.max(0, totalDays - Math.max(0, daysLeft));
                  const expectedMastered = (retention.total * elapsed) / totalDays;
                  onTrack = expectedMastered - retention.mastered <= 0.5;
                }
                return (
                  <div>
                    <div className="text-xs text-gray-500">Deadline</div>
                    <div className={`text-lg font-semibold ${daysLeft < 0 ? 'text-red-400' : ''}`}>
                      {daysLeft < 0 ? 'Passed' : `${daysLeft} days`}
                    </div>
                    {daysLeft >= 0 && remaining > 0 && (
                      <div className="text-xs text-gray-500">{stayOnTrackLine(perDay)}</div>
                    )}
                    {daysLeft >= 0 && retention && (
                      <div className={`text-xs ${onTrack ? 'text-green-400' : 'text-yellow-400'}`}>
                        {onTrack ? 'On track' : 'Behind'}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Analytical metrics tucked behind a quiet disclosure. */}
            {retention && (
              <div>
                <button
                  className="text-sm text-gray-400 hover:text-gray-200"
                  onClick={() => setShowMetricDetails((s) => !s)}
                >
                  {showMetricDetails ? '▾ Hide details' : '▸ Details'}
                </button>
                {showMetricDetails && (
                  <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
                    <div>
                      <div className="text-xs text-gray-500">{METRIC_REMEMBERED_LABEL}</div>
                      <div className="text-lg font-semibold">{retention.retentionScore}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{METRIC_SOLID_LEARNING_LABEL}</div>
                      <div className="text-lg font-semibold">
                        {retention.mastered} / {retention.learning}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{METRIC_NEEDS_LOOK_LABEL}</div>
                      <div className="text-lg font-semibold text-gray-200">{retention.forgotten}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(focusAreas.length > 0 || focusPreparing) && (
          <div className={`${primaryCard} p-5 space-y-3`}>
            <div>
              <div className={`${eyebrow} text-blue-300`}>Coach&apos;s pick</div>
              <h2 className="text-xl font-semibold tracking-tight">What to work on next</h2>
            </div>

            {focusPreparing && focusAreas.length === 0 && (
              <p className="text-sm text-gray-300">
                Analyzing your mistakes to find your key learning gaps…
              </p>
            )}

            <div className="space-y-3">
              {(showMore ? focusAreas : focusAreas.slice(0, DEFAULT_VISIBLE_FOCUS_AREAS)).map((item) => {
                const inProgress = item.sessionStatus === 'IN_PROGRESS';
                const trendStr =
                  item.trend > 0 ? `+${item.trend}%` : item.trend < 0 ? `${item.trend}%` : null;
                return (
                  <div
                    key={item.conceptSlug}
                    className={`${subtleCard} flex items-start justify-between gap-3 px-4 py-3`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-medium">{item.title}</div>
                      {item.shortDescription && (
                        <ScannableText
                          text={item.shortDescription}
                          keyTerms={extractKeyTerms({
                            text: item.shortDescription,
                            explicit: item.rawConcepts ?? [],
                            deprioritize: courseTitleWords,
                          })}
                          className="text-sm text-gray-400"
                        />
                      )}
                      <div className="text-xs text-gray-500">
                        {item.masteryScore}% there
                        {trendStr && (
                          <span className={item.trend >= 0 ? 'text-green-400' : 'text-gray-400'}>
                            {' '}· {trendStr} this week
                          </span>
                        )}
                        {item.lastPracticedAt && (
                          <span> · last practiced {new Date(item.lastPracticedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      <div className={`${progressTrack} h-1.5 w-40`}>
                        <div className={progressFill} style={{ width: `${item.masteryScore}%` }} />
                      </div>
                      {item.rawConcepts?.length > 0 && (
                        <div className="text-xs">
                          <button
                            type="button"
                            className="text-gray-500 hover:text-gray-300"
                            onClick={() =>
                              setExpandedCovers((s) => ({
                                ...s,
                                [item.conceptSlug]: !s[item.conceptSlug],
                              }))
                            }
                          >
                            {detailsToggleLabel(!!expandedCovers[item.conceptSlug])}
                          </button>
                          {expandedCovers[item.conceptSlug] && (
                            <div className="mt-1 text-gray-600">
                              Covers: {item.rawConcepts.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className={`${primaryButtonClass} shrink-0 px-3 py-2 text-sm`}
                      onClick={() => handleOpenFocus(item.conceptSlug)}
                      disabled={!item.remediationReady && !inProgress}
                    >
                      {inProgress
                        ? 'Resume Practice'
                        : item.remediationReady
                          ? 'Practice'
                          : 'Preparing…'}
                    </button>
                  </div>
                );
              })}
            </div>

            {focusAreas.length > DEFAULT_VISIBLE_FOCUS_AREAS && (
              <button
                className="text-sm text-blue-300"
                onClick={() => setShowMore((s) => !s)}
              >
                {focusListToggleLabel(showMore)}
              </button>
            )}
          </div>
        )}

        {masteredAreas.length > 0 && (
          <div className="rounded-2xl border border-green-500/20 bg-green-950/15 p-4">
            <button
              className="text-sm font-medium text-green-300 hover:text-green-200"
              onClick={() => setShowMastered((s) => !s)}
            >
              {showMastered ? '▾' : '▸'} Mastered concepts ({masteredAreas.length})
            </button>
            {showMastered && (
              <div className="mt-3 space-y-2">
                {masteredAreas.map((item) => (
                  <div
                    key={item.conceptSlug}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2 text-sm"
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 text-green-400">{item.masteryScore}% ✓</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <h2 className={sectionHeading}>Learning path</h2>
          {(() => {
          // The first not-yet-completed chapter is the learner's "start here".
          const firstIncompleteIndex = course.outline.chapters.findIndex((ch: any) => {
            const cp = progress?.chapters?.find((p: any) => p.chapterId === ch.id);
            return (cp?.status ?? 'NOT_STARTED') !== 'COMPLETED';
          });
          return course.outline.chapters.map((chapter: any, i: number) => {
            const chapterProgress = progress?.chapters?.find(
              (p: any) => p.chapterId === chapter.id,
            );
            const isStartHere = i === firstIncompleteIndex;

            const quiz = quizStatus[chapter.id];
            const quizState = quiz?.status ?? 'NOT_STARTED';

            const buttonLabel = chapterCtaLabel(chapterProgress?.status);

            const badge = quizBadge(quizState, started);
            const badgeCls =
              quizState === 'FAILED'
                ? 'border-red-500/40 text-red-300'
                : quizState === 'GENERATING'
                  ? 'border-blue-500/40 text-blue-300'
                  : 'border-white/10 text-gray-300';

            // The current chapter gets a subtle accent so the path has a clear
            // "you are here"; all other chapters stay calm and readable.
            const cardCls = isStartHere
              ? 'rounded-2xl border border-blue-500/30 bg-gray-900/70 p-5 space-y-3 shadow-lg shadow-blue-950/20 ring-1 ring-blue-500/15'
              : `${primaryCard} p-5 space-y-3`;

            return (
              <div key={chapter.id} className={cardCls}>
                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                      isStartHere
                        ? 'bg-blue-500 text-white'
                        : 'border border-white/10 bg-white/[0.03] text-gray-400'
                    }`}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className={eyebrow}>Chapter {i + 1}</div>
                      {badge && (
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${badgeCls}`}>
                          {badge.text}
                        </span>
                      )}
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">{chapter.title}</h2>
                  </div>
                </div>
                {chapter.learning_objectives?.length ? (() => {
                  // Keep cards short: show the first 2 outcomes; the rest are one
                  // click away (full learning depth preserved on demand).
                  const objectives: string[] = chapter.learning_objectives;
                  const expanded = !!expandedObjectives[chapter.id];
                  const visible = expanded
                    ? objectives
                    : objectives.slice(0, DEFAULT_VISIBLE_OBJECTIVES);
                  const hasMore = objectives.length > DEFAULT_VISIBLE_OBJECTIVES;
                  return (
                    <div className="space-y-1">
                      <div className="text-sm text-gray-400">{CHAPTER_OUTCOMES_INTRO}</div>
                      <ul className="list-disc pl-5 text-sm text-gray-300 space-y-0.5">
                        {visible.map((obj: string, oi: number) => (
                          <li key={oi}>{obj}</li>
                        ))}
                      </ul>
                      {hasMore && (
                        <button
                          type="button"
                          className="text-sm text-blue-300 hover:text-blue-200"
                          onClick={() =>
                            setExpandedObjectives((s) => ({
                              ...s,
                              [chapter.id]: !s[chapter.id],
                            }))
                          }
                        >
                          {showMoreLabel(expanded)}
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <ScannableText
                    text={chapter.summary}
                    keyTerms={extractKeyTerms({
                      text: chapter.summary,
                      emphasize: titleTerms(chapter.title),
                      explicit: focusRawConcepts,
                      deprioritize: courseTitleWords,
                    })}
                    clampChars={280}
                    className="text-gray-300"
                  />
                )}

                {chapterProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      {(() => {
                        const s = chapterStatusLabel(chapterProgress.status);
                        return (
                          <span>
                            <span aria-hidden="true">{s.icon}</span> {s.text}
                          </span>
                        );
                      })()}
                      <span>
                        {chapterQuestionsLabel({
                          started,
                          answered: chapterProgress.answeredQuestions,
                          total: chapterProgress.totalQuestions,
                        })}
                      </span>
                    </div>
                    <div className={progressTrack}>
                      <div
                        className={progressFill}
                        style={{ width: `${chapterProgress.completionPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Chapter CTA opens a chapter-scoped session (only this
                    chapter's questions — no flashcards/reviews). Shown on the
                    "start here" chapter. */}
                {quizState === 'READY' && isStartHere && (
                  <a
                    href={sessionHref(courseId, chapter.id)}
                    className={`${primaryButtonClass} px-4 py-2`}
                  >
                    {buttonLabel}
                  </a>
                )}

                {quizState === 'GENERATING' && (
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-gray-400 cursor-not-allowed"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                    Generating quiz…
                  </button>
                )}

                {quizState === 'FAILED' && (
                  <button
                    onClick={() => handleRetryQuiz(chapter.id)}
                    className="inline-flex items-center justify-center rounded-xl bg-red-500 px-4 py-2 font-medium text-white transition hover:bg-red-400"
                  >
                    Retry quiz
                  </button>
                )}

                {quizState === 'NOT_STARTED' && (
                  <button
                    onClick={() => handleRetryQuiz(chapter.id)}
                    className={`${secondaryButtonClass} px-4 py-2`}
                  >
                    Generate quiz
                  </button>
                )}
              </div>
            );
          });
          })()}
        </div>
      </div>
    </main>
  );
}
