import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { courses } from "./routes/courses";
import { search } from "./routes/search";
import { outline } from "./routes/outline";
import { quizzes } from "./routes/quizzes";
import { study } from "./routes/study";
import { cors } from "hono/cors";
import { practice } from "./routes/practice";
import { coursesPdf } from "./routes/courses-pdf";
import { focusAreas } from "./routes/focus-areas";
import { reviews } from "./routes/reviews";
import { flashcards } from "./routes/flashcards";
import { session } from "./routes/session";
import { UnauthorizedError } from "../auth/current-user";
import { CourseAccessDeniedError } from "../auth/course-access";
import { ZodError } from "zod";
import {
  enforceDailyAiQuota,
  enforceRequestLimit,
  RateLimitError,
} from "./middleware/usage-limits";
import { correlationId, emitMetric, logger } from "../observability/logger";
import { getCurrentUserIdentity } from "../auth/current-user";
import {
  ensureAccount,
  getAccount,
  isAccountDeleted,
} from "../storage/accounts";
import { emailPreferences } from "./routes/email-preferences";
import { account } from "./routes/account";
import { withLearnerContext } from "../observability/logger";
import { analytics } from "./routes/analytics";
import { billing } from "./routes/billing";

type AppEnv = {
  Variables: {
    correlationId: string;
    userId: string;
    currentUser: {
      userId: string;
      clerkUserId: string;
      email?: string;
    };
  };
};

const app = new Hono<AppEnv>();

// Map auth failures to a clean 401 instead of a generic 500.
app.onError((err, c) => {
  if (err instanceof UnauthorizedError || err.message === "UNAUTHORIZED") {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }
  if (
    err instanceof CourseAccessDeniedError ||
    err.message === "COURSE_ACCESS_DENIED"
  ) {
    return c.json({ error: "COURSE_NOT_FOUND" }, 404);
  }
  if (err instanceof RateLimitError) {
    c.header("Retry-After", String(err.retryAfterSeconds));
    return c.json({ error: err.code }, 429);
  }
  if (err.message === "ADMIN_ACCESS_DENIED") {
    return c.json({ error: "FORBIDDEN" }, 403);
  }
  if (err instanceof ZodError) {
    return c.json({ error: "INVALID_REQUEST", issues: err.issues }, 400);
  }
  logger.error("api.unhandled_error", {
    correlationId: c.get("correlationId"),
    error: err.message,
    stack: err.stack,
  });
  emitMetric("ApiUnhandledErrors", 1, "Count");
  return c.json({ error: "INTERNAL_ERROR" }, 500);
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Correlation-Id"],
    exposeHeaders: ["X-Correlation-Id"],
  }),
);

app.use("*", async (c, next) => {
  const requestId = correlationId(c.req.header("x-correlation-id"));
  c.set("correlationId", requestId);
  c.header("x-correlation-id", requestId);
  const start = Date.now();
  try {
    await next();
  } finally {
    const latencyMs = Date.now() - start;
    logger.info("api.request", {
      correlationId: requestId,
      method: c.req.method,
      path: c.req.path,
      route: c.req.routePath,
      status: c.res.status,
      latencyMs,
    });
    emitMetric("ApiLatency", latencyMs, "Milliseconds", {
      Route: c.req.routePath || c.req.path,
      StatusClass: `${Math.floor(c.res.status / 100)}xx`,
    });
  }
});

const publicPaths = new Set([
  "/health",
  "/email/unsubscribe",
  "/billing/webhook",
]);
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" || publicPaths.has(c.req.path)) return next();

  const identity = await getCurrentUserIdentity(c);
  const userId = identity.userId;
  if (await isAccountDeleted(userId)) {
    if (c.req.method === "DELETE" && c.req.path === "/account") {
      return withLearnerContext(userId, next);
    }
    throw new UnauthorizedError("ACCOUNT_DELETED");
  }
  await ensureAccount(identity);
  const accountRecord = await getAccount(userId);
  const paid =
    accountRecord?.plan === "PRO" &&
    accountRecord.subscriptionStatus === "ACTIVE";
  await enforceRequestLimit(
    userId,
    new Date(),
    paid
      ? Number(process.env.PRO_REQUESTS_PER_5_MINUTES ?? 1000)
      : Number(process.env.REQUESTS_PER_5_MINUTES ?? 300),
  );

  const expensive =
    c.req.method === "POST" &&
    (["/search", "/outline", "/quizzes", "/practice", "/courses"].includes(
      c.req.path,
    ) ||
      /^\/courses\/[^/]+\/(?:retry|pdf\/complete)$/.test(c.req.path));
  if (expensive) {
    await enforceDailyAiQuota(
      userId,
      new Date(),
      paid
        ? Number(process.env.PRO_DAILY_AI_REQUESTS ?? 500)
        : Number(process.env.DAILY_AI_REQUESTS_PER_USER ?? 20),
    );
  }
  return withLearnerContext(userId, next);
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.route("/", emailPreferences);
app.route("/", account);
app.route("/", analytics);
app.route("/", billing);

app.route("/courses", courses);
app.route("/courses", coursesPdf);
app.route("/courses", focusAreas);
app.route("/", reviews);
app.route("/", flashcards);
app.route("/", session);
app.route("/search", search);
app.route("/outline", outline);
app.route("/quizzes", quizzes);
app.route("/study", study);
app.route("/practice", practice);

export const handler = handle(app);
