"use client";

import { useState } from "react";
import { ArrowRight, BadgeCheck, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FREE_ANALYSIS_LIMIT, LIFETIME_PRICE_USD } from "@codebrief/shared";

interface Entitlement {
  lifetime: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

const BENEFITS = [
  "Unlimited repository analyses, forever",
  "Public and private repositories",
  "Source-grounded Q&A and PDF / Markdown exports",
  "One-time payment — no subscription",
];

export function BillingPanel({
  entitlement,
  notice,
  paymentsEnabled,
}: {
  entitlement: Entitlement | null;
  notice: "upgraded" | "cancelled" | "required" | null;
  paymentsEnabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" } });
      const json = (await res.json()) as { url?: string; alreadyLifetime?: boolean; error?: string };
      if (json.alreadyLifetime) {
        window.location.assign("/settings?upgraded=1");
        return;
      }
      if (!res.ok || !json.url) throw new Error(json.error || "Checkout is unavailable right now");
      window.location.assign(json.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout failed");
      setLoading(false);
    }
  }

  const lifetime = entitlement?.lifetime ?? false;
  const used = entitlement?.used ?? 0;
  const limit = entitlement?.limit ?? FREE_ANALYSIS_LIMIT;
  const remaining = entitlement?.remaining ?? Math.max(0, FREE_ANALYSIS_LIMIT - used);

  return (
    <div className="mt-4 max-w-5xl">
      {notice === "upgraded" ? (
        <Banner tone="success">Payment confirmed — lifetime access is now active. Thank you!</Banner>
      ) : notice === "required" ? (
        <Banner tone="warn">You&apos;ve used all {limit ?? FREE_ANALYSIS_LIMIT} free analyses. Upgrade to keep analyzing repositories.</Banner>
      ) : notice === "cancelled" ? (
        <Banner tone="muted">Checkout was cancelled. You can upgrade any time.</Banner>
      ) : null}

      {lifetime ? (
        <div className="flex items-start gap-4 rounded-lg border border-success/30 bg-success/5 p-6">
          <BadgeCheck className="mt-0.5 h-6 w-6 shrink-0 text-success" />
          <div>
            <div className="font-display text-lg font-bold text-ink">Lifetime access active</div>
            <p className="mt-1 text-sm leading-6 text-charcoal">
              You have unlimited repository analyses. {used.toLocaleString()} run so far. Thank you for supporting Codebrief.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 rounded-lg border border-border bg-card p-6 shadow-card md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Lifetime access</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-tight text-ink">${LIFETIME_PRICE_USD}</span>
              <span className="text-sm text-mute">one-time</span>
            </div>
            <p className="mt-3 text-sm leading-6 text-charcoal">
              You&apos;ve used <span className="font-semibold text-ink">{used}</span> of {limit ?? FREE_ANALYSIS_LIMIT} free analyses
              {remaining > 0 ? ` (${remaining} left)` : " — limit reached"}. Unlock unlimited analyses with a single payment.
            </p>
            <div className="mt-5">
              {paymentsEnabled ? (
                <Button type="button" onClick={upgrade} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {loading ? "Redirecting…" : `Get lifetime access — $${LIFETIME_PRICE_USD}`}
                  {!loading ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              ) : (
                <p className="text-sm text-mute">Lifetime upgrades aren&apos;t available yet — check back soon.</p>
              )}
              {error ? <p className="mt-3 text-sm text-severity-critical">{error}</p> : null}
            </div>
          </div>
          <ul className="space-y-2.5">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm leading-6 text-charcoal">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Banner({ tone, children }: { tone: "success" | "warn" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/5 text-ink"
      : tone === "warn"
        ? "border-severity-medium/30 bg-severity-medium/5 text-ink"
        : "border-border bg-bone/50 text-charcoal";
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm leading-6 ${cls}`}>{children}</div>;
}
