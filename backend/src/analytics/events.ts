import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  currentLearnerHash,
  emitMetric,
  learnerHash,
} from "../observability/logger";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type ProductEventName =
  | "activation"
  | "course_imported"
  | "generation_ready"
  | "generation_failed"
  | "generation_retried"
  | "session_started"
  | "session_completed"
  | "review_completed"
  | "retained_learner"
  | "feedback_submitted"
  | "billing_started"
  | "billing_failed"
  | "subscription_canceled";

function sanitizedProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) =>
        ["string", "number", "boolean"].includes(typeof value),
      )
      .slice(0, 20),
  );
}

async function putEvent(input: {
  learner: string;
  eventName: string;
  properties?: Record<string, unknown>;
}) {
  if (!process.env.ANALYTICS_TABLE) return;
  const now = new Date();
  await ddb.send(
    new PutCommand({
      TableName: process.env.ANALYTICS_TABLE,
      Item: {
        pk: `LEARNER#${input.learner}`,
        sk: `EVENT#${now.toISOString()}#${randomUUID()}`,
        eventName: input.eventName,
        occurredAt: now.toISOString(),
        properties: sanitizedProperties(input.properties ?? {}),
        expiresAt: Math.floor(now.getTime() / 1000) + 400 * 24 * 60 * 60,
      },
    }),
  );
}

async function putMilestone(input: {
  learner: string;
  eventName: "activation" | "retained_learner";
  properties: Record<string, unknown>;
}): Promise<boolean> {
  if (!process.env.ANALYTICS_TABLE) return true;
  const now = new Date();
  try {
    await ddb.send(
      new PutCommand({
        TableName: process.env.ANALYTICS_TABLE,
        Item: {
          pk: `LEARNER#${input.learner}`,
          sk: `MILESTONE#${input.eventName}`,
          eventName: input.eventName,
          occurredAt: now.toISOString(),
          properties: sanitizedProperties(input.properties),
          expiresAt: Math.floor(now.getTime() / 1000) + 400 * 24 * 60 * 60,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
    return true;
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

export async function recordProductEvent(
  eventName: ProductEventName,
  userId: string,
  properties: Record<string, unknown> = {},
) {
  const learner = learnerHash(userId);
  if (eventName === "activation" || eventName === "retained_learner") {
    try {
      if (!(await putMilestone({ learner, eventName, properties }))) return;
    } catch (error) {
      console.error("[analytics] milestone write failed", String(error));
    }
  }
  emitMetric("ProductEvent", 1, "Count", { Event: eventName });
  if (eventName !== "activation" && eventName !== "retained_learner") {
    await putEvent({ learner, eventName, properties }).catch((error) => {
      console.error("[analytics] event write failed", String(error));
    });
  }
}

export async function recordAiCost(input: {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}) {
  const learner = currentLearnerHash();
  if (!learner) return;
  await putEvent({
    learner,
    eventName: "ai_cost",
    properties: input,
  }).catch((error) => {
    console.error("[analytics] cost write failed", String(error));
  });
}
