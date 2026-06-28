'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { createApiClient, DuplicateSourceError } from '@/lib/api';
import { CourseCard } from '@/components/CourseCard';
import {
  isCoursePending,
  homeMode,
  HOME_HERO_HEADLINE,
  HOME_VALUE_PROP,
  HOME_HERO_STEPS,
  TODAYS_PLAN_LABEL,
  CONTINUE_LEARNING_LABEL,
  primaryButtonClass,
  YOUR_COURSES_LABEL,
  CREATE_LEARNING_PATH_LABEL,
  CAUGHT_UP_TITLE,
  CAUGHT_UP_BODY,
} from '@/lib/learnerCopy';

export default function Home() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const api = createApiClient(getToken);

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<any[]>([]);
  const [sourceTab, setSourceTab] = useState<'youtube' | 'pdf'>('youtube');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStatus, setPdfStatus] = useState('');
  const [deadline, setDeadline] = useState<'none' | '1w' | '2w' | '1m' | 'custom'>('none');
  const [customDate, setCustomDate] = useState('');
  const [session, setSession] = useState<any>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ courseId?: string; title?: string } | null>(null);

  const userEmail = user?.primaryEmailAddress?.emailAddress ?? '';

  function computeTargetDate(): string | undefined {
    const days = deadline === '1w' ? 7 : deadline === '2w' ? 14 : deadline === '1m' ? 30 : 0;
    if (days > 0) return new Date(Date.now() + days * 86400000).toISOString();
    if (deadline === 'custom' && customDate) return new Date(customDate).toISOString();
    return undefined;
  }

  async function loadToday() {
    try {
      setSession(await api.getSessionToday().catch(() => null));
    } catch {
      // best-effort
    }
  }

  async function handleRetry(courseId: string) {
    setRetryingId(courseId);
    setError('');
    try {
      await api.retryCourse(courseId);
      await loadCourses();
    } catch (e: any) {
      setError(e.message ?? 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  }

  async function loadCourses() {
    setLoadingCourses(true);
    try {
      const result = await api.listCourses();
      setCourses(result.courses ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load courses');
    } finally {
      setLoadingCourses(false);
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setDuplicate(null);
    try {
      // POST /courses returns 202 immediately; generation runs server-side.
      // Show the new "Generating…" card now and let background polling finish.
      await api.createCourse(playlistUrl, computeTargetDate());
      setPlaylistUrl('');
      await loadCourses();
    } catch (e: any) {
      if (e instanceof DuplicateSourceError) {
        setDuplicate({ courseId: e.existingCourseId, title: e.existingTitle });
      } else {
        setError(e.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload() {
    if (!pdfFile) return;
    setLoading(true);
    setError('');
    setDuplicate(null);
    setPdfStatus('Uploading PDF…');
    try {
      const reserved = await api.requestPdfUploadUrl(
        pdfFile.name,
        pdfFile.type || 'application/pdf',
      );
      await api.uploadFileToPresignedUrl(reserved.uploadUrl, pdfFile);
      setPdfStatus('Starting course generation…');
      // Returns 202; the "Generating…" card + background polling take over.
      await api.completePdfCourse(reserved.courseId, pdfFile.name);
      setPdfFile(null);
      await loadCourses();
    } catch (e: any) {
      if (e instanceof DuplicateSourceError) {
        setDuplicate({ courseId: e.existingCourseId, title: e.existingTitle });
      } else {
        setError(e.message ?? 'PDF course generation failed');
      }
    } finally {
      setLoading(false);
      setPdfStatus('');
    }
  }

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.replace('/sign-in');
      return;
    }

    loadCourses();
    loadToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  // Background polling: while any course is still being generated, refresh the
  // list so "Generating…" cards flip to "Start learning" on their own. Stops
  // when nothing is pending (and refreshes the goal once) or after a safe cap.
  const hasPending = courses.some((c) => isCoursePending(c.status));
  const pollAttempts = useRef(0);
  useEffect(() => {
    if (!hasPending) return;
    pollAttempts.current = 0;
    const MAX_ATTEMPTS = 75; // ~5 min at 4s; then stop (manual Refresh remains).
    const interval = setInterval(() => {
      pollAttempts.current += 1;
      if (pollAttempts.current > MAX_ATTEMPTS) {
        clearInterval(interval);
        return;
      }
      loadCourses();
    }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending]);

  // When the last pending course settles, refresh today's goal once.
  const prevHasPending = useRef(hasPending);
  useEffect(() => {
    if (prevHasPending.current && !hasPending) loadToday();
    prevHasPending.current = hasPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending]);

  // Wait for Clerk before rendering anything that calls the API.
  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  const hasCourses = courses.length > 0;
  const mode = homeMode({ hasCourses, loadingCourses });
  const goal = session?.goal;
  const hasPlan = (goal?.taskCount ?? 0) > 0;

  // Single creation form, reused as the first-run primary action and as the
  // secondary "Add new material" panel for returning learners.
  const creationPanel = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            sourceTab === 'youtube'
              ? 'bg-white text-black'
              : 'bg-gray-900 text-gray-300 border border-gray-700'
          }`}
          onClick={() => setSourceTab('youtube')}
        >
          YouTube
        </button>
        <button
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            sourceTab === 'pdf'
              ? 'bg-white text-black'
              : 'bg-gray-900 text-gray-300 border border-gray-700'
          }`}
          onClick={() => setSourceTab('pdf')}
        >
          Upload PDF
        </button>
      </div>

      {sourceTab === 'youtube' ? (
        <div className="space-y-1">
          <div className="flex gap-3">
            <input
              className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-4 py-3"
              placeholder="Paste a YouTube playlist or single video URL"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
            />
            <button
              className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
              onClick={handleGenerate}
              disabled={loading || !playlistUrl}
            >
              {loading ? 'Creating…' : CREATE_LEARNING_PATH_LABEL}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Works with playlists, watch links, youtu.be links, Shorts, and embeds.
          </p>

          <div className="pt-2 space-y-1">
            <div className="text-sm text-gray-400">When do you want to master this topic?</div>
            <div className="flex flex-wrap gap-2">
              {([
                ['none', 'No deadline'],
                ['1w', '1 week'],
                ['2w', '2 weeks'],
                ['1m', '1 month'],
                ['custom', 'Custom date'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setDeadline(val)}
                  className={`rounded-lg px-3 py-1.5 text-sm ${
                    deadline === val
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-900 text-gray-300 border border-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
              {deadline === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-lg bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm"
                />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 items-center">
          <input
            type="file"
            accept="application/pdf"
            className="flex-1 text-sm text-gray-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-white"
            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
          />
          <button
            className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
            onClick={handlePdfUpload}
            disabled={loading || !pdfFile}
          >
            {loading ? 'Working…' : 'Upload & create path'}
          </button>
        </div>
      )}

      {loading && (
        <p className="text-sm text-gray-400">
          {sourceTab === 'pdf' && pdfStatus ? pdfStatus : 'Adding your course…'}
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">{error}</div>
      )}

      {duplicate && (
        <div className="rounded-lg border border-yellow-600 bg-yellow-950/40 p-4 text-yellow-100">
          You already have a course from this source.{' '}
          {duplicate.courseId ? (
            <a className="underline" href={`/courses/${duplicate.courseId}`}>
              Open {duplicate.title ?? 'the existing course'}
            </a>
          ) : (
            'Check your courses below.'
          )}
        </div>
      )}
    </div>
  );

  const planSection = (
    <section className="rounded-xl border border-blue-900 bg-blue-950/30 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm text-blue-300">{TODAYS_PLAN_LABEL}</div>
          <h2 className="text-2xl font-semibold">{goal?.name}</h2>
          <div className="text-gray-300">
            ~{goal?.estimatedMinutes} min today · {goal?.taskCount} to practice
          </div>
          {goal?.deadline && (
            <div className="text-xs text-gray-400">
              Deadline {new Date(goal.deadline.targetDate).toLocaleDateString()}
              {goal.deadline.daysRemaining != null && (
                <span className={goal.deadline.daysRemaining < 0 ? 'text-red-400' : ''}>
                  {' · '}
                  {goal.deadline.daysRemaining < 0
                    ? 'overdue'
                    : `${goal.deadline.daysRemaining} days left`}
                </span>
              )}
              <span className={goal.deadline.onTrack ? 'text-green-400' : 'text-yellow-400'}>
                {' · '}
                {goal.deadline.onTrack ? 'On track' : 'Behind'}
              </span>
            </div>
          )}
        </div>
        <a href="/session" className={`${primaryButtonClass} shrink-0 px-5 py-3 text-sm`}>
          {CONTINUE_LEARNING_LABEL}
        </a>
      </div>

      {goal?.byCourse?.length > 1 && (
        <div className="space-y-2">
          <button className="text-sm text-blue-300" onClick={() => setShowBreakdown((s) => !s)}>
            {showBreakdown ? '▾ Hide breakdown' : '▸ Per-course breakdown'}
          </button>
          {showBreakdown && (
            <div className="space-y-2">
              {goal.byCourse.map((co: any) => (
                <div
                  key={co.courseId}
                  className="flex items-center justify-between rounded-lg bg-gray-950 border border-gray-800 px-4 py-2 text-sm"
                >
                  <span className="truncate">{co.courseTitle}</span>
                  <span className="shrink-0 text-gray-300">
                    {co.taskCount} task{co.taskCount === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const caughtUpSection = (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
      <div className="text-lg font-semibold">{CAUGHT_UP_TITLE}</div>
      <p className="text-gray-400 mt-1">{CAUGHT_UP_BODY}</p>
    </section>
  );

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-bold">Curriq</h1>
          <div className="text-right space-y-1 shrink-0">
            {userEmail && <p className="text-sm text-gray-400">Signed in as {userEmail}</p>}
            <button
              className="text-sm text-gray-400 hover:text-white"
              onClick={() => signOut({ redirectUrl: '/sign-in' })}
            >
              Sign out
            </button>
          </div>
        </div>

        {mode === 'first-run' ? (
          <section className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold">{HOME_HERO_HEADLINE}</h2>
              <p className="text-gray-300">{HOME_VALUE_PROP}</p>
              <p className="text-sm text-gray-500">{HOME_HERO_STEPS}</p>
            </div>
            {creationPanel}
          </section>
        ) : (
          <>
            {hasCourses && (hasPlan ? planSection : caughtUpSection)}

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">{YOUR_COURSES_LABEL}</h2>
                <button
                  className="text-sm text-blue-400 hover:text-blue-300"
                  onClick={loadCourses}
                  disabled={loadingCourses}
                >
                  Refresh
                </button>
              </div>

              {loadingCourses && <p className="text-gray-400">Loading courses...</p>}

              <div className="space-y-3">
                {courses.map((course) => (
                  <CourseCard
                    key={course.courseId}
                    course={course}
                    onRetry={handleRetry}
                    retrying={retryingId === course.courseId}
                  />
                ))}
              </div>
            </section>

            {hasCourses && (
              <section className="space-y-3 border-t border-gray-800 pt-6">
                <h2 className="text-lg font-semibold text-gray-300">Add new material</h2>
                {creationPanel}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
