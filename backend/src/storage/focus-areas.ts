// Focus Areas V2 storage: per-user concept mastery records and resumable
// practice sessions in the FocusAreas DynamoDB table. Mirrors the pk/sk style
// of study-state.ts.
//
//   Mastery: pk=USER#<userId>  sk=COURSE#<courseId>#MASTERY#<slug>
//   Session: pk=USER#<userId>  sk=COURSE#<courseId>#SESSION#<slug>

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import type { ConceptState, MasteryHistoryPoint } from '../courses/mastery';
import { applySessionResult } from '../courses/mastery';
import { schedule, initialSm2, type ReviewQuality } from '../courses/sm2';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.FOCUS_AREAS_TABLE!;

export type MasteryRecord = {
  userId: string;
  courseId: string;
  concept: string;
  conceptSlug: string;
  state: ConceptState;
  masteryScore: number;
  mistakeCount: number;
  remediationReady: boolean;
  completedSessions: number;
  lastPracticedAt?: string;
  history: MasteryHistoryPoint[];
  updatedAt: string;
  // Focus Areas V2.1 — canonical (consolidated) focus areas.
  isCanonical?: boolean;
  title?: string;
  shortDescription?: string;
  whyItMatters?: string;
  rawConcepts?: string[];
  priority?: number;
  // SM-2 spaced-repetition scheduling (lazily initialized on first review).
  repetitions?: number;
  intervalDays?: number;
  easeFactor?: number;
  successCount?: number;
  failureCount?: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
};

export type SessionRecord = {
  userId: string;
  courseId: string;
  conceptSlug: string;
  sessionId: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  currentQuestionIndex: number;
  completedQuestions: Array<{ questionId: string; score: number }>;
  score: number;
  startedAt: string;
  updatedAt: string;
};

const masterySk = (courseId: string, slug: string) =>
  `COURSE#${courseId}#MASTERY#${slug}`;
const sessionSk = (courseId: string, slug: string) =>
  `COURSE#${courseId}#SESSION#${slug}`;

export async function getMastery(
  userId: string,
  courseId: string,
  slug: string,
): Promise<MasteryRecord | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}`, sk: masterySk(courseId, slug) },
    }),
  );
  return (res.Item as MasteryRecord) ?? null;
}

export async function putMastery(record: MasteryRecord) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: `USER#${record.userId}`,
        sk: masterySk(record.courseId, record.conceptSlug),
        ...record,
      },
    }),
  );
  return record;
}

export async function listMastery(
  userId: string,
  courseId: string,
): Promise<MasteryRecord[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':prefix': `COURSE#${courseId}#MASTERY#`,
      },
    }),
  );
  return (res.Items as MasteryRecord[]) ?? [];
}

export async function getSession(
  userId: string,
  courseId: string,
  slug: string,
): Promise<SessionRecord | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}`, sk: sessionSk(courseId, slug) },
    }),
  );
  return (res.Item as SessionRecord) ?? null;
}

export async function putSession(record: SessionRecord) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: `USER#${record.userId}`,
        sk: sessionSk(record.courseId, record.conceptSlug),
        ...record,
      },
    }),
  );
  return record;
}

// ---------------------------------------------------------------------------
// Spaced repetition (SM-2) over canonical concepts.
// ---------------------------------------------------------------------------

/**
 * A concept is due when its scheduled review time has passed. Concepts never
 * reviewed are due (the backlog) unless already mastered.
 */
export function isDue(r: MasteryRecord, now: Date = new Date()): boolean {
  if (r.nextReviewAt) return new Date(r.nextReviewAt).getTime() <= now.getTime();
  return r.state !== 'MASTERED';
}

/** Canonical concepts in a course that are due for review. */
export async function listDueConcepts(
  userId: string,
  courseId: string,
  now: Date = new Date(),
): Promise<MasteryRecord[]> {
  const records = await listMastery(userId, courseId);
  return records.filter((r) => r.isCanonical && isDue(r, now));
}

/** Apply an SM-2 review outcome to a concept record (returns the new record). */
export function applyReview(
  record: MasteryRecord,
  quality: ReviewQuality,
  now: Date = new Date(),
): MasteryRecord {
  const sm2 = schedule(
    {
      repetitions: record.repetitions ?? initialSm2.repetitions,
      intervalDays: record.intervalDays ?? initialSm2.intervalDays,
      easeFactor: record.easeFactor ?? initialSm2.easeFactor,
    },
    quality,
    now,
  );

  const success = quality >= 3;
  // Nudge mastery score using the same weighting as practice sessions.
  const reviewScore = quality === 0 ? 20 : quality === 3 ? 60 : quality === 4 ? 80 : 95;
  const { masteryScore, state } = applySessionResult(record.masteryScore ?? 30, reviewScore);
  const nowIso = now.toISOString();

  return {
    ...record,
    repetitions: sm2.repetitions,
    intervalDays: sm2.intervalDays,
    easeFactor: sm2.easeFactor,
    nextReviewAt: sm2.nextReviewAt,
    lastReviewedAt: nowIso,
    successCount: (record.successCount ?? 0) + (success ? 1 : 0),
    failureCount: (record.failureCount ?? 0) + (success ? 0 : 1),
    masteryScore,
    state,
    history: [...(record.history ?? []), { date: nowIso, score: masteryScore }],
    updatedAt: nowIso,
  };
}
