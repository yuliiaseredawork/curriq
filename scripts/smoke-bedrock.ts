import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

async function main() {
  const client = new BedrockRuntimeClient({ region: 'us-west-2' });

  const res = await client.send(
    new ConverseCommand({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: 'Say hi' }],
        },
      ],
      inferenceConfig: {
        maxTokens: 100,
        temperature: 0.2,
      },
    })
  );

  console.log(res.output?.message?.content?.[0]?.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});