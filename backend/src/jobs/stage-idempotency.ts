import { randomUUID } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type StageResult<T> =
  { executed: true; value: T } | { executed: false; value?: undefined };

/**
 * Claims a course stage with an expiring lease and records completion in
 * DynamoDB. Completed stages are skipped on an SQS retry; failed or abandoned
 * stages can be reclaimed after the lease expires.
 */
export async function runIdempotentStage<T>(
  courseId: string,
  stage: string,
  work: () => Promise<T>,
): Promise<StageResult<T>> {
  const tableName = process.env.JOB_STATE_TABLE;
  if (!tableName) return { executed: true, value: await work() };

  const key = { pk: `COURSE#${courseId}`, sk: `STAGE#${stage}` };
  const existing = await ddb.send(
    new GetCommand({ TableName: tableName, Key: key }),
  );
  if (existing.Item?.status === "COMPLETED") return { executed: false };

  const now = Math.floor(Date.now() / 1000);
  const leaseOwner = randomUUID();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: [
          "SET #status = :inProgress, leaseOwner = :leaseOwner,",
          "leaseUntil = :leaseUntil, updatedAt = :updatedAt, expiresAt = :expiresAt",
          "ADD attempts :one",
        ].join(" "),
        ConditionExpression: [
          "attribute_not_exists(#status)",
          "#status = :failed",
          "leaseUntil < :now",
        ].join(" OR "),
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":inProgress": "IN_PROGRESS",
          ":failed": "FAILED",
          ":leaseOwner": leaseOwner,
          ":leaseUntil": now + 15 * 60,
          ":updatedAt": new Date().toISOString(),
          ":expiresAt": now + 30 * 24 * 60 * 60,
          ":now": now,
          ":one": 1,
        },
      }),
    );
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    const current = await ddb.send(
      new GetCommand({ TableName: tableName, Key: key }),
    );
    if (current.Item?.status === "COMPLETED") return { executed: false };
    throw new Error(`Course stage ${stage} is already running`);
  }

  try {
    const value = await work();
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: [
          "SET #status = :completed, completedAt = :completedAt,",
          "updatedAt = :completedAt REMOVE leaseUntil",
        ].join(" "),
        ConditionExpression: "leaseOwner = :leaseOwner",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":completed": "COMPLETED",
          ":completedAt": new Date().toISOString(),
          ":leaseOwner": leaseOwner,
        },
      }),
    );
    return { executed: true, value };
  } catch (error) {
    await ddb
      .send(
        new UpdateCommand({
          TableName: tableName,
          Key: key,
          UpdateExpression: [
            "SET #status = :failed, failedAt = :failedAt, updatedAt = :failedAt",
            "REMOVE leaseUntil",
          ].join(" "),
          ConditionExpression: "leaseOwner = :leaseOwner",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":failed": "FAILED",
            ":failedAt": new Date().toISOString(),
            ":leaseOwner": leaseOwner,
          },
        }),
      )
      .catch(() => undefined);
    throw error;
  }
}
