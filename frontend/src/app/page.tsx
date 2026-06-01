'use client';

import { useState } from 'react';
import { createCourse, generateOutline, processCourse } from '@/lib/api';

export default function Home() {
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<any>(null);
  const [error, setError] = useState('');

  async function handleGenerate() {
    setLoading(true);
    setError('');
    setCourse(null);

    try {
      const created = await createCourse(playlistUrl);
      await processCourse(created.courseId);
      const outlined = await generateOutline(created.courseId);
      
      setCourse({
        courseId: created.courseId,
        ...outlined,
      });
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="space-y-4">
          <h1 className="text-4xl font-bold">Curriq</h1>
          <p className="text-gray-300">
            Turn a YouTube playlist into an adaptive AI course.
          </p>

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

          {error && (
            <div className="rounded-lg border border-red-500 bg-red-950 p-4 text-red-200">
              {error}
            </div>
          )}
        </section>

        {course?.outline && (
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">{course.outline.title}</h2>

            <div className="space-y-4">
              {course.outline.chapters.map((chapter: any) => (
                <div
                  key={chapter.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3"
                >
                  <h3 className="text-xl font-semibold">{chapter.title}</h3>
                  <p className="text-gray-300">{chapter.summary}</p>

                  <ul className="list-disc list-inside text-gray-300">
                    {chapter.learning_objectives.map((objective: string) => (
                      <li key={objective}>{objective}</li>
                    ))}
                  </ul>

                  <a
                    className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-white"
                    href={`/courses/${course.courseId}/chapters/${chapter.id}`}
                  >
                    Study chapter
                  </a>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}