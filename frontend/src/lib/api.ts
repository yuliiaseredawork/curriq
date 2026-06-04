const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function createCourse(playlistUrl: string) {
  const res = await fetch(`${API_URL}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, limit: 5 }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getCourse(courseId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}`);

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function generateQuiz(courseId: string, chapterId: string) {
  const res = await fetch(`${API_URL}/quizzes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, chapterId, limit: 10 }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function getQuiz(courseId: string, chapterId: string) {
  const res = await fetch(`${API_URL}/courses/${courseId}/quizzes/${chapterId}`);

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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

export async function listCourses() {
  const res = await fetch(`${API_URL}/courses`);

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}