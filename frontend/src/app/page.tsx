'use client';

import { useEffect, useState } from 'react';
import {
  createCourse,
  listCourses,
  getCourseStatus,
} from '@/lib/api';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import { configureAuth } from '@/lib/auth';

export default function Home() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState('');
  const [courses, setCourses] = useState<any[]>([]);

  async function loadCourses() {
    setLoadingCourses(true);

    try {
      const result = await listCourses();
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
      const status = await getCourseStatus(courseId);

      if (status.status === 'READY') {
        return;
      }

      if (status.status === 'FAILED') {
        throw new Error(status.errorMessage ?? 'Course generation failed');
      }

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error('Course generation timed out');
  }

  async function handleGenerate() {
    setLoading(true);
    setError('');

    try {
      const created = await createCourse(playlistUrl);
      setPlaylistUrl('');

      await waitForCourseReady(created.courseId);
      await loadCourses();
    } catch (e: any) {
      setError(
        e.message?.includes('Service Unavailable')
          ? 'Course was processed, but one of the AI generation steps temporarily failed. Please try again.'
          : e.message ?? 'Something went wrong',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    configureAuth();

    getCurrentUser()
      .then(() => loadCourses())
      .catch(() => {
        window.location.href = '/auth';
      });
  }, []);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-10">
        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">Curriq</h1>

              <p className="text-gray-300 mt-4">
                Turn a YouTube playlist into an adaptive AI course.
              </p>
            </div>

            <button
              className="text-sm text-gray-400 hover:text-white"
              onClick={async () => {
                await signOut();
                window.location.href = '/auth';
              }}
            >
              Sign out
            </button>
          </div>

          <div className="flex gap-3">
            <input
              className="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-4 py-3"
              placeholder="Paste YouTube playlist URL"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
            />

            <button
              className="rounded-lg bg-white text-black px-5 py-3 font-medium disabled:opacity-50"
              onClick={handleGenerate}
              disabled={loading || !playlistUrl}
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          </div>

          {loading && (
            <p className="text-sm text-gray-400">
              Generating course in the background. This may take a minute...
            </p>
          )}

          {error && (
            <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
              {error}
            </div>
          )}
        </section>

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

          {loadingCourses && (
            <p className="text-gray-400">Loading courses...</p>
          )}

          {!loadingCourses && courses.length === 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 text-gray-300">
              No courses yet. Paste a YouTube playlist above to create your
              first course.
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
                    <h3 className="text-lg font-semibold">
                      {course.title ?? 'Untitled course'}
                    </h3>

                    <p className="text-sm text-gray-400">
                      {course.playlistUrl}
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