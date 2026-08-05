import { Hono } from "hono";
import { z } from "zod";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getCurrentUserIdentity } from "../../auth/current-user";
import { recordProductEvent } from "../../analytics/events";
import { getProviderSecret } from "../../config/provider-secrets";

export const analytics = new Hono();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ClientEvent = z.object({
  event: z.enum(["session_started", "session_completed"]),
  properties: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .optional(),
});

analytics.post("/analytics/events", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  const input = ClientEvent.parse(await c.req.json());
  await recordProductEvent(input.event, identity.userId, input.properties);
  return c.json({ accepted: true }, 202);
});

analytics.post("/feedback", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  const input = z
    .object({
      kind: z.enum(["feedback", "support"]),
      message: z.string().trim().min(3).max(2_000),
      path: z.string().max(500).optional(),
    })
    .parse(await c.req.json());
  await recordProductEvent("feedback_submitted", identity.userId, input);
  return c.json({ accepted: true }, 202);
});

async function requireAdmin(clerkUserId: string) {
  const configured = await getProviderSecret("ADMIN_CLERK_USER_IDS").catch(
    () => "",
  );
  const allowed = new Set(
    configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowed.has(clerkUserId)) throw new Error("ADMIN_ACCESS_DENIED");
}

analytics.get("/admin/events", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  await requireAdmin(identity.clerkUserId);
  const eventName = z
    .string()
    .min(1)
    .max(80)
    .parse(c.req.query("event") ?? "feedback_submitted");
  const result = await ddb.send(
    new QueryCommand({
      TableName: process.env.ANALYTICS_TABLE!,
      IndexName: "byEventTime",
      KeyConditionExpression: "eventName = :eventName",
      ExpressionAttributeValues: { ":eventName": eventName },
      ScanIndexForward: false,
      Limit: 100,
    }),
  );
  return c.json({ events: result.Items ?? [] });
});
