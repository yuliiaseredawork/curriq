import { Hono } from "hono";
import { z } from "zod";
import { verifyUnsubscribeToken } from "../../email/unsubscribe-token";
import { setEmailSubscribed } from "../../storage/accounts";
import { getCurrentUserId } from "../../auth/current-user";

export const emailPreferences = new Hono();

emailPreferences.post("/email/unsubscribe", async (c) => {
  const { token } = z
    .object({ token: z.string().min(20) })
    .parse(await c.req.json());
  try {
    const userId = await verifyUnsubscribeToken(token);
    await setEmailSubscribed(userId, false);
    return c.json({ unsubscribed: true });
  } catch {
    return c.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, 400);
  }
});

emailPreferences.post("/account/email-preferences", async (c) => {
  const userId = await getCurrentUserId(c);
  const { subscribed } = z
    .object({ subscribed: z.boolean() })
    .parse(await c.req.json());
  await setEmailSubscribed(userId, subscribed);
  return c.json({ subscribed });
});
