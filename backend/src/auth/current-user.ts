import { verifyToken } from "@clerk/backend";
import { getProviderSecret } from "../config/provider-secrets";

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

export async function getCurrentUserId(c: any): Promise<string> {
  const cached = c.get?.("userId");
  if (typeof cached === "string" && cached) return cached;

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

  // Use email-based user ID for stable course ownership.
  // Requires adding email + email_verified to the Clerk session token:
  // Clerk Dashboard → Configure → Sessions → Customize session token:
  //   { "email": "{{user.primary_email_address.email_address}}",
  //     "email_verified": "{{user.primary_email_address.verification.status}}" }
  const email = payload.email as string | undefined;
  const emailVerified = payload.email_verified;

  let userId: string;
  if (email && (emailVerified === "verified" || emailVerified === true)) {
    userId = `email:${email.toLowerCase()}`;
  } else {
    userId = `clerk:${payload.sub}`;
  }

  c.set?.("userId", userId);
  return userId;
}
