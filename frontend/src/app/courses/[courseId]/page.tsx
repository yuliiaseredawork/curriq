'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useUser } from '@clerk/nextjs';
import { createApiClient } from '@/lib/api';

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
  const [weakConcepts, setWeakConcepts] = useState<any[]>([]);
  const [practiceLoadingConcept, setPracticeLoadingConcept] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoaded || !userLoaded || !userId) return;

    Promise.all([
      api.getCourse(courseId),
      api.getCourseProgress(courseId, userId),
      api.getWeakConcepts(courseId, userId),
    ])
      .then(([courseResult, progressResult, weakConceptsResult]) => {
        setCourse(courseResult);
        setProgress(progressResult);
        setWeakConcepts(weakConceptsResult.weakConcepts ?? []);
      })
      .catch((e) => setError(e.message ?? 'Failed to load course'));
  }, [courseId, authLoaded, userLoaded, userId]);

  async function handlePracticeConcept(concept: string) {
    setPracticeLoadingConcept(concept);
    setError('');
    try {
      const result = await api.generatePractice({ courseId, concept, limit: 5 });
      router.push(`/courses/${courseId}/practice/${result.practiceId}`);
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate practice');
    } finally {
      setPracticeLoadingConcept(null);
    }
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

        {weakConcepts.length > 0 && (
          <div className="rounded-xl border border-yellow-800 bg-yellow-950/30 p-5 space-y-3">
            <div>
              <div className="text-sm text-yellow-300">Focus areas</div>
              <h2 className="text-xl font-semibold">Concepts to review</h2>
            </div>
            <div className="space-y-2">
              {weakConcepts.map((item) => (
                <div
                  key={item.concept}
                  className="flex items-center justify-between rounded-lg bg-gray-950 border border-gray-800 px-4 py-3"
                >
                  <span>{item.concept}</span>
                  <span className="text-sm text-gray-400">
                    {item.mistakeCount} mistake{item.mistakeCount === 1 ? '' : 's'}
                  </span>
                  <button
                    className="rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
                    onClick={() => handlePracticeConcept(item.concept)}
                    disabled={practiceLoadingConcept === item.concept}
                  >
                    {practiceLoadingConcept === item.concept ? 'Generating...' : 'Practice'}
                  </button>
                </div>
              ))}
            </div>
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

            const buttonLabel =
              chapterProgress?.status === 'COMPLETED'
                ? 'Review chapter'
                : chapterProgress?.status === 'IN_PROGRESS'
                  ? 'Continue chapter'
                  : 'Study chapter';

            return (
              <div
                key={chapter.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-3"
              >
                <h2 className="text-xl font-semibold">{chapter.title}</h2>
                <p className="text-gray-300">{chapter.summary}</p>

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

                <a
                  href={`/courses/${courseId}/chapters/${chapter.id}`}
                  className="inline-block rounded-lg bg-blue-500 px-4 py-2 text-white"
                >
                  {buttonLabel}
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
