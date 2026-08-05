import { Hono } from "hono";

import { runDailyReviewReminders } from "../../notifications/daily-review-reminder";
import { getProviderSecret } from "../../config/provider-secrets";

// Cron-compatible trigger for the daily review-reminder job. Not a user route:
// it is guarded by a shared secret (CRON_SECRET env) instead of Clerk auth so
// any scheduler — EventBridge API destination, Vercel Cron, GitHub Actions,
// plain curl — can call it:
//
//   curl -X POST "$API_URL/notifications/daily-reviews" \
//        -H "x-cron-secret: $CRON_SECRET"
//
// The job itself is idempotent per UTC day (per-user REMINDER#DAILY record),
// so an accidental double-trigger sends nothing twice.
export const notifications = new Hono();

notifications.post("/notifications/daily-reviews", async (c) => {
  const secret = await getProviderSecret("CRON_SECRET").catch(() => undefined);
  if (!secret) {
    // Fail closed: the endpoint is disabled until a secret is configured.
    return c.json(
      { error: "NOT_CONFIGURED", message: "CRON_SECRET is not set." },
      503,
    );
  }
  if (c.req.header("x-cron-secret") !== secret) {
    return c.json({ error: "UNAUTHORIZED" }, 401);
  }

  try {
    const summary = await runDailyReviewReminders();
    return c.json({ ok: true, ...summary });
  } catch (e: any) {
    console.error("[reminder] run failed:", e);
    return c.json({ error: "REMINDER_RUN_FAILED", message: e.message }, 500);
  }
});
