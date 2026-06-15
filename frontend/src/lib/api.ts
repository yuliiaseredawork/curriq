const API_URL = process.env.NEXT_PUBLIC_API_URL!;

type GetToken = () => Promise<string | null>;

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

    async createCourse(playlistUrl: string) {
      const res = await fetch(`${API_URL}/courses`, {
        method: 'POST',
        headers: await h(),
        body: JSON.stringify({ playlistUrl }),
      });
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

    async listCourses() {
      const res = await fetch(`${API_URL}/courses`, { headers: await h() });
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
