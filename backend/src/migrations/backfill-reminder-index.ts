import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (event: { RequestType: string }) => {
  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: "reminder-due-index-v1" };
  }
  let cursor: Record<string, unknown> | undefined;
  let updated = 0;
  do {
    const result = await ddb.send(
      new ScanCommand({
        TableName: process.env.FOCUS_AREAS_TABLE!,
        FilterExpression:
          "begins_with(sk, :card) AND #status = :active AND attribute_exists(nextReviewAt) AND attribute_not_exists(dueBucket)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":card": "COURSE#",
          ":active": "ACTIVE",
        },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: cursor,
      }),
    );
    for (const item of result.Items ?? []) {
      if (!String(item.sk).includes("#CARD#")) continue;
      await ddb.send(
        new UpdateCommand({
          TableName: process.env.FOCUS_AREAS_TABLE!,
          Key: { pk: item.pk, sk: item.sk },
          UpdateExpression: "SET dueBucket = :bucket",
          ExpressionAttributeValues: { ":bucket": "FLASHCARD" },
        }),
      );
      updated += 1;
    }
    cursor = result.LastEvaluatedKey;
  } while (cursor);
  return {
    PhysicalResourceId: "reminder-due-index-v1",
    Data: { Updated: updated },
  };
};
