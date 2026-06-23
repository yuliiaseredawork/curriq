'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser, useClerk } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';
import { courseIdentity } from '@/lib/courseIdentity';

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

  async function waitForCourseReady(courseId: string) {
    const maxAttempts = 60;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await api.getCourseStatus(courseId);
      if (status.status === 'READY') return;
      if (status.status === 'FAILED') throw new Error(status.errorMessage ?? 'Course generation failed');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error('Course generation timed out');
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');
    try {
      const created = await api.createCourse(playlistUrl, computeTargetDate());
      setPlaylistUrl('');
      await waitForCourseReady(created.courseId);
      await loadCourses();
      await loadToday();
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload() {
    if (!pdfFile) return;
    setLoading(true);
    setError('');
    setPdfStatus('Uploading PDF…');
    try {
      const reserved = await api.requestPdfUploadUrl(
        pdfFile.name,
        pdfFile.type || 'application/pdf',
      );
      await api.uploadFileToPresignedUrl(reserved.uploadUrl, pdfFile);
      setPdfStatus('Processing PDF & generating outline…');
      await api.completePdfCourse(reserved.courseId);
      await waitForCourseReady(reserved.courseId);
      setPdfStatus('Quizzes generating in background.');
      setPdfFile(null);
      await loadCourses();
    } catch (e: any) {
      setError(e.message ?? 'PDF course generation failed');
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

  // Wait for Clerk before rendering anything that calls the API.
  if (!isLoaded || !isSignedIn) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">Curriq</h1>
              <p className="text-gray-300 mt-4">
                Turn a YouTube playlist or a PDF into an adaptive AI course.
              </p>
            </div>

            <div className="text-right space-y-1 shrink-0">
              {userEmail && (
                <p className="text-sm text-gray-400">Signed in as {userEmail}</p>
              )}
              <button
                className="text-sm text-gray-400 hover:text-white"
                onClick={() => signOut({ redirectUrl: '/sign-in' })}
              >
                Sign out
              </button>
            </div>
          </div>

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
                  {loading ? 'Generating...' : 'Generate course'}
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
                {loading ? 'Working…' : 'Upload and generate course'}
              </button>
            </div>
          )}

          {loading && (
            <p className="text-sm text-gray-400">
              {sourceTab === 'pdf' && pdfStatus
                ? pdfStatus
                : 'Generating course in the background. This may take a minute...'}
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
              {error}
            </div>
          )}
        </section>

        {session?.goal?.taskCount > 0 && (
          <section className="rounded-xl border border-blue-900 bg-blue-950/30 p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="text-sm text-blue-300">Today&apos;s Goal</div>
                <h2 className="text-2xl font-semibold">{session.goal.name}</h2>
                <div className="text-gray-300">
                  {session.goal.taskCount} task{session.goal.taskCount === 1 ? '' : 's'} · ~
                  {session.goal.estimatedMinutes} min
                </div>
                {session.goal.deadline && (
                  <div className="text-xs text-gray-400">
                    Deadline {new Date(session.goal.deadline.targetDate).toLocaleDateString()}
                    {session.goal.deadline.daysRemaining != null && (
                      <span className={session.goal.deadline.daysRemaining < 0 ? 'text-red-400' : ''}>
                        {' '}·{' '}
                        {session.goal.deadline.daysRemaining < 0
                          ? 'overdue'
                          : `${session.goal.deadline.daysRemaining} days left`}
                      </span>
                    )}
                    <span className={session.goal.deadline.onTrack ? 'text-green-400' : 'text-yellow-400'}>
                      {' '}· {session.goal.deadline.onTrack ? 'On track' : 'Behind'}
                    </span>
                    {session.goal.deadline.recommendedReviewsPerDay > 0 && (
                      <span> · {session.goal.deadline.recommendedReviewsPerDay}/day target</span>
                    )}
                  </div>
                )}
              </div>
              <a
                href="/session"
                className="shrink-0 rounded-lg bg-blue-500 px-5 py-3 text-sm font-medium text-white"
              >
                Start Session
              </a>
            </div>

            {session.goal.byCourse?.length > 1 && (
              <div className="space-y-2">
                <button
                  className="text-sm text-blue-300"
                  onClick={() => setShowBreakdown((s) => !s)}
                >
                  {showBreakdown ? '▾ Hide breakdown' : '▸ Per-course breakdown'}
                </button>
                {showBreakdown && (
                  <div className="space-y-2">
                    {session.goal.byCourse.map((co: any) => (
                      <div
                        key={co.courseId}
                        className="flex items-center justify-between rounded-lg bg-gray-950 border border-gray-800 px-4 py-2 text-sm"
                      >
                        <span className="truncate">{co.courseTitle}</span>
                        <span className="shrink-0 text-gray-300">{co.taskCount} task{co.taskCount === 1 ? '' : 's'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">My Courses</h2>
            <button
              className="text-sm text-blue-400 hover:text-blue-300"
              onClick={loadCourses}
              disabled={loadingCourses}
            >
              Refresh
            </button>
          </div>

          {loadingCourses && <p className="text-gray-400">Loading courses...</p>}

          {!loadingCourses && courses.length === 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-gray-300">
              No courses yet. Paste a YouTube playlist or video URL above to create your first course.
            </div>
          )}

          <div className="space-y-3">
            {courses.map((course) => (
              <a
                key={course.courseId}
                href={`/courses/${course.courseId}`}
                className="block rounded-xl border border-gray-800 bg-gray-900 p-5 hover:bg-gray-800 transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const id = courseIdentity(course.title);
                        return (
                          <span
                            className={`shrink-0 rounded-lg border ${id.accentClass} px-2 py-0.5 text-sm`}
                            title={id.category}
                          >
                            {id.icon}
                          </span>
                        );
                      })()}
                      <h3 className="text-lg font-semibold">
                        {course.title ?? 'Untitled course'}
                      </h3>
                      <span className="shrink-0 rounded-full border border-gray-700 px-2 py-0.5 text-xs text-gray-400">
                        {course.sourceType === 'PDF'
                          ? 'PDF'
                          : course.sourceType === 'YOUTUBE_VIDEO'
                            ? 'YouTube video'
                            : 'YouTube playlist'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 break-all">
                      {course.sourceType === 'PDF'
                        ? course.sourceFileName
                        : course.sourceUrl ?? course.playlistUrl}
                    </p>
                  </div>
                  <span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
                    {course.status}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
