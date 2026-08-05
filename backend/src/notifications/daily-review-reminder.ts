// Daily review-reminder job: find users with flashcards due, send each one a
// short nudge email deep-linking into /session, and never send twice in the
// same day (a REMINDER#DAILY record per user stores the last-sent date).
//
// Designed to be triggered once a day by any scheduler — EventBridge, Vercel
// Cron, or plain curl — via POST /notifications/daily-reviews (see
// api/routes/notifications.ts), or by invoking runDailyReviewReminders()
// directly from a scheduled Lambda.
//
// Only users whose userId embeds a verified address (the `email:<address>`
// form produced by auth) can receive email; `clerk:<sub>` users are skipped
// and counted in the summary.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

import { isCardDue, type Flashcard } from "../storage/flashcards";
import { createEmailService, type EmailService } from "../email/email-service";
import { getProviderSecret } from "../config/provider-secrets";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = () => process.env.FOCUS_AREAS_TABLE!;

const REMINDER_SK = "REMINDER#DAILY";

// --- Pure helpers (unit-tested) ----------------------------------------------

/** UTC calendar-day stamp, e.g. "2026-07-01" — the dedupe granularity. */
export function todayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when no reminder has been sent yet on `now`'s UTC day. */
export function shouldSendReminder(
  lastSentDate: string | null | undefined,
  now: Date,
): boolean {
  return (lastSentDate ?? "") !== todayStamp(now);
}

/** The deliverable address embedded in a `email:<address>` userId, or null. */
export function emailFromUserId(userId: string): string | null {
  if (!userId.startsWith("email:")) return null;
  const address = userId.slice("email:".length).trim();
  return address.includes("@") ? address : null;
}

/** Count due cards per user. Cards must carry their pk-derived userId. */
export function countDueByUser(
  cards: Array<Pick<Flashcard, "userId" | "status" | "nextReviewAt">>,
  now: Date,
): Map<string, number> {
  const due = new Map<string, number>();
  for (const card of cards) {
    if (!isCardDue(card as Flashcard, now)) continue;
    due.set(card.userId, (due.get(card.userId) ?? 0) + 1);
  }
  return due;
}

export type ReminderEmail = { subject: string; text: string; html: string };

/**
 * The reminder itself: "N concepts due · ~M min" with one CTA into /session.
 * Deliberately short — the email's whole job is the click.
 */
export function composeReminderEmail(
  dueCount: number,
  appUrl: string,
): ReminderEmail {
  const concepts = `${dueCount} concept${dueCount === 1 ? "" : "s"}`;
  // Mirrors the in-app estimate (~30s per card, minimum 1 minute).
  const minutes = Math.max(1, Math.round(dueCount * 0.5));
  const sessionUrl = `${appUrl.replace(/\/$/, "")}/session?src=email-daily`;

  const subject = `${concepts} due today`;
  const text = [
    `${concepts} due · ~${minutes} min`,
    "",
    "A quick review now keeps them fresh for the interview.",
    "",
    `Start your review: ${sessionUrl}`,
  ].join("\n");
  const html = [
    `<p style="font-size:16px;margin:0 0 8px"><strong>${concepts} due</strong> · ~${minutes} min</p>`,
    '<p style="color:#555;margin:0 0 16px">A quick review now keeps them fresh for the interview.</p>',
    `<p><a href="${sessionUrl}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;border-radius:10px;padding:10px 18px;font-weight:600">Start your review</a></p>`,
  ].join("\n");

  return { subject, text, html };
}

// --- The job ------------------------------------------------------------------

export type ReminderRunSummary = {
  usersWithDue: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoEmail: number;
  failures: number;
};

/** Scan every stored flashcard (paginated). Fine at early-user scale; swap for
 *  a GSI on nextReviewAt if the table grows large. */
async function scanAllCards(): Promise<Flashcard[]> {
  const cards: Flashcard[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: TABLE(),
        FilterExpression: "contains(sk, :cardMarker)",
        ExpressionAttributeValues: { ":cardMarker": "#CARD#" },
        ExclusiveStartKey: lastKey,
      }),
    );
    cards.push(...((res.Items as Flashcard[]) ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return cards;
}

async function getLastSentDate(userId: string): Promise<string | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { pk: `USER#${userId}`, sk: REMINDER_SK },
    }),
  );
  return (res.Item?.lastSentDate as string) ?? null;
}

async function markSent(userId: string, now: Date): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        pk: `USER#${userId}`,
        sk: REMINDER_SK,
        lastSentDate: todayStamp(now),
        updatedAt: now.toISOString(),
      },
    }),
  );
}

export async function runDailyReviewReminders(options?: {
  now?: Date;
  emailService?: EmailService;
  appUrl?: string;
}): Promise<ReminderRunSummary> {
  const now = options?.now ?? new Date();
  const email =
    options?.emailService ??
    createEmailService({
      RESEND_API_KEY: await getProviderSecret("RESEND_API_KEY").catch(
        () => undefined,
      ),
      EMAIL_FROM: process.env.EMAIL_FROM,
    });
  const appUrl = options?.appUrl ?? process.env.APP_URL ?? "https://curriq.app";

  const cards = await scanAllCards();
  const dueByUser = countDueByUser(cards, now);

  const summary: ReminderRunSummary = {
    usersWithDue: dueByUser.size,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoEmail: 0,
    failures: 0,
  };

  for (const [userId, dueCount] of dueByUser) {
    const address = emailFromUserId(userId);
    if (!address) {
      summary.skippedNoEmail += 1;
      continue;
    }

    // Dedupe: at most one reminder per user per UTC day.
    const lastSent = await getLastSentDate(userId);
    if (!shouldSendReminder(lastSent, now)) {
      summary.skippedAlreadySent += 1;
      continue;
    }

    const message = composeReminderEmail(dueCount, appUrl);
    try {
      const result = await email.send({ to: address, ...message });
      if (result.ok) {
        await markSent(userId, now);
        summary.sent += 1;
        // Structured event for CloudWatch-based traction metrics.
        console.log("[analytics] daily_review_email_sent", {
          dueCount,
          provider: result.provider,
        });
      } else {
        summary.failures += 1;
      }
    } catch (e) {
      summary.failures += 1;
      console.error("[reminder] send failed", String(e));
    }
  }

  console.log("[reminder] run complete", summary);
  return summary;
}
