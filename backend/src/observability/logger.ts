import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export type LogFields = Record<string, unknown>;

const learnerContext = new AsyncLocalStorage<{ learnerHash: string }>();

export function learnerHash(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

export function withLearnerContext<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return learnerContext.run({ learnerHash: learnerHash(userId) }, operation);
}

export function enterLearnerContext(userId: string): void {
  learnerContext.enterWith({ learnerHash: learnerHash(userId) });
}

export function currentLearnerHash(): string | undefined {
  return learnerContext.getStore()?.learnerHash;
}

function write(
  level: "INFO" | "WARN" | "ERROR",
  event: string,
  fields: LogFields = {},
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME ?? "curriq-api",
    event,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("INFO", event, fields),
  warn: (event: string, fields?: LogFields) => write("WARN", event, fields),
  error: (event: string, fields?: LogFields) => write("ERROR", event, fields),
};

export function correlationId(value?: string): string {
  return value && /^[A-Za-z0-9._:-]{8,128}$/.test(value) ? value : randomUUID();
}

export function emitMetric(
  name: string,
  value: number,
  unit: "Count" | "Milliseconds" | "Seconds" | "None" = "Count",
  dimensions: Record<string, string> = {},
) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "Curriq",
            Dimensions: [Object.keys(dimensions)],
            Metrics: [{ Name: name, Unit: unit }],
          },
        ],
      },
      ...dimensions,
      [name]: value,
    }),
  );
}

export function emitAiUsage(input: {
  provider: "OpenAI" | "Anthropic";
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
}) {
  const dimensions = { Provider: input.provider, Model: input.model };
  emitMetric("AiInputTokens", input.inputTokens ?? 0, "Count", dimensions);
  emitMetric("AiOutputTokens", input.outputTokens ?? 0, "Count", dimensions);
  if (input.estimatedCostUsd !== undefined) {
    emitMetric(
      "AiEstimatedCostUsd",
      input.estimatedCostUsd,
      "None",
      dimensions,
    );
  }
}
