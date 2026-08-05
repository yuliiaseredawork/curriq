import { verifyToken } from "@clerk/backend";
import { getProviderSecret } from "../config/provider-secrets";
import { resolveStableUserId } from "./identity-map";

/**
 * Thrown when the request has no valid Clerk credentials.
 * Routes / the global error handler map this to HTTP 401.
 */
export class UnauthorizedError extends Error {
  constructor(message = "UNAUTHORIZED") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export type CurrentUserIdentity = {
  userId: string;
  clerkUserId: string;
  email?: string;
};

export async function getCurrentUserIdentity(
  c: any,
): Promise<CurrentUserIdentity> {
  const cached = c.get?.("currentUser");
  if (cached?.userId && cached?.clerkUserId) return cached;

  const authHeader = c.req.header("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new UnauthorizedError("Empty bearer token");
  }

  // Prefer networkless verification via CLERK_JWT_KEY (PEM public key) when
  // available; otherwise fall back to fetching the JWKS using the secret key.
  const secretKey = process.env.CLERK_JWT_KEY
    ? undefined
    : await getProviderSecret("CLERK_SECRET_KEY").catch(() => undefined);
  const jwtKey = process.env.CLERK_JWT_KEY;

  if (!secretKey && !jwtKey) {
    // Misconfiguration, not the caller's fault — surface as a real error (500).
    console.error("[auth] CLERK_SECRET_KEY / CLERK_JWT_KEY not configured");
    throw new Error("CLERK_NOT_CONFIGURED");
  }

  let payload: any;
  try {
    payload = await verifyToken(token, {
      ...(secretKey ? { secretKey } : {}),
      ...(jwtKey ? { jwtKey } : {}),
    });
  } catch (e: any) {
    // Log the verification failure reason, but never the token.
    console.warn(
      "[auth] token verification failed:",
      e?.reason ?? e?.message ?? e,
    );
    throw new UnauthorizedError("Invalid token");
  }

  if (!payload.sub) throw new UnauthorizedError("Token has no subject");

  // Preserve the existing ownership ID format while recording the immutable
  // Clerk subject separately for account management and deletion.
  // Requires adding email + email_verified to the Clerk session token:
  // Clerk Dashboard → Configure → Sessions → Customize session token:
  //   { "email": "{{user.primary_email_address.email_address}}",
  //     "email_verified": "{{user.primary_email_address.verification.status}}" }
  const email = payload.email as string | undefined;
  const emailVerified = payload.email_verified;

  let candidateUserId: string;
  if (email && (emailVerified === "verified" || emailVerified === true)) {
    candidateUserId = `email:${email.toLowerCase()}`;
  } else {
    candidateUserId = `clerk:${payload.sub}`;
  }

  const clerkUserId = String(payload.sub);
  const userId = await resolveStableUserId(clerkUserId, candidateUserId);

  const identity: CurrentUserIdentity = {
    userId,
    clerkUserId,
    ...(email && (emailVerified === "verified" || emailVerified === true)
      ? { email: email.toLowerCase() }
      : {}),
  };
  c.set?.("userId", userId);
  c.set?.("currentUser", identity);
  return identity;
}

export async function getCurrentUserId(c: any): Promise<string> {
  const cached = c.get?.("userId");
  if (typeof cached === "string" && cached) return cached;
  return (await getCurrentUserIdentity(c)).userId;
}
