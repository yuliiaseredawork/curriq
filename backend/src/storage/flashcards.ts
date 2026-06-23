// Durable flashcards with per-card SM-2 scheduling, stored in the FocusAreas
// DynamoDB table alongside mastery/session records:
//   pk=USER#<userId>  sk=COURSE#<courseId>#CARD#<cardId>

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { schedule, initialSm2, type ReviewQuality } from '../courses/sm2';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.FOCUS_AREAS_TABLE!;

export type CardType =
  | 'definition'
  | 'cloze'
  | 'scenario'
  | 'misconception'
  | 'comparison';

export type Flashcard = {
  cardId: string;
  userId: string;
  courseId: string;
  chapterId?: string;
  concept: string;
  conceptSlug: string;
  type: CardType;
  front: string;
  back: string;
  sourceChunkIds: string[];
  sourceQuote?: string;
  misconceptionTarget?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  createdAt: string;
  updatedAt: string;
  // SM-2 (per card)
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  successCount: number;
  failureCount: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'MASTERED';
};

const cardSk = (courseId: string, cardId: string) =>
  `COURSE#${courseId}#CARD#${cardId}`;

export async function putCard(card: Flashcard) {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: { pk: `USER#${card.userId}`, sk: cardSk(card.courseId, card.cardId), ...card },
    }),
  );
  return card;
}

export async function getCard(
  userId: string,
  courseId: string,
  cardId: string,
): Promise<Flashcard | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}`, sk: cardSk(courseId, cardId) },
    }),
  );
  return (res.Item as Flashcard) ?? null;
}

export async function listCards(
  userId: string,
  courseId: string,
): Promise<Flashcard[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':prefix': `COURSE#${courseId}#CARD#`,
      },
    }),
  );
  return (res.Items as Flashcard[]) ?? [];
}

export async function listCardsForConcept(
  userId: string,
  courseId: string,
  conceptSlug: string,
): Promise<Flashcard[]> {
  return (await listCards(userId, courseId)).filter((c) => c.conceptSlug === conceptSlug);
}

/** A card is due when its scheduled time has passed (new cards are due now). */
export function isCardDue(c: Flashcard, now: Date = new Date()): boolean {
  if (c.status !== 'ACTIVE') return false;
  if (!c.nextReviewAt) return true;
  return new Date(c.nextReviewAt).getTime() <= now.getTime();
}

/** Build a new card record with SM-2 defaults (due immediately). */
export function newCard(input: {
  cardId: string;
  userId: string;
  courseId: string;
  conceptSlug: string;
  concept: string;
  type: CardType;
  front: string;
  back: string;
  sourceChunkIds: string[];
  sourceQuote?: string;
  misconceptionTarget?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}): Flashcard {
  const now = new Date().toISOString();
  return {
    ...input,
    createdAt: now,
    updatedAt: now,
    repetitions: initialSm2.repetitions,
    intervalDays: initialSm2.intervalDays,
    easeFactor: initialSm2.easeFactor,
    successCount: 0,
    failureCount: 0,
    nextReviewAt: now, // due immediately on creation
    status: 'ACTIVE',
  };
}

/** Apply an SM-2 rating to a card and return the updated record. */
export function applyCardReview(
  card: Flashcard,
  quality: ReviewQuality,
  now: Date = new Date(),
): Flashcard {
  const sm2 = schedule(
    {
      repetitions: card.repetitions,
      intervalDays: card.intervalDays,
      easeFactor: card.easeFactor,
    },
    quality,
    now,
  );
  const success = quality >= 3;
  // A card is "mastered" once it survives a few successful reps at a long interval.
  const status: Flashcard['status'] =
    sm2.repetitions >= 4 && sm2.intervalDays >= 21 ? 'MASTERED' : 'ACTIVE';

  return {
    ...card,
    repetitions: sm2.repetitions,
    intervalDays: sm2.intervalDays,
    easeFactor: sm2.easeFactor,
    nextReviewAt: sm2.nextReviewAt,
    lastReviewedAt: now.toISOString(),
    successCount: card.successCount + (success ? 1 : 0),
    failureCount: card.failureCount + (success ? 0 : 1),
    status,
    updatedAt: now.toISOString(),
  };
}
