import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function saveProgress(input: {
  userId: string;
  courseId: string;
  chapterId: string;
  questionId: string;
  correct: boolean;
}) {
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: process.env.PROGRESS_TABLE!,
      Item: {
        pk: `USER#${input.userId}`,
        sk: `COURSE#${input.courseId}#CHAPTER#${input.chapterId}#QUESTION#${input.questionId}`,
        userId: input.userId,
        courseId: input.courseId,
        chapterId: input.chapterId,
        questionId: input.questionId,
        correct: input.correct,
        answeredAt: now,
      },
    }),
  );
}

export async function saveMistake(input: {
  userId: string;
  courseId: string;
  chapterId: string;
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  conceptTags: string[];
  explanation: string;
}) {
  const now = new Date().toISOString();

  await ddb.send(
    new PutCommand({
      TableName: process.env.MISTAKES_TABLE!,
      Item: {
        pk: `USER#${input.userId}`,
        sk: `COURSE#${input.courseId}#CHAPTER#${input.chapterId}#QUESTION#${input.questionId}#${now}`,
        userId: input.userId,
        courseId: input.courseId,
        chapterId: input.chapterId,
        questionId: input.questionId,
        userAnswer: input.userAnswer,
        correctAnswer: input.correctAnswer,
        conceptTags: input.conceptTags,
        explanation: input.explanation,
        createdAt: now,
      },
    }),
  );
}

export async function getChapterProgress(input: {
  userId: string;
  courseId: string;
  chapterId: string;
}) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.PROGRESS_TABLE!,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${input.userId}`,
        ':prefix': `COURSE#${input.courseId}#CHAPTER#${input.chapterId}#QUESTION#`,
      },
    }),
  );

  return result.Items ?? [];
}