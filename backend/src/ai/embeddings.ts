import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { getOpenAiClient } from "../config/provider-secrets";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const memoryCache = new Map<string, number[]>();
const MODEL = "text-embedding-3-small";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_MEMORY_ENTRIES = 500;

function keyFor(text: string): string {
  return createHash("sha256").update(`${MODEL}\0${text}`).digest("hex");
}

function remember(key: string, vector: number[]) {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, vector);
}

async function readPersistent(keys: string[]): Promise<Map<string, number[]>> {
  const table = process.env.EMBEDDING_CACHE_TABLE;
  const found = new Map<string, number[]>();
  if (!table || !keys.length) return found;
  try {
    for (let offset = 0; offset < keys.length; offset += 100) {
      const batch = keys.slice(offset, offset + 100);
      const response = await ddb.send(
        new BatchGetCommand({
          RequestItems: { [table]: { Keys: batch.map((pk) => ({ pk })) } },
        }),
      );
      for (const item of response.Responses?.[table] ?? []) {
        if (Array.isArray(item.vector)) found.set(String(item.pk), item.vector);
      }
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "embedding_cache.read_failed",
        error: String(error),
      }),
    );
  }
  return found;
}

async function writePersistent(
  entries: Array<{ key: string; vector: number[] }>,
) {
  const table = process.env.EMBEDDING_CACHE_TABLE;
  if (!table || !entries.length) return;
  const expiresAt = Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS;
  try {
    for (let offset = 0; offset < entries.length; offset += 25) {
      await ddb.send(
        new BatchWriteCommand({
          RequestItems: {
            [table]: entries.slice(offset, offset + 25).map((entry) => ({
              PutRequest: {
                Item: {
                  pk: entry.key,
                  vector: entry.vector,
                  model: MODEL,
                  expiresAt,
                },
              },
            })),
          },
        }),
      );
    }
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "embedding_cache.write_failed",
        error: String(error),
      }),
    );
  }
}

/** Batch, deduplicate, and cache embeddings across warm and cold invocations. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const keys = texts.map(keyFor);
  const missingKeys = [...new Set(keys.filter((key) => !memoryCache.has(key)))];
  const persisted = await readPersistent(missingKeys);
  for (const [key, vector] of persisted) remember(key, vector);

  const uniqueMissing = new Map<string, string>();
  texts.forEach((text, index) => {
    const key = keys[index];
    if (!memoryCache.has(key)) uniqueMissing.set(key, text);
  });

  const generated: Array<{ key: string; vector: number[] }> = [];
  const missingEntries = [...uniqueMissing.entries()];
  for (let offset = 0; offset < missingEntries.length; offset += 64) {
    const batch = missingEntries.slice(offset, offset + 64);
    const result = await (
      await getOpenAiClient()
    ).embeddings.create({
      model: MODEL,
      input: batch.map(([, text]) => text),
    });
    result.data.forEach((item, index) => {
      const key = batch[index]?.[0];
      if (!key) return;
      remember(key, item.embedding);
      generated.push({ key, vector: item.embedding });
    });
  }
  await writePersistent(generated);
  return keys.map((key) => {
    const vector = memoryCache.get(key);
    if (!vector) throw new Error("EMBEDDING_RESULT_MISSING");
    return vector;
  });
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}
