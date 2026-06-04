'use client';

import { use, useEffect, useState } from 'react';
import { getCourse } from '@/lib/api';

export default function CoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);

  const [course, setCourse] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCourse(courseId)
      .then(setCourse)
      .catch((e) => setError(e.message ?? 'Failed to load course'));
  }, [courseId]);

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="text-red-300">{error}</div>
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

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <a href="/" className="text-blue-400">
          ← My Courses
        </a>

        <h1 className="text-3xl font-bold">
          {course.outline.title}
        </h1>

        <div className="space-y-4">
          {course.outline.chapters.map((chapter: any) => (
            <div
              key={chapter.id}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3"
            >
              <h2 className="text-xl font-semibold">{chapter.title}</h2>
              <p className="text-gray-300">{chapter.summary}</p>

              <a
                href={`/courses/${courseId}/chapters/${chapter.id}`}
                className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-white"
              >
                Study chapter
              </a>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}