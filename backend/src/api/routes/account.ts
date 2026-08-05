import { Hono } from "hono";
import { z } from "zod";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectsCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  deleteAccountRecord,
  getAccount,
  getAccountDeletion,
  markAccountDeleted,
} from "../../storage/accounts";
import { getCurrentUserIdentity } from "../../auth/current-user";
import { callCourseMetadata } from "../../courses/course-metadata-client";
import { getProviderSecret } from "../../config/provider-secrets";
import { deleteIdentityMapping } from "../../auth/identity-map";

export const account = new Hono();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const userTables = () =>
  [
    { name: "progress", table: process.env.PROGRESS_TABLE },
    { name: "mistakes", table: process.env.MISTAKES_TABLE },
    { name: "focusAreas", table: process.env.FOCUS_AREAS_TABLE },
    { name: "usage", table: process.env.USAGE_TABLE },
  ].filter((entry): entry is { name: string; table: string } =>
    Boolean(entry.table),
  );

async function queryUserData(tableName: string, userId: string) {
  const items: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${userId}` },
        ExclusiveStartKey: cursor,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function deleteUserData(tableName: string, userId: string) {
  const items = await queryUserData(tableName, userId);
  for (let offset = 0; offset < items.length; offset += 25) {
    const batch = items.slice(offset, offset + 25);
    let pending: any[] = batch.map((item) => ({
      DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
    }));
    for (let attempt = 0; pending.length && attempt < 6; attempt += 1) {
      const result = await ddb.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: pending },
        }),
      );
      pending = result.UnprocessedItems?.[tableName] ?? [];
      if (pending.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1_000, 50 * 2 ** attempt)),
        );
      }
    }
    if (pending.length) throw new Error("ACCOUNT_DATA_DELETE_INCOMPLETE");
  }
}

async function deleteS3Versions(bucket: string, prefix: string) {
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  do {
    const result = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: prefix,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    const objects = [
      ...(result.Versions ?? []),
      ...(result.DeleteMarkers ?? []),
    ]
      .filter((item) => item.Key && item.VersionId)
      .map((item) => ({ Key: item.Key!, VersionId: item.VersionId! }));
    for (let offset = 0; offset < objects.length; offset += 1000) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.slice(offset, offset + 1000),
            Quiet: true,
          },
        }),
      );
    }
    keyMarker = result.NextKeyMarker;
    versionIdMarker = result.NextVersionIdMarker;
  } while (keyMarker);
}

async function deleteClerkIdentity(clerkUserId: string) {
  const secretKey = await getProviderSecret("CLERK_SECRET_KEY");
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`CLERK_DELETE_FAILED:${response.status}`);
  }
}

account.get("/account", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  return c.json({ account: await getAccount(identity.userId) });
});

account.get("/account/export", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  const [accountRecord, courses, ...tableData] = await Promise.all([
    getAccount(identity.userId),
    callCourseMetadata({ action: "exportUser", userId: identity.userId }),
    ...userTables().map(({ table }) => queryUserData(table, identity.userId)),
  ]);
  c.header("Content-Disposition", 'attachment; filename="curriq-export.json"');
  return c.json({
    exportedAt: new Date().toISOString(),
    account: accountRecord,
    courses: courses.courses ?? [],
    learningRecords: Object.fromEntries(
      userTables().map(({ name }, index) => [name, tableData[index] ?? []]),
    ),
  });
});

account.delete("/account", async (c) => {
  const identity = await getCurrentUserIdentity(c);
  z.object({ confirmation: z.literal("DELETE") }).parse(await c.req.json());

  const existingDeletion = await getAccountDeletion(identity.userId);
  const beforeDelete = existingDeletion
    ? { courses: existingDeletion.courseIds.map((courseId) => ({ courseId })) }
    : await callCourseMetadata({
        action: "exportUser",
        userId: identity.userId,
      });
  const courseIds = (beforeDelete.courses ?? []).map((course: any) =>
    String(course.courseId ?? course.id),
  );

  // Block delayed/retried background work and retain a pseudonymous cleanup
  // manifest before deleting the source rows.
  await markAccountDeleted(identity.userId, courseIds);

  await callCourseMetadata({
    action: "deleteUser",
    userId: identity.userId,
  });
  await Promise.all(
    userTables().map(({ table }) => deleteUserData(table, identity.userId)),
  );

  const processedBucket = process.env.PROCESSED_BUCKET;
  if (processedBucket) {
    await Promise.all(
      courseIds.map((courseId: string) =>
        deleteS3Versions(processedBucket, `courses/${courseId}/`),
      ),
    );
  }
  const rawBucket = process.env.RAW_BUCKET;
  if (rawBucket) {
    await deleteS3Versions(rawBucket, `pdf-uploads/${identity.userId}/`);
  }

  await deleteAccountRecord(identity.userId);
  await deleteClerkIdentity(identity.clerkUserId);
  await deleteIdentityMapping(identity.clerkUserId);
  return c.json({ deleted: true });
});
