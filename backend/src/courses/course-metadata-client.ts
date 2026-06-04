import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});

export async function callCourseMetadata(payload: unknown) {
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: process.env.COURSE_METADATA_FUNCTION_NAME!,
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  const text = new TextDecoder().decode(response.Payload);
  const parsed = text ? JSON.parse(text) : null;

  if (response.FunctionError) {
    throw new Error(JSON.stringify(parsed));
  }

  return parsed;
}