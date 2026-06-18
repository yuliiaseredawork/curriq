import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

export function outlineKey(courseId: string) {
  return `courses/${courseId}/outline.json`;
}

export async function saveOutline(courseId: string, outline: unknown) {
  const key = outlineKey(courseId);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: JSON.stringify(outline, null, 2),
      ContentType: 'application/json',
    }),
  );

  return { key };
}

export async function loadOutline(courseId: string) {
  const key = outlineKey(courseId);

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
    }),
  );

  return JSON.parse(await obj.Body!.transformToString());
}

export function quizKey(courseId: string, chapterId: string) {
  return `courses/${courseId}/quizzes/${chapterId}.json`;
}

export async function saveQuiz(
  courseId: string,
  chapterId: string,
  quiz: unknown,
) {
  const key = quizKey(courseId, chapterId);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: JSON.stringify(quiz, null, 2),
      ContentType: 'application/json',
    }),
  );

  return { key };
}

export async function loadQuiz(courseId: string, chapterId: string) {
  const key = quizKey(courseId, chapterId);

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
    }),
  );

  return JSON.parse(await obj.Body!.transformToString());
}

export function manifestKey(courseId: string) {
  return `courses/${courseId}/manifest.json`;
}

export async function saveCourseManifest(
  courseId: string,
  manifest: unknown,
) {
  const key = manifestKey(courseId);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }),
  );

  return { key };
}

export async function loadCourseManifest(courseId: string) {
  const key = manifestKey(courseId);

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
    }),
  );

  return JSON.parse(await obj.Body!.transformToString());
}

// ---------------------------------------------------------------------------
// Per-chapter quiz generation status
//
// Background quiz generation fans out one Lambda per chapter. To avoid S3
// read-modify-write races on a single shared manifest, each chapter's status
// is its own object. loadQuizManifest() assembles them into the manifest shape
// the API returns, inferring READY from an existing quiz artifact when no
// status object is present yet (tolerant of pre-existing courses).
// ---------------------------------------------------------------------------

export type ChapterQuizStatus =
  | 'NOT_STARTED'
  | 'GENERATING'
  | 'READY'
  | 'FAILED';

export type ChapterQuizRecord = {
  chapterId: string;
  status: ChapterQuizStatus;
  questionCount?: number;
  errorMessage?: string;
  updatedAt?: string;
};

export function quizStatusKey(courseId: string, chapterId: string) {
  return `courses/${courseId}/quiz-status/${chapterId}.json`;
}

async function tryGetJson(key: string): Promise<any | null> {
  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.PROCESSED_BUCKET!,
        Key: key,
      }),
    );
    return JSON.parse(await obj.Body!.transformToString());
  } catch (e: any) {
    if (e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw e;
  }
}

export async function loadChapterQuizStatus(
  courseId: string,
  chapterId: string,
): Promise<ChapterQuizRecord | null> {
  return tryGetJson(quizStatusKey(courseId, chapterId));
}

export async function updateChapterQuizStatus(
  courseId: string,
  chapterId: string,
  patch: {
    status: ChapterQuizStatus;
    questionCount?: number;
    errorMessage?: string;
  },
): Promise<ChapterQuizRecord> {
  const record: ChapterQuizRecord = {
    chapterId,
    status: patch.status,
    updatedAt: new Date().toISOString(),
    ...(patch.questionCount !== undefined
      ? { questionCount: patch.questionCount }
      : {}),
    ...(patch.errorMessage !== undefined
      ? { errorMessage: patch.errorMessage }
      : {}),
  };

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: quizStatusKey(courseId, chapterId),
      Body: JSON.stringify(record, null, 2),
      ContentType: 'application/json',
    }),
  );

  return record;
}

/**
 * Assemble the course-level quiz manifest from per-chapter status objects.
 * Tolerant: if a chapter has no status object yet, infer READY from an
 * existing quiz artifact, otherwise NOT_STARTED.
 */
export async function loadQuizManifest(
  courseId: string,
  chapterIds: string[],
): Promise<{
  courseId: string;
  updatedAt: string;
  chapters: Record<string, ChapterQuizRecord>;
}> {
  const chapters: Record<string, ChapterQuizRecord> = {};
  let latest = '';

  for (const chapterId of chapterIds) {
    let record = await loadChapterQuizStatus(courseId, chapterId);

    if (!record) {
      const quiz = await tryGetJson(quizKey(courseId, chapterId));
      record = quiz
        ? {
            chapterId,
            status: 'READY',
            questionCount: quiz.questions?.length ?? 0,
          }
        : { chapterId, status: 'NOT_STARTED' };
    }

    chapters[chapterId] = record;
    if (record.updatedAt && record.updatedAt > latest) {
      latest = record.updatedAt;
    }
  }

  return {
    courseId,
    updatedAt: latest || new Date().toISOString(),
    chapters,
  };
}

export function practiceKey(courseId: string, practiceId: string) {
  return `courses/${courseId}/practice/${practiceId}.json`;
}

export async function savePractice(
  courseId: string,
  practiceId: string,
  practice: unknown,
) {
  const key = practiceKey(courseId, practiceId);

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
      Body: JSON.stringify(practice, null, 2),
      ContentType: 'application/json',
    }),
  );

  return { key };
}

export async function loadPractice(courseId: string, practiceId: string) {
  const key = practiceKey(courseId, practiceId);

  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.PROCESSED_BUCKET!,
      Key: key,
    }),
  );

  return JSON.parse(await obj.Body!.transformToString());
}