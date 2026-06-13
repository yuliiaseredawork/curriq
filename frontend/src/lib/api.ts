import { fetchAuthSession } from 'aws-amplify/auth';
import { configureAuth } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function authHeaders() {
  configureAuth();

  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();

  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function getCourseStatus(courseId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}/status`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function createCourse(playlistUrl: string) {
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ playlistUrl }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function generateOutline(courseId: string) {
  const res = await fetch(`${API_URL}/outline`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ courseId, limit: 5 }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getCourse(courseId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function generateQuiz(courseId: string, chapterId: string) {
  const res = await fetch(`${API_URL}/quizzes`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ courseId, chapterId, limit: 10 }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getQuiz(courseId: string, chapterId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}/quizzes/${chapterId}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getNextQuestion(input: {
  userId: string;
  courseId: string;
  chapterId: string;
}) {
  const res = await fetch(`${API_URL}/study/next`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function submitAnswer(input: {
  userId: string;
  courseId: string;
  chapterId: string;
  questionId: string;
  userAnswer: string;
}) {
  const res = await fetch(`${API_URL}/study/answer`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function processCourse(courseId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}/process`, {
    method: 'POST',
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function listCourses() {
  const res = await fetch(`${API_URL}/courses`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getCourseProgress(courseId: string, userId = 'demo-user') {
  const res = await fetch(`${API_URL}/courses/${courseId}/progress?userId=${encodeURIComponent(userId)}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getResume(courseId: string, userId = 'demo-user') {
  const res = await fetch(`${API_URL}/courses/${courseId}/resume?userId=${encodeURIComponent(userId)}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getWeakConcepts(courseId: string, userId = 'demo-user') {
  const res = await fetch(`${API_URL}/courses/${courseId}/weak-concepts?userId=${encodeURIComponent(userId)}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function generatePractice(input: {
  courseId: string;
  concept: string;
  limit?: number;
}) {
  const res = await fetch(`${API_URL}/practice`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      courseId: input.courseId,
      concept: input.concept,
      limit: input.limit ?? 5,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getPractice(courseId: string, practiceId: string) {
  const res = await fetch(`${API_URL}/practice/${courseId}/${practiceId}`, {
    headers: await authHeaders(),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}