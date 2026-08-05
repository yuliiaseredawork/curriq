const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type GetToken = () => Promise<string | null>;

// A blocked-duplicate (409) carries the existing course so the UI can link to it.
export class DuplicateSourceError extends Error {
  code = "DUPLICATE_SOURCE" as const;
  existingCourseId?: string;
  existingTitle?: string;
  constructor(
    message: string,
    existingCourseId?: string,
    existingTitle?: string,
  ) {
    super(message);
    this.name = "DuplicateSourceError";
    this.existingCourseId = existingCourseId;
    this.existingTitle = existingTitle;
  }
}

async function throwForResponse(res: Response): Promise<never> {
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}) as any);
    if (body?.error === "DUPLICATE_SOURCE") {
      throw new DuplicateSourceError(
        body.message ?? "You already have a course from this source.",
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
  if (!token) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function createApiClient(getToken: GetToken) {
  const h = () => authHeaders(getToken);

  return {
    async getCourseStatus(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/status`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    // Accepts a YouTube playlist OR single-video URL (backend detects the type).
    // Optional targetDate (ISO) sets a mastery deadline.
    async createCourse(sourceUrl: string, targetDate?: string) {
      const res = await fetch(`${API_URL}/courses`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(
          targetDate ? { sourceUrl, targetDate } : { sourceUrl },
        ),
      });
      if (!res.ok) await throwForResponse(res);
      return res.json();
    },

    async getReviewsToday() {
      const res = await fetch(`${API_URL}/reviews/today`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    // Unified daily session: one prioritized queue + a goal summary. Optional
    // chapterId narrows it to a single chapter's practice questions.
    async getSessionToday(courseId?: string, chapterId?: string) {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (courseId && chapterId) params.set("chapterId", chapterId);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await fetch(`${API_URL}/session/today${qs}`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async nextReview(courseId?: string) {
      const res = await fetch(`${API_URL}/reviews/next`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(courseId ? { courseId } : {}),
      });
      return { status: res.status, body: await res.json() };
    },

    async answerReview(reviewId: string, answer: string) {
      const res = await fetch(`${API_URL}/reviews/answer`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ reviewId, answer }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getFlashcardsDue(courseId?: string) {
      const qs = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
      const res = await fetch(`${API_URL}/flashcards/due${qs}`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async nextFlashcard(courseId?: string) {
      const res = await fetch(`${API_URL}/flashcards/next`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(courseId ? { courseId } : {}),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async revealFlashcard(cardId: string, courseId: string) {
      const res = await fetch(
        `${API_URL}/flashcards/${encodeURIComponent(cardId)}/reveal`,
        {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({ courseId }),
        },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async rateFlashcard(cardId: string, courseId: string, rating: string) {
      const res = await fetch(
        `${API_URL}/flashcards/${encodeURIComponent(cardId)}/rate`,
        {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({ courseId, rating }),
        },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getRetention(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/retention`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async generateOutline(courseId: string) {
      const res = await fetch(`${API_URL}/outline`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ courseId, limit: 5 }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getCourse(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async generateQuiz(courseId: string, chapterId: string) {
      const res = await fetch(`${API_URL}/quizzes`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ courseId, chapterId, limit: 10 }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getQuiz(courseId: string, chapterId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/quizzes/${chapterId}`,
        { headers: await h() },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getNextQuestion(input: { courseId: string; chapterId: string }) {
      const res = await fetch(`${API_URL}/study/next`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async submitAnswer(input: {
      courseId: string;
      chapterId: string;
      questionId: string;
      userAnswer: string;
    }) {
      const res = await fetch(`${API_URL}/study/answer`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    // Re-run generation for a FAILED course (same course id, no duplicate).
    async retryCourse(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/retry`, {
        method: "POST",
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async listCourses() {
      const res = await fetch(`${API_URL}/courses`, { headers: await h() });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async requestPdfUploadUrl(
      fileName: string,
      contentType = "application/pdf",
    ) {
      const res = await fetch(`${API_URL}/courses/pdf/upload-url`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ fileName, contentType }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    // Browser upload using a policy-signed POST. The S3 policy enforces the
    // MIME type and maximum byte size before accepting any object.
    async uploadFileToPresignedPost(
      upload: { url: string; fields: Record<string, string> },
      file: File,
    ) {
      const form = new FormData();
      for (const [key, value] of Object.entries(upload.fields))
        form.append(key, value);
      form.append("file", file);
      const res = await fetch(upload.url, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
    },

    async completePdfCourse(courseId: string, fileName: string) {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const res = await fetch(`${API_URL}/courses/${courseId}/pdf/complete`, {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({ fileName }),
        });
        if (res.status === 425) {
          const retrySeconds = Number(res.headers.get("retry-after") ?? 5);
          await new Promise((resolve) =>
            setTimeout(resolve, retrySeconds * 1000),
          );
          continue;
        }
        if (!res.ok) await throwForResponse(res);
        return res.json();
      }
      throw new Error(
        "The security scan is taking longer than expected. Please try again shortly.",
      );
    },

    async getFocusAreas(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/focus-areas`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async startFocusSession(courseId: string, conceptSlug: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/focus-areas/${encodeURIComponent(conceptSlug)}/session`,
        { method: "POST", headers: await h() },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return { status: res.status, body: await res.json() };
    },

    async submitFocusAnswer(
      courseId: string,
      conceptSlug: string,
      input: { questionId: string; userAnswer: string },
    ) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/focus-areas/${encodeURIComponent(conceptSlug)}/answer`,
        { method: "POST", headers: await h(), body: JSON.stringify(input) },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getQuizStatus(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/quiz-status`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async retryChapterQuiz(courseId: string, chapterId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/chapters/${chapterId}/quiz/retry`,
        { method: "POST", headers: await h() },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getCourseProgress(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/progress`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getResume(courseId: string) {
      const res = await fetch(`${API_URL}/courses/${courseId}/resume`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getWeakConcepts(courseId: string, userId: string) {
      const res = await fetch(
        `${API_URL}/courses/${courseId}/weak-concepts?userId=${encodeURIComponent(userId)}`,
        { headers: await h() },
      );
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async generatePractice(input: {
      courseId: string;
      concept: string;
      limit?: number;
    }) {
      const res = await fetch(`${API_URL}/practice`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          courseId: input.courseId,
          concept: input.concept,
          limit: input.limit ?? 5,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getPractice(courseId: string, practiceId: string) {
      const res = await fetch(`${API_URL}/practice/${courseId}/${practiceId}`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async recordProductEvent(
      event: "session_started" | "session_completed",
      properties: Record<string, string | number | boolean> = {},
    ) {
      const res = await fetch(`${API_URL}/analytics/events`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ event, properties }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    },

    async submitFeedback(input: {
      kind: "feedback" | "support";
      message: string;
      path?: string;
    }) {
      const res = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async getAccount() {
      const res = await fetch(`${API_URL}/account`, { headers: await h() });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async exportAccountData() {
      const res = await fetch(`${API_URL}/account/export`, {
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.blob();
    },

    async setEmailSubscribed(subscribed: boolean) {
      const res = await fetch(`${API_URL}/account/email-preferences`, {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({ subscribed }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async deleteAccount() {
      const res = await fetch(`${API_URL}/account`, {
        method: "DELETE",
        headers: await h(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json();
    },

    async startSubscriptionCheckout() {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json() as Promise<{ url: string }>;
    },

    async openBillingPortal() {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: await h(),
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      return res.json() as Promise<{ url: string }>;
    },
  };
}
