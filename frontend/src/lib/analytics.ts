// Minimal event-logging abstraction for early traction metrics. No vendor
// lock-in: events go to NEXT_PUBLIC_ANALYTICS_ENDPOINT as JSON when it's set
// (PostHog/Segment/custom collector can be plugged in later) and to the console
// in dev either way. Fire-and-forget — tracking must never break the product.

export type AnalyticsEvent =
  | "review_session_started"
  | "review_session_completed"
  | "first_session_completed"
  | "second_session_completed"
  | "review_email_clicked"
  | "demo_started"
  | "demo_completed";

export function track(
  event: AnalyticsEvent,
  props: Record<string, unknown> = {},
): void {
  try {
    if (process.env.NODE_ENV !== "production") {
      console.debug("[analytics]", event, props);
    }
    const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
    if (!endpoint || typeof window === "undefined") return;
    const payload = JSON.stringify({
      event,
      props,
      ts: new Date().toISOString(),
    });
    // sendBeacon survives navigation (e.g. the email deep-link click).
    if (navigator.sendBeacon?.(endpoint, payload)) return;
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throw from tracking
  }
}

// --- Session milestones (D1-style retention signals) --------------------------

const SESSION_COUNT_KEY = "curriq:completed-sessions";

/** Pure: which milestone events a completion count triggers. */
export function sessionMilestoneEvents(
  completedCount: number,
): AnalyticsEvent[] {
  if (completedCount === 1) return ["first_session_completed"];
  if (completedCount === 2) return ["second_session_completed"];
  return [];
}

/**
 * Record a completed review session (localStorage counter) and emit
 * review_session_completed plus any first/second-session milestone. Safe to
 * call in any environment — no-ops without localStorage.
 */
export function recordSessionCompleted(
  props: Record<string, unknown> = {},
): void {
  track("review_session_completed", props);
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const count =
      (parseInt(window.localStorage.getItem(SESSION_COUNT_KEY) ?? "0", 10) ||
        0) + 1;
    window.localStorage.setItem(SESSION_COUNT_KEY, String(count));
    for (const milestone of sessionMilestoneEvents(count))
      track(milestone, props);
  } catch {
    // never throw from tracking
  }
}
