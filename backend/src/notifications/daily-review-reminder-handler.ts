import { runDailyReviewReminders } from "./daily-review-reminder";
import { logger } from "../observability/logger";

export async function handler() {
  const summary = await runDailyReviewReminders();
  logger.info("reminders.daily.completed", summary);
  return summary;
}
