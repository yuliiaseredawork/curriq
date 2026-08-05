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
import { notifications } from "./routes/notifications";
import { UnauthorizedError } from "../auth/current-user";
import { CourseAccessDeniedError } from "../auth/course-access";
import { ZodError } from "zod";
import {
  enforceDailyAiQuota,
  enforceRequestLimit,
  RateLimitError,
} from "./middleware/usage-limits";
import { correlationId, emitMetric, logger } from "../observability/logger";
import { getCurrentUserId } from "../auth/current-user";

type AppEnv = {
  Variables: {
    correlationId: string;
    userId: string;
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
    allowMethods: ["GET", "POST", "OPTIONS"],
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

const publicPaths = new Set(["/health", "/notifications/daily-reviews"]);
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" || publicPaths.has(c.req.path)) return next();

  const userId = await getCurrentUserId(c);
  await enforceRequestLimit(userId);

  const expensive =
    c.req.method === "POST" &&
    (["/search", "/outline", "/quizzes", "/practice", "/courses"].includes(
      c.req.path,
    ) ||
      /^\/courses\/[^/]+\/(?:retry|pdf\/complete)$/.test(c.req.path));
  if (expensive) await enforceDailyAiQuota(userId);
  return next();
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

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
app.route("/", notifications);

export const handler = handle(app);
