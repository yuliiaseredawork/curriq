import { createHmac, timingSafeEqual } from "crypto";
import { getProviderSecret } from "../config/provider-secrets";

type Payload = { userId: string; expiresAt: number };

async function secret(): Promise<string> {
  return getProviderSecret("UNSUBSCRIBE_SIGNING_SECRET");
}

function signature(encoded: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret)
    .update(encoded)
    .digest("base64url");
}

export async function createUnsubscribeToken(
  userId: string,
  expiresAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60,
): Promise<string> {
  const encoded = Buffer.from(
    JSON.stringify({ userId, expiresAt } satisfies Payload),
  ).toString("base64url");
  return `${encoded}.${signature(encoded, await secret())}`;
}

export async function verifyUnsubscribeToken(token: string): Promise<string> {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) throw new Error("INVALID_UNSUBSCRIBE_TOKEN");
  const expected = signature(encoded, await secret());
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("INVALID_UNSUBSCRIBE_TOKEN");
  }
  const payload = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as Payload;
  if (
    !payload.userId ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    throw new Error("EXPIRED_UNSUBSCRIBE_TOKEN");
  }
  return payload.userId;
}
