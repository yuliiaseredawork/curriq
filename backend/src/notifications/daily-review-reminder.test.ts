// Local check:  npx tsx backend/src/notifications/daily-review-reminder.test.ts
//
// Pure tests for the daily review-reminder logic: same-day dedupe, email
// extraction from userIds, due-count grouping, and the email itself (count,
// time estimate, subject, deep link). No AWS/network calls.
import assert from "node:assert";

process.env.FOCUS_AREAS_TABLE ||= "test-table-not-used";

(async () => {
  const {
    todayStamp,
    shouldSendReminder,
    emailFromUserId,
    countDueByUser,
    composeReminderEmail,
  } = await import("./daily-review-reminder");

  const now = new Date("2026-07-01T09:00:00Z");

  // --- todayStamp / shouldSendReminder: one send per UTC day ------------------
  assert.strictEqual(todayStamp(now), "2026-07-01");
  assert.strictEqual(shouldSendReminder(null, now), true, "never sent → send");
  assert.strictEqual(shouldSendReminder(undefined, now), true);
  assert.strictEqual(
    shouldSendReminder("2026-06-30", now),
    true,
    "sent yesterday → send today",
  );
  assert.strictEqual(
    shouldSendReminder("2026-07-01", now),
    false,
    "already sent today → skip",
  );

  // --- emailFromUserId: only `email:<address>` userIds are deliverable --------
  assert.strictEqual(
    emailFromUserId("email:jane@example.com"),
    "jane@example.com",
  );
  assert.strictEqual(
    emailFromUserId("clerk:user_abc123"),
    null,
    "clerk-sub ids have no address",
  );
  assert.strictEqual(
    emailFromUserId("email:not-an-address"),
    null,
    "malformed address rejected",
  );
  assert.strictEqual(emailFromUserId(""), null);

  // --- countDueByUser: groups due ACTIVE cards per user ------------------------
  const past = "2026-06-30T00:00:00Z";
  const future = "2026-07-02T00:00:00Z";
  const cards = [
    { userId: "email:a@x.com", status: "ACTIVE", nextReviewAt: past },
    { userId: "email:a@x.com", status: "ACTIVE", nextReviewAt: past },
    { userId: "email:a@x.com", status: "ACTIVE", nextReviewAt: future }, // not yet due
    { userId: "email:a@x.com", status: "MASTERED", nextReviewAt: past }, // not active
    { userId: "email:b@x.com", status: "ACTIVE", nextReviewAt: past },
    { userId: "clerk:sub1", status: "ACTIVE", nextReviewAt: undefined }, // new card → due now
  ] as any[];
  const due = countDueByUser(cards, now);
  assert.strictEqual(
    due.get("email:a@x.com"),
    2,
    "counts only due, active cards",
  );
  assert.strictEqual(due.get("email:b@x.com"), 1);
  assert.strictEqual(
    due.get("clerk:sub1"),
    1,
    "cards with no nextReviewAt are due",
  );
  assert.strictEqual(due.size, 3);

  // --- composeReminderEmail: short, count-led, deep-linked ---------------------
  const mail = composeReminderEmail(3, "https://curriq.app/");
  assert.strictEqual(
    mail.subject,
    "3 concepts due today",
    "subject leads with the due count",
  );
  assert.ok(
    mail.text.includes("3 concepts due · ~2 min"),
    "body shows count + time estimate",
  );
  assert.ok(
    mail.text.includes("https://curriq.app/session?src=email-daily"),
    "CTA deep-links into /session (trailing slash normalized)",
  );
  assert.ok(
    mail.html.includes("/session?src=email-daily"),
    "html CTA deep-links too",
  );
  assert.ok(
    /interview/i.test(mail.text),
    "body ties the review to interview prep",
  );

  const single = composeReminderEmail(1, "https://curriq.app");
  assert.strictEqual(single.subject, "1 concept due today", "singular subject");
  assert.ok(single.text.includes("~1 min"), "minimum one-minute estimate");

  // No internal wording in anything learner-facing.
  for (const field of [mail.subject, mail.text, mail.html]) {
    assert.ok(
      !/chunk|INTERNAL|task/i.test(field),
      `email copy leaks internal wording: ${field}`,
    );
  }

  console.log("daily-review-reminder.test.ts OK");
})();
