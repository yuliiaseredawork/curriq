import { verifyToken } from '@clerk/backend';

/**
 * Thrown when the request has no valid Clerk credentials.
 * Routes / the global error handler map this to HTTP 401.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'UNAUTHORIZED') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export async function getCurrentUserId(c: any): Promise<string> {
  const authHeader = c.req.header('authorization');

  // Debug: whether a bearer header is present (never log the token itself).
  console.log('[auth] authorization header present:', Boolean(authHeader));

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Empty bearer token');
  }

  // Prefer networkless verification via CLERK_JWT_KEY (PEM public key) when
  // available; otherwise fall back to fetching the JWKS using the secret key.
  const secretKey = process.env.CLERK_SECRET_KEY;
  const jwtKey = process.env.CLERK_JWT_KEY;

  if (!secretKey && !jwtKey) {
    // Misconfiguration, not the caller's fault — surface as a real error (500).
    console.error('[auth] CLERK_SECRET_KEY / CLERK_JWT_KEY not configured');
    throw new Error('CLERK_NOT_CONFIGURED');
  }

  let payload: any;
  try {
    payload = await verifyToken(token, {
      ...(secretKey ? { secretKey } : {}),
      ...(jwtKey ? { jwtKey } : {}),
    });
  } catch (e: any) {
    // Log the verification failure reason, but never the token.
    console.warn('[auth] token verification failed:', e?.reason ?? e?.message ?? e);
    throw new UnauthorizedError('Invalid token');
  }

  // Use email-based user ID for stable course ownership.
  // Requires adding email + email_verified to the Clerk session token:
  // Clerk Dashboard → Configure → Sessions → Customize session token:
  //   { "email": "{{user.primary_email_address.email_address}}",
  //     "email_verified": "{{user.primary_email_address.verification.status}}" }
  const email = payload.email as string | undefined;
  const emailVerified = payload.email_verified;

  let userId: string;
  if (email && (emailVerified === 'verified' || emailVerified === true)) {
    userId = `email:${email.toLowerCase()}`;
  } else {
    userId = `clerk:${payload.sub}`;
  }

  console.log('[auth] authenticated userId:', userId);
  return userId;
}
