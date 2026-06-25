const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type GetToken = () => Promise<string | null>;

// A blocked-duplicate (409) carries the existing course so the UI can link to it.
export class DuplicateSourceError extends Error {
  code = 'DUPLICATE_SOURCE' as const;
  existingCourseId?: string;
  existingTitle?: string;
  constructor(message: string, existingCourseId?: string, existingTitle?: string) {
    super(message);
    this.name = 'DuplicateSourceError';
    this.existingCourseId = existingCourseId;
    this.existingTitle = existingTitle;
  }
}

async function throwForResponse(res: Response): Promise<never> {
  if (res.status === 409) {
    const body = await res.json().catch(() => ({} as any));
    if (body?.error === 'DUPLICATE_SOURCE') {
      throw new DuplicateSourceError(
        body.message ?? 'You already have a course from this source.',
        body.existingCourseId,
        body.existingTitle,
      );
    }
    throw new Error(body?.message ?? `HTTP 409`);
  }
  throw new Error((await res.text()) || `HTTP ${res.status}`);
}

async function authHeaders(getToken: GetToken): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export function createApiClient(getToken: GetToken) {
  const h = () => authHeaders(getToken);

  return {
    async getCourseStatus(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/status`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    // Accepts a YouTube playlist OR single-video URL (backend detects the type).
    // Optional targetDate (ISO) sets a mastery deadline.
    async createCourse(sourceUrl: string, targetDate?: string) {
      const res = await fetch(`${API_URL}/courses`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify(targetDate ? { sourceUrl, targetDate } : { sourceUrl }),
      });
      if (!res.ok) await throwForResponse(res);
      return res.json();
    },

    async getReviewsToday() {
      const res = await fetch(`${API_URL}/reviews/today`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    // Unified daily session: one prioritized queue + a goal summary.
    async getSessionToday(courseId?: string) {
      const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
      const res = await fetch(`${API_URL}/session/today${qs}`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async nextReview(courseId?: string) {
      const res = await fetch(`${API_URL}/reviews/next`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify(courseId ? { courseId } : {}),
      });
      return { status: res.status, body: await res.json() };
    },

    async answerReview(reviewId: string, answer: string) {
      const res = await fetch(`${API_URL}/reviews/answer`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ reviewId, answer }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getFlashcardsDue(courseId?: string) {
      const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
      const res = await fetch(`${API_URL}/flashcards/due${qs}`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async nextFlashcard(courseId?: string) {
      const res = await fetch(`${API_URL}/flashcards/next`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify(courseId ? { courseId } : {}),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async revealFlashcard(cardId: string, courseId: string) {
      const res = await fetch(`${API_URL}/flashcards/${encodeURIComponent(cardId)}/reveal`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async rateFlashcard(cardId: string, courseId: string, rating: string) {
      const res = await fetch(`${API_URL}/flashcards/${encodeURIComponent(cardId)}/rate`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ courseId, rating }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getRetention(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/retention`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async generateOutline(courseId: string) {
      const res = await fetch(`${API_URL}/outline`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ courseId, limit: 5 }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getCourse(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async generateQuiz(courseId: string, chapterId: string) {
      const res = await fetch(`${API_URL}/quizzes`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ courseId, chapterId, limit: 10 }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getQuiz(courseId: string, chapterId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/quizzes/${chapterId}`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getNextQuestion(input: { userId: string; courseId: string; chapterId: string }) {
      const res = await fetch(`${API_URL}/study/next`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async submitAnswer(input: {
      userId: string;
      courseId: string;
      chapterId: string;
      questionId: string;
      userAnswer: string;
    }) {
      const res = await fetch(`${API_URL}/study/answer`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async processCourse(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/process`, {
        method: 'POST',
        headers: await h(),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    // Re-run generation for a FAILED course (same course id, no duplicate).
    async retryCourse(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/retry`, {
        method: 'POST',
        headers: await h(),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async listCourses() {
      const res = await fetch(`${API_URL}/courses`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async requestPdfUploadUrl(fileName: string, contentType = 'application/pdf') {
      const res = await fetch(`${API_URL}/courses/pdf/upload-url`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ fileName, contentType }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    // Direct PUT to the presigned S3 URL (no app auth header).
    async uploadFileToPresignedUrl(uploadUrl: string, file: File) {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
    },

    async completePdfCourse(courseId: string, fileName: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/pdf/complete`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ fileName }),
      });
      if (!res.ok) await throwForResponse(res);
      return res.json();
    },

    async getFocusAreas(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/focus-areas`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async startFocusSession(courseId: string, conceptSlug: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/focus-areas/${encodeURIComponent(conceptSlug)}/session`,
        { method: 'POST', headers: await h() },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return { status: res.status, body: await res.json() };
    },

    async submitFocusAnswer(
      courseId: string,
      conceptSlug: string,
      input: { questionId: string; userAnswer: string },
    ) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/focus-areas/${encodeURIComponent(conceptSlug)}/answer`,
        { method: 'POST', headers: await h(), body: JSON.stringify(input) },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getQuizStatus(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/quiz-status`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async retryChapterQuiz(courseId: string, chapterId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/chapters/${chapterId}/quiz/retry`,
        { method: 'POST', headers: await h() },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getCourseProgress(courseId: string, userId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/progress?userId=${encodeURIComponent(userId)}`,
        { headers: await h() },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getResume(courseId: string, userId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/resume?userId=${encodeURIComponent(userId)}`,
        { headers: await h() },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getWeakConcepts(courseId: string, userId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/weak-concepts?userId=${encodeURIComponent(userId)}`,
        { headers: await h() },
      );
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async generatePractice(input: { courseId: string; concept: string; limit?: number }) {
      const res = await fetch(`${API_URL}/practice`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ courseId: input.courseId, concept: input.concept, limit: input.limit ?? 5 }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },

    async getPractice(courseId: string, practiceId: string) {
      const res = await fetch(`${API_URL}/practice/${courseId}/${practiceId}`, { headers: await h() });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      return res.json();
    },
  };
}
