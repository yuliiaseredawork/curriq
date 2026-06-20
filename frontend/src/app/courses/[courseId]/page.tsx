'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { ScannableText } from '@/components/ScannableText';
import { extractKeyTerms, titleTerms } from '@/lib/highlightTerms';

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
  const [resumeLoading, setResumeLoading] = useState(false);
  const [focusAreas, setFocusAreas] = useState<any[]>([]);
  const [masteredAreas, setMasteredAreas] = useState<any[]>([]);
  const [focusPreparing, setFocusPreparing] = useState(false);
  const [showMastered, setShowMastered] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [quizStatus, setQuizStatus] = useState<Record<string, any>>({});

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

  async function handleContinue() {
    if (!userId) return;
    setResumeLoading(true);
    setError('');
    try {
      const resume = await api.getResume(courseId, userId);
      if (resume.status === 'CONTINUE' || resume.status === 'QUIZ_NOT_READY') {
        router.push(`/courses/${courseId}/chapters/${resume.chapterId}`);
        return;
      }
      if (resume.status === 'COMPLETED') {
        setError('You completed all generated quizzes for this course.');
        return;
      }
      setError('Could not find where to continue.');
    } catch (e: any) {
      setError(e.message ?? 'Failed to resume course');
    } finally {
      setResumeLoading(false);
    }
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

        <h1 className="text-3xl font-bold">{course.outline.title}</h1>

        {progress && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400">Course progress</div>
                <div className="text-2xl font-semibold">
                  {progress.completionPercent}%
                </div>
              </div>
              <div className="text-sm text-gray-400">
                {progress.answeredQuestions} / {progress.totalQuestions} questions
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${progress.completionPercent}%` }}
              />
            </div>
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

        <button
          className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
          onClick={handleContinue}
          disabled={resumeLoading}
        >
          {resumeLoading ? 'Finding next lesson...' : 'Continue learning'}
        </button>

        <div className="space-y-4">
          {course.outline.chapters.map((chapter: any) => {
            const chapterProgress = progress?.chapters?.find(
              (p: any) => p.chapterId === chapter.id,
            );

            const quiz = quizStatus[chapter.id];
            const quizState = quiz?.status ?? 'NOT_STARTED';

            const buttonLabel =
              chapterProgress?.status === 'COMPLETED'
                ? 'Review chapter'
                : chapterProgress?.status === 'IN_PROGRESS'
                  ? 'Continue chapter'
                  : 'Study chapter';

            const badge = {
              READY: { text: 'Quiz ready', cls: 'border-green-700 text-green-300' },
              GENERATING: { text: 'Generating quiz…', cls: 'border-blue-700 text-blue-300' },
              FAILED: { text: 'Quiz failed', cls: 'border-red-700 text-red-300' },
              NOT_STARTED: { text: 'Quiz not started', cls: 'border-gray-700 text-gray-400' },
            }[quizState as 'READY' | 'GENERATING' | 'FAILED' | 'NOT_STARTED'];

            return (
              <div
                key={chapter.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold">{chapter.title}</h2>
                  {badge && (
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${badge.cls}`}>
                      {badge.text}
                    </span>
                  )}
                </div>
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

                {chapterProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>{chapterProgress.status}</span>
                      <span>
                        {chapterProgress.totalQuestions > 0
                          ? `${chapterProgress.answeredQuestions} / ${chapterProgress.totalQuestions} questions`
                          : 'Quiz not generated yet. Start studying to generate quizzes'}
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

                {quizState === 'READY' && (
                  <a
                    href={`/courses/${courseId}/chapters/${chapter.id}`}
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
          })}
        </div>
      </div>
    </main>
  );
}
