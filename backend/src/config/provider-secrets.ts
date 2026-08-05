import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { emitAiUsage } from "../observability/logger";
import { recordAiCost } from "../analytics/events";

const secrets = new SecretsManagerClient({});
let providerValues: Promise<Record<string, string>> | undefined;
let providerValuesExpiresAt = 0;
let openaiClient: OpenAI | undefined;
let openaiApiKey: string | undefined;
let anthropicClient: Anthropic | undefined;
let anthropicApiKey: string | undefined;

const SECRET_CACHE_MS = Number(
  process.env.PROVIDER_SECRET_CACHE_MS ?? 5 * 60 * 1000,
);

async function loadProviderValues(): Promise<Record<string, string>> {
  if (!providerValues || Date.now() >= providerValuesExpiresAt) {
    providerValuesExpiresAt = Date.now() + SECRET_CACHE_MS;
    providerValues = (async () => {
      const secretId = process.env.PROVIDER_SECRET_ARN;
      if (!secretId) return {};

      const result = await secrets.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );
      if (!result.SecretString) throw new Error("PROVIDER_SECRET_EMPTY");
      const parsed: unknown = JSON.parse(result.SecretString);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("PROVIDER_SECRET_INVALID");
      }
      return parsed as Record<string, string>;
    })().catch((error) => {
      providerValues = undefined;
      providerValuesExpiresAt = 0;
      throw error;
    });
  }
  return providerValues;
}

/**
 * Resolve a provider credential at invocation time. Environment variables are
 * supported only for local development and tests; deployed Lambdas receive
 * only PROVIDER_SECRET_ARN and read the JSON secret through IAM.
 */
export async function getProviderSecret(name: string): Promise<string> {
  const localValue = process.env[name];
  if (localValue) return localValue;

  const value = (await loadProviderValues())[name];
  if (!value) throw new Error(`PROVIDER_SECRET_MISSING:${name}`);
  return value;
}

export async function getOpenAiClient(): Promise<OpenAI> {
  const apiKey = await getProviderSecret("OPENAI_API_KEY");
  if (!openaiClient || openaiApiKey !== apiKey) {
    const client = new OpenAI({
      apiKey,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 30_000),
      maxRetries: 2,
    });
    const embeddings = client.embeddings as any;
    const create = embeddings.create.bind(embeddings);
    embeddings.create = async (...args: any[]) => {
      const result = await create(...args);
      const tokens = Number(
        result.usage?.total_tokens ?? result.usage?.prompt_tokens ?? 0,
      );
      const usage = {
        provider: "OpenAI",
        model: String(args[0]?.model ?? "unknown"),
        inputTokens: tokens,
        estimatedCostUsd:
          tokens *
          Number(process.env.OPENAI_EMBEDDING_USD_PER_TOKEN ?? 0.00000002),
      } as const;
      emitAiUsage(usage);
      await recordAiCost(usage);
      return result;
    };
    openaiClient = client;
    openaiApiKey = apiKey;
  }
  return openaiClient;
}

export async function getAnthropicClient(): Promise<Anthropic> {
  const apiKey = await getProviderSecret("ANTHROPIC_API_KEY");
  if (!anthropicClient || anthropicApiKey !== apiKey) {
    const client = new Anthropic({
      apiKey,
      timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS ?? 30_000),
      maxRetries: 2,
    });
    const messages = client.messages as any;
    const create = messages.create.bind(messages);
    messages.create = async (...args: any[]) => {
      const result = await create(...args);
      const inputTokens = Number(result.usage?.input_tokens ?? 0);
      const outputTokens = Number(result.usage?.output_tokens ?? 0);
      const inputRate = Number(
        process.env.ANTHROPIC_INPUT_USD_PER_MILLION ?? 3,
      );
      const outputRate = Number(
        process.env.ANTHROPIC_OUTPUT_USD_PER_MILLION ?? 15,
      );
      const usage = {
        provider: "Anthropic",
        model: String(args[0]?.model ?? "unknown"),
        inputTokens,
        outputTokens,
        estimatedCostUsd:
          (inputTokens * inputRate + outputTokens * outputRate) / 1_000_000,
      } as const;
      emitAiUsage(usage);
      await recordAiCost(usage);
      return result;
    };
    anthropicClient = client;
    anthropicApiKey = apiKey;
  }
  return anthropicClient;
}
