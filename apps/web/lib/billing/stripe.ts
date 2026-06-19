import "server-only";
import Stripe from "stripe";
import { LIFETIME_PRICE_USD } from "@codebrief/shared";
import { ServiceConfigurationError } from "@/lib/analysis/repository";

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ServiceConfigurationError("STRIPE_SECRET_KEY is not configured");
  cached ||= new Stripe(key);
  return cached;
}

/**
 * Creates a one-time Checkout Session for lifetime access. Uses STRIPE_PRICE_ID
 * when configured (recommended for production) and otherwise builds an inline
 * price from LIFETIME_PRICE_USD. The userId is carried in both
 * client_reference_id and metadata so the webhook can grant access to the right
 * account regardless of which field Stripe echoes back.
 */
export async function createLifetimeCheckoutSession(input: {
  userId: string;
  email?: string;
  origin: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID?.trim();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      priceId
        ? { price: priceId, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: LIFETIME_PRICE_USD * 100,
              product_data: {
                name: "Codebrief — Lifetime access",
                description: "Unlimited repository analyses, forever. One-time payment.",
              },
            },
          },
    ],
    client_reference_id: input.userId,
    metadata: { userId: input.userId },
    payment_intent_data: { metadata: { userId: input.userId } },
    customer_email: input.email,
    allow_promotion_codes: true,
    success_url: `${input.origin}/settings?upgraded=1`,
    cancel_url: `${input.origin}/settings?upgrade=cancelled`,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

/** Verifies and parses a Stripe webhook event from the raw request body. */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new ServiceConfigurationError("STRIPE_WEBHOOK_SECRET is not configured");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
