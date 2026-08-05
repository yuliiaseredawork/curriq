import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cache = new Map<string, string>();

/**
 * Bind the immutable Clerk subject to the ownership ID chosen at first login.
 * This preserves existing email-keyed records without making future email
 * address changes orphan the learner's courses or privacy controls.
 */
export async function resolveStableUserId(
  clerkUserId: string,
  firstLoginCandidate: string,
): Promise<string> {
  const warmed = cache.get(clerkUserId);
  if (warmed) return warmed;
  if (!process.env.USERS_TABLE) return firstLoginCandidate;
  const result = await ddb.send(
    new UpdateCommand({
      TableName: process.env.USERS_TABLE,
      Key: { pk: `CLERK#${clerkUserId}` },
      UpdateExpression:
        "SET userId = if_not_exists(userId, :candidate), createdAt = if_not_exists(createdAt, :now), updatedAt = :now",
      ExpressionAttributeValues: {
        ":candidate": firstLoginCandidate,
        ":now": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    }),
  );
  const userId = String(result.Attributes?.userId ?? firstLoginCandidate);
  cache.set(clerkUserId, userId);
  return userId;
}

export async function deleteIdentityMapping(clerkUserId: string) {
  cache.delete(clerkUserId);
  if (!process.env.USERS_TABLE) return;
  await ddb.send(
    new DeleteCommand({
      TableName: process.env.USERS_TABLE,
      Key: { pk: `CLERK#${clerkUserId}` },
    }),
  );
}
