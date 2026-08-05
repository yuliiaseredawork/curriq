const appUrl = process.env.SMOKE_APP_URL;
const apiUrl = process.env.SMOKE_API_URL;
const expectedOrigin = process.env.SMOKE_EXPECTED_ORIGIN ?? appUrl;
const apiOnly = process.env.SMOKE_API_ONLY === "true";

if (!apiUrl || (!apiOnly && !appUrl)) {
  throw new Error(
    "SMOKE_API_URL is required; SMOKE_APP_URL is also required unless SMOKE_API_ONLY=true",
  );
}
if (!expectedOrigin) {
  throw new Error("SMOKE_EXPECTED_ORIGIN is required for API-only smoke tests");
}

async function request(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
}

const health = await request(`${apiUrl}/health`);
if (!health.ok || (await health.json()).status !== "ok") {
  throw new Error(`API health failed: ${health.status}`);
}

if (!apiOnly) {
  const home = await request(appUrl);
  if (!home.ok || !(await home.text()).includes("Curriq")) {
    throw new Error(`Frontend smoke failed: ${home.status}`);
  }

  const privacy = await request(`${appUrl}/privacy`);
  if (!privacy.ok || !(await privacy.text()).includes("export your data")) {
    throw new Error(`Privacy page smoke failed: ${privacy.status}`);
  }
}

for (const path of [
  "/courses",
  "/search",
  "/outline",
  "/quizzes",
  "/practice",
  "/courses/smoke-test/process",
  "/billing/checkout",
  "/admin/events",
]) {
  const response = await request(`${apiUrl}${path}`, {
    method: path === "/courses" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (response.status !== 401) {
    throw new Error(
      `${path} must reject anonymous access, got ${response.status}`,
    );
  }
}

const removedCron = await request(`${apiUrl}/notifications/daily`, {
  method: "POST",
});
if (![401, 404].includes(removedCron.status)) {
  throw new Error(
    `Removed reminder endpoint is exposed: ${removedCron.status}`,
  );
}

const preflight = await request(`${apiUrl}/health`, {
  method: "OPTIONS",
  headers: {
    Origin: expectedOrigin,
    "Access-Control-Request-Method": "GET",
  },
});
if (
  !preflight.ok ||
  preflight.headers.get("access-control-allow-origin") !== expectedOrigin
) {
  throw new Error("CORS preflight did not return the expected single origin");
}

console.log(JSON.stringify({ status: "passed", apiOnly, appUrl, apiUrl }));
