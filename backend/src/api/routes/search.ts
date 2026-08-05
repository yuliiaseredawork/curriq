import { Hono } from "hono";
import { z } from "zod";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { requireCourseAccess } from "../../auth/course-access";
import { embedText } from "../../ai/embeddings";

const Input = z.object({
  courseId: z.string(),
  query: z.string().min(2),
  limit: z.number().int().min(1).max(20).optional(),
});

const lambda = new LambdaClient({});

export const search = new Hono();

search.post("/", async (c) => {
  const body = await c.req.json();
  const input = Input.parse(body);
  await requireCourseAccess(c, input.courseId);

  const embedding = await embedText(input.query);

  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.SEARCH_CHUNKS_FUNCTION_NAME!,
      Payload: Buffer.from(
        JSON.stringify({
          courseId: input.courseId,
          embedding,
          limit: input.limit ?? 5,
        }),
      ),
    }),
  );

  const payload = JSON.parse(new TextDecoder().decode(response.Payload));

  return c.json({
    query: input.query,
    ...payload,
  });
});
