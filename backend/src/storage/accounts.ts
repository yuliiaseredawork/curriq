import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { CurrentUserIdentity } from "../auth/current-user";
import { createHash } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.USERS_TABLE!;

export type AccountPlan = "FREE" | "PRO";
export type SubscriptionStatus = "NONE" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export type Account = {
  pk: string;
  userId: string;
  clerkUserId: string;
  email?: string;
  emailSubscribed: boolean;
  status: "ACTIVE" | "DELETION_PENDING";
  plan: AccountPlan;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  updatedAt: string;
};

const warmedAccounts = new Set<string>();

export async function ensureAccount(
  identity: CurrentUserIdentity,
): Promise<void> {
  if (!process.env.USERS_TABLE || warmedAccounts.has(identity.userId)) return;
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${identity.userId}` },
      UpdateExpression:
        "SET userId = :userId, clerkUserId = :clerkUserId, email = :email, emailSubscribed = if_not_exists(emailSubscribed, :subscribed), #status = if_not_exists(#status, :active), #plan = if_not_exists(#plan, :free), subscriptionStatus = if_not_exists(subscriptionStatus, :none), createdAt = if_not_exists(createdAt, :now), updatedAt = :now",
      ExpressionAttributeNames: { "#status": "status", "#plan": "plan" },
      ExpressionAttributeValues: {
        ":userId": identity.userId,
        ":clerkUserId": identity.clerkUserId,
        ":email": identity.email ?? null,
        ":subscribed": true,
        ":active": "ACTIVE",
        ":free": "FREE",
        ":none": "NONE",
        ":now": now,
      },
    }),
  );
  warmedAccounts.add(identity.userId);
}

export async function getAccount(userId: string): Promise<Account | null> {
  if (!process.env.USERS_TABLE) return null;
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}` },
      ConsistentRead: true,
    }),
  );
  return (result.Item as Account | undefined) ?? null;
}

export async function getAccountByStripeCustomer(
  customerId: string,
): Promise<Account | null> {
  if (!process.env.USERS_TABLE) return null;
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE(),
      IndexName: "byStripeCustomer",
      KeyConditionExpression: "stripeCustomerId = :customerId",
      ExpressionAttributeValues: { ":customerId": customerId },
      Limit: 1,
    }),
  );
  return (result.Items?.[0] as Account | undefined) ?? null;
}

export async function setEmailSubscribed(
  userId: string,
  subscribed: boolean,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}` },
      UpdateExpression: "SET emailSubscribed = :subscribed, updatedAt = :now",
      ExpressionAttributeValues: {
        ":subscribed": subscribed,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

export async function updateBillingAccount(input: {
  userId: string;
  customerId: string;
  subscriptionId?: string;
  plan: AccountPlan;
  subscriptionStatus: SubscriptionStatus;
}): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${input.userId}` },
      UpdateExpression:
        "SET stripeCustomerId = :customerId, stripeSubscriptionId = :subscriptionId, #plan = :plan, subscriptionStatus = :subscriptionStatus, updatedAt = :now",
      ExpressionAttributeNames: { "#plan": "plan" },
      ExpressionAttributeValues: {
        ":customerId": input.customerId,
        ":subscriptionId": input.subscriptionId ?? null,
        ":plan": input.plan,
        ":subscriptionStatus": input.subscriptionStatus,
        ":now": new Date().toISOString(),
      },
    }),
  );
}

export async function deleteAccountRecord(userId: string): Promise<void> {
  if (!process.env.USERS_TABLE) return;
  warmedAccounts.delete(userId);
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}` },
    }),
  );
}

function deletionKey(userId: string) {
  const digest = createHash("sha256").update(userId).digest("hex");
  return `DELETED#${digest}`;
}

export async function markAccountDeleted(
  userId: string,
  courseIds: string[] = [],
): Promise<void> {
  if (!process.env.USERS_TABLE) return;
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: deletionKey(userId),
        status: "DELETED",
        courseIds,
        createdAt: new Date().toISOString(),
        expiresAt: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
      },
    }),
  );
}

export async function getAccountDeletion(
  userId: string,
): Promise<{ courseIds: string[] } | null> {
  if (!process.env.USERS_TABLE) return null;
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: deletionKey(userId) },
    }),
  );
  if (!result.Item) return null;
  return {
    courseIds: Array.isArray(result.Item.courseIds)
      ? result.Item.courseIds.map(String)
      : [],
  };
}

export async function isAccountDeleted(userId: string): Promise<boolean> {
  if (!process.env.USERS_TABLE) return false;
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: deletionKey(userId) },
      ProjectionExpression: "pk",
    }),
  );
  return Boolean(result.Item);
}
