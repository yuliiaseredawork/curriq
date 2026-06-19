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
