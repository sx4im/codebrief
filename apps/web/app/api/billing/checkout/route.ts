import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createLifetimeCheckoutSession } from "@/lib/billing/stripe";
import { getAnalysisEntitlement, ServiceConfigurationError } from "@/lib/analysis/repository";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkRateLimit({ key: `billing:checkout:${userId}`, limit: 10, windowMs: 60 * 60 * 1000 });
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Checkout rate limit exceeded", retryAfterSeconds: rateLimit.retryAfterSeconds },
      { status: 429, headers: { "retry-after": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress || undefined;
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");

  try {
    // Already paid — no need to charge again.
    const entitlement = await getAnalysisEntitlement(userId, email).catch(() => null);
    if (entitlement?.lifetime) {
      if (wantsHtml) return NextResponse.redirect(new URL("/settings?upgraded=1", request.url), { status: 303 });
      return NextResponse.json({ alreadyLifetime: true }, { status: 200 });
    }

    const origin = new URL(request.url).origin;
    const { url } = await createLifetimeCheckoutSession({ userId, email, origin });
    if (wantsHtml) return NextResponse.redirect(url, { status: 303 });
    return NextResponse.json({ url }, { status: 200 });
  } catch (error) {
    if (error instanceof ServiceConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start checkout" }, { status: 500 });
  }
}
