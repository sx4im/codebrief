import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// NB: /api/billing/webhook is intentionally NOT protected — Stripe calls it
// server-to-server with no Clerk session. Only the user-initiated checkout is gated.
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/projects(.*)",
  "/settings(.*)",
  "/api/analysis(.*)",
  "/api/billing/checkout(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/api/(.*)"],
};
