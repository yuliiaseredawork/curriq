import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = process.env.LOAD_API_URL;
if (!baseUrl) throw new Error("LOAD_API_URL is required");

const durationSeconds = Math.min(
  600,
  Math.max(5, Number(process.env.LOAD_DURATION_SECONDS ?? 60)),
);
const concurrency = Math.min(
  100,
  Math.max(1, Number(process.env.LOAD_CONCURRENCY ?? 10)),
);
const requestsPerSecond = Math.min(
  100,
  Math.max(1, Number(process.env.LOAD_REQUESTS_PER_SECOND ?? 20)),
);
const token = process.env.LOAD_BEARER_TOKEN;
const paths = token ? ["/health", "/courses", "/session/today"] : ["/health"];
const deadline = Date.now() + durationSeconds * 1000;
const samples = [];
let requests = 0;
let failures = 0;
let nextRequestAt = performance.now();

async function waitForRequestSlot() {
  const now = performance.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + 1_000 / requestsPerSecond;
  if (slot > now) await delay(slot - now);
}

async function worker(workerId) {
  let index = workerId;
  while (Date.now() < deadline) {
    await waitForRequestSlot();
    if (Date.now() >= deadline) break;
    const path = paths[index % paths.length];
    index += 1;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      samples.push(performance.now() - started);
      requests += 1;
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
samples.sort((a, b) => a - b);
const percentile = (value) =>
  samples[Math.min(samples.length - 1, Math.floor(samples.length * value))] ??
  0;
const failureRate = requests ? failures / requests : 1;
const result = {
  durationSeconds,
  concurrency,
  targetRequestsPerSecond: requestsPerSecond,
  requests,
  requestsPerSecond: Number((requests / durationSeconds).toFixed(2)),
  failures,
  failureRate: Number(failureRate.toFixed(4)),
  p50Ms: Number(percentile(0.5).toFixed(1)),
  p95Ms: Number(percentile(0.95).toFixed(1)),
  p99Ms: Number(percentile(0.99).toFixed(1)),
};
console.log(JSON.stringify(result, null, 2));

if (
  failureRate > Number(process.env.LOAD_MAX_FAILURE_RATE ?? 0.01) ||
  result.p95Ms > Number(process.env.LOAD_MAX_P95_MS ?? 2_000)
) {
  process.exitCode = 1;
}
