import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export class RateLimitError extends Error {
  constructor(
    public readonly retryAfterSeconds: number,
    public readonly code: "RATE_LIMITED" | "DAILY_QUOTA_EXCEEDED",
  ) {
    super(code);
    this.name = "RateLimitError";
  }
}

async function increment(input: {
  userId: string;
  key: string;
  field: string;
  maximum: number;
  expiresAt: number;
  retryAfterSeconds: number;
  code: RateLimitError["code"];
}) {
  if (!process.env.USAGE_TABLE) return;
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: process.env.USAGE_TABLE,
        Key: { pk: `USER#${input.userId}`, sk: input.key },
        UpdateExpression: `ADD ${input.field} :one SET expiresAt = :expiresAt`,
        ConditionExpression: `attribute_not_exists(${input.field}) OR ${input.field} < :maximum`,
        ExpressionAttributeValues: {
          ":one": 1,
          ":maximum": input.maximum,
          ":expiresAt": input.expiresAt,
        },
      }),
    );
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw new RateLimitError(input.retryAfterSeconds, input.code);
    }
    throw error;
  }
}

export async function enforceRequestLimit(userId: string, now = new Date()) {
  const windowSeconds = 300;
  const epochSeconds = Math.floor(now.getTime() / 1000);
  const window = Math.floor(epochSeconds / windowSeconds);
  await increment({
    userId,
    key: `REQUESTS#${window}`,
    field: "requestCount",
    maximum: Number(process.env.REQUESTS_PER_5_MINUTES ?? 300),
    expiresAt: (window + 1) * windowSeconds + 3600,
    retryAfterSeconds: windowSeconds - (epochSeconds % windowSeconds),
    code: "RATE_LIMITED",
  });
}

export async function enforceDailyAiQuota(userId: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const tomorrow = new Date(`${day}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await increment({
    userId,
    key: `AI#${day}`,
    field: "aiRequests",
    maximum: Number(process.env.DAILY_AI_REQUESTS_PER_USER ?? 50),
    expiresAt: Math.floor(tomorrow.getTime() / 1000) + 86400,
    retryAfterSeconds: Math.max(
      1,
      Math.floor((tomorrow.getTime() - now.getTime()) / 1000),
    ),
    code: "DAILY_QUOTA_EXCEEDED",
  });
}
