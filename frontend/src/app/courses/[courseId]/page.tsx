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
} from '@/lib/learnerCopy';
import { sessionHref } from '@/lib/sessionScope';

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
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto">
          <a href="/" className="text-blue-400">
            ← My Courses
          </a>
          <div className="mt-6 rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        Loading...
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
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/" className="text-blue-400">
          ← My Courses
        </a>

        {(() => {
          const id = courseIdentity(course.outline.title);
          return (
            <div className="flex items-center gap-3">
              <span className={`shrink-0 rounded-lg border ${id.accentClass} px-3 py-1.5 text-2xl`}>
                {id.icon}
              </span>
              <div>
                <div className={`text-xs uppercase tracking-wide ${id.accentClass.split(' ').find((x) => x.startsWith('text-')) ?? 'text-gray-400'}`}>
                  {id.category}
                </div>
                <h1 className="text-3xl font-bold">{course.outline.title}</h1>
              </div>
            </div>
          );
        })()}

        {/* Above the fold: introduce the learning path (new) or resume it (started). */}
        {(() => {
          const hasChapters = (course.outline.chapters?.length ?? 0) > 0;
          const hero = courseHero({ started, hasChapters });
          return (
            <div className="space-y-3">
              <div>
                <h2 className="text-2xl font-semibold">{hero.title}</h2>
                <p className="mt-1 text-sm text-gray-400">{hero.subtitle}</p>
              </div>
              {started && (
                <p className="text-sm text-gray-300">
                  {progressView.headline} · {progressView.status}
                </p>
              )}
              <button
                className="rounded-lg bg-white text-black px-5 py-3 font-medium"
                onClick={handleContinue}
              >
                {hero.ctaLabel}
              </button>
            </div>
          );
        })()}

        {/* Progress + metrics only matter once the learner has started — a
            brand-new course shows the path instead of empty analytics. */}
        {started && (progress || retention) && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <div>
              <div className="text-sm text-gray-400">Learning progress</div>
              <div className="text-2xl font-semibold">{progressView.headline}</div>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${progressView.pct}%` }} />
            </div>
            <div className="text-sm text-gray-400">{progressView.status}</div>
          </div>
        )}

        {started && (course.metadata?.targetDate || retention || cardsDue) && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 grid grid-cols-2 gap-4 sm:grid-cols-5 text-sm">
            {cardsDue != null && cardsDue > 0 && (
              <div>
                <div className="text-xs text-gray-500">Reviews due</div>
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
                    <div className="text-xs text-gray-500">{perDay} reviews/day</div>
                  )}
                  {daysLeft >= 0 && retention && (
                    <div className={`text-xs ${onTrack ? 'text-green-400' : 'text-yellow-400'}`}>
                      {onTrack ? 'On track' : 'Behind'}
                    </div>
                  )}
                </div>
              );
            })()}
            {retention && (
              <>
                <div>
                  <div className="text-xs text-gray-500">Retention</div>
                  <div className="text-lg font-semibold">{retention.retentionScore}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Mastered / Learning</div>
                  <div className="text-lg font-semibold">
                    {retention.mastered} / {retention.learning}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Forgotten</div>
                  <div className="text-lg font-semibold text-yellow-400">{retention.forgotten}</div>
                </div>
              </>
            )}
          </div>
        )}

        {(focusAreas.length > 0 || focusPreparing) && (
          <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-5 space-y-3">
            <div>
              <div className="text-sm text-yellow-300">Focus areas</div>
              <h2 className="text-xl font-semibold">What to work on next</h2>
            </div>

            {focusPreparing && focusAreas.length === 0 && (
              <p className="text-sm text-gray-300">
                Analyzing your mistakes to find your key learning gaps…
              </p>
            )}

            <div className="space-y-3">
              {(showMore ? focusAreas : focusAreas.slice(0, 5)).map((item) => {
                const inProgress = item.sessionStatus === 'IN_PROGRESS';
                const trendStr =
                  item.trend > 0 ? `+${item.trend}%` : item.trend < 0 ? `${item.trend}%` : null;
                return (
                  <div
                    key={item.conceptSlug}
                    className="flex items-start justify-between gap-3 rounded-lg bg-gray-950 border border-gray-800 px-4 py-3"
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
                        Mastery {item.masteryScore}%
                        {trendStr && (
                          <span className={item.trend >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {' '}· {trendStr} this week
                          </span>
                        )}
                        {item.lastPracticedAt && (
                          <span> · last practiced {new Date(item.lastPracticedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      <div className="h-1.5 w-40 rounded-full bg-gray-800 overflow-hidden">
                        <div className="h-full bg-yellow-400" style={{ width: `${item.masteryScore}%` }} />
                      </div>
                      {item.rawConcepts?.length > 0 && (
                        <div className="text-xs text-gray-600">
                          Covers: {item.rawConcepts.join(', ')}
                        </div>
                      )}
                    </div>
                    <button
                      className="shrink-0 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
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

            {focusAreas.length > 5 && (
              <button
                className="text-sm text-yellow-300"
                onClick={() => setShowMore((s) => !s)}
              >
                {showMore ? 'Show fewer' : `More areas to review (${focusAreas.length - 5})`}
              </button>
            )}
          </div>
        )}

        {masteredAreas.length > 0 && (
          <div className="rounded-xl border border-green-900 bg-green-950/20 p-4">
            <button
              className="text-sm text-green-300"
              onClick={() => setShowMastered((s) => !s)}
            >
              {showMastered ? '▾' : '▸'} Mastered concepts ({masteredAreas.length})
            </button>
            {showMastered && (
              <div className="mt-3 space-y-2">
                {masteredAreas.map((item) => (
                  <div
                    key={item.conceptSlug}
                    className="flex items-center justify-between rounded-lg bg-gray-950 border border-gray-800 px-4 py-2 text-sm"
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="text-green-400">Mastery {item.masteryScore}% ✓</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
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
                ? 'border-red-700 text-red-300'
                : quizState === 'GENERATING'
                  ? 'border-blue-700 text-blue-300'
                  : 'border-gray-700 text-gray-300';

            return (
              <div
                key={chapter.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Chapter {i + 1}
                    </div>
                    <h2 className="text-xl font-semibold">{chapter.title}</h2>
                  </div>
                  {badge && (
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${badgeCls}`}>
                      {badge.text}
                    </span>
                  )}
                </div>
                {chapter.learning_objectives?.length ? (
                  <div className="space-y-1">
                    <div className="text-sm text-gray-400">{CHAPTER_OUTCOMES_INTRO}</div>
                    <ul className="list-disc pl-5 text-sm text-gray-300 space-y-0.5">
                      {chapter.learning_objectives.map((obj: string, oi: number) => (
                        <li key={oi}>{obj}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
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
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${chapterProgress.completionPercent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* All chapter CTAs route to the same scoped session, so only
                    the "Start here" chapter shows the prominent entry button. */}
                {quizState === 'READY' && isStartHere && (
                  <a
                    href={sessionHref(courseId)}
                    className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-white"
                  >
                    {buttonLabel}
                  </a>
                )}

                {quizState === 'GENERATING' && (
                  <button
                    disabled
                    className="inline-block rounded-lg bg-gray-700 px-4 py-2 text-gray-300 cursor-not-allowed"
                  >
                    Generating quiz…
                  </button>
                )}

                {quizState === 'FAILED' && (
                  <button
                    onClick={() => handleRetryQuiz(chapter.id)}
                    className="inline-block rounded-lg bg-red-500 px-4 py-2 text-white"
                  >
                    Retry quiz
                  </button>
                )}

                {quizState === 'NOT_STARTED' && (
                  <button
                    onClick={() => handleRetryQuiz(chapter.id)}
                    className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-white"
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
