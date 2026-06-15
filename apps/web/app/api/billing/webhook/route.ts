import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { constructWebhookEvent } from "@/lib/billing/stripe";
import { markUserLifetime, ServiceConfigurationError } from "@/lib/analysis/repository";

// Stripe calls this endpoint server-to-server with no Clerk session, so it must
// stay outside the protected-route matcher in proxy.ts. The raw body is required
// for signature verification, so we read request.text() rather than json().
export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (error) {
    if (error instanceof ServiceConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // Bad signature or malformed payload — reject so Stripe retries/surfaces it.
    return NextResponse.json({ error: "Webhook signature verification failed" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      const userId = session.client_reference_id || session.metadata?.userId || null;
      if (paid && userId) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const email = session.customer_details?.email || session.customer_email || undefined;
        await markUserLifetime({ userId, email, stripeCustomerId: customerId });
      }
    }
  } catch (error) {
    // Log server-side and 500 so Stripe retries delivery; the grant is idempotent.
    process.stderr.write(`stripe webhook handler failed for ${event.type}: ${error instanceof Error ? error.message : String(error)}\n`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
