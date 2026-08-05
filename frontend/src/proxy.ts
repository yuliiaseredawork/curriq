import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// '/' is the public landing page for signed-out visitors (the home dashboard
// for signed-in users lives at the same route, gated client-side by Clerk's
// auth state). '/demo' is the playable no-signup demo course, and the legal
// pages are public. Every other app/course/session/API route stays protected.
const isPublicRoute = createRouteMatcher([
  "/",
  "/demo(.*)",
  "/privacy",
  "/terms",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
