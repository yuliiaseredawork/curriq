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