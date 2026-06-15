import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccountDataControls } from "@/components/settings/AccountDataControls";
import { BillingPanel } from "@/components/settings/BillingPanel";
import {
  getAnalysisEntitlement,
  getUsageForUser,
  ServiceConfigurationError,
  type AnalysisEntitlement,
  type UsageSummary,
} from "@/lib/analysis/repository";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getGitHubOAuthToken } from "@/lib/github/oauth";
import { getHealthReport, type HealthItem } from "@/lib/health";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; upgrade?: string }>;
}) {
  const sp = await searchParams;
  const notice: "upgraded" | "cancelled" | "required" | null = sp.upgraded
    ? "upgraded"
    : sp.upgrade === "cancelled"
      ? "cancelled"
      : sp.upgrade === "required"
        ? "required"
        : null;
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = user?.primaryEmailAddress?.emailAddress || (userId ? `${userId}@codebrief.local` : null);
  const report = await getHealthReport();
  let usage: UsageSummary | null = null;
  let entitlement: AnalysisEntitlement | null = null;
  let accountError: string | null = null;
  let githubConnected = false;
  let githubDetail = userId ? "GitHub OAuth is not connected." : "Sign in to check GitHub OAuth.";

  if (userId) {
    try {
      usage = await getUsageForUser(userId, email || undefined);
      entitlement = await getAnalysisEntitlement(userId, email || undefined);
    } catch (error) {
      accountError =
        error instanceof ServiceConfigurationError ? error.message : error instanceof Error ? error.message : "Account usage is unavailable";
    }

    try {
      githubConnected = Boolean(await getGitHubOAuthToken(userId));
      githubDetail = githubConnected ? "GitHub OAuth token available for private repository access." : "GitHub OAuth is not connected.";
    } catch {
      githubDetail = "GitHub OAuth is not connected or Clerk OAuth access is unavailable.";
    }
  }

  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <section className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal">
          Deployment preflight, account usage, repository connection state, exports, and deletion controls.
        </p>

        <div className="mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
          <StatusTile label="Live analysis" value={report.liveAnalysisReady ? "Ready" : "Not ready"} ok={report.liveAnalysisReady} />
          <StatusTile label="Private repos" value={report.privateRepoReady ? "Ready" : "Not ready"} ok={report.privateRepoReady} />
        </div>

        <div className="mt-8">
          <h2 className="font-display text-xl font-bold text-ink">Account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal">
            Current plan, monthly usage, GitHub connection state, and data lifecycle controls for this signed-in user.
          </p>
        </div>

        <div className="mt-4 grid max-w-5xl gap-4 md:grid-cols-3">
          <StatusTile label="Signed in as" value={email || "Not signed in"} ok={Boolean(userId)} />
          <StatusTile label="GitHub" value={githubConnected ? "Connected" : "Not connected"} ok={githubConnected} detail={githubDetail} />
          <StatusTile label="Plan" value={usage ? usage.plan : "Unavailable"} ok={Boolean(usage)} detail={formatUsageDetail(usage)} />
        </div>

        {accountError ? (
          <div className="mt-4 flex max-w-5xl gap-3 rounded-lg border border-severity-medium/30 bg-severity-medium/5 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-severity-medium" />
            <div>
              <div className="font-semibold text-ink">Account usage unavailable</div>
              <p className="mt-2 text-sm leading-6 text-charcoal">{accountError}. Data export and deletion APIs will report the same configuration issue.</p>
            </div>
          </div>
        ) : null}

        <BillingPanel entitlement={entitlement} notice={notice} paymentsEnabled={isStripeConfigured()} />

        <AccountDataControls isSignedIn={Boolean(userId)} />

        <div className="mt-8">
          <h2 className="font-display text-xl font-bold text-ink">Deployment preflight</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal">
            Service readiness for live analysis, private repositories, storage, and generated exports.
          </p>
        </div>

        <div className="mt-6 max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-card">
          {report.items.map((item) => (
            <div key={item.id} className="grid gap-3 border-b border-border bg-card px-4 py-4 last:border-b-0 md:grid-cols-[220px_1fr]">
              <div className="flex items-center gap-3">
                <HealthIcon item={item} />
                <div className="font-semibold text-ink">{item.label}</div>
              </div>
              <div className="min-w-0 break-words text-sm text-charcoal">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusTile({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="text-sm text-charcoal">{label}</div>
      <div className={ok ? "mt-2 break-words font-mono text-sm text-success" : "mt-2 break-words font-mono text-sm text-severity-critical"}>{value}</div>
      {detail ? <p className="mt-2 text-xs leading-5 text-mute">{detail}</p> : null}
    </div>
  );
}

function HealthIcon({ item }: { item: HealthItem }) {
  if (item.state === "ok") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (item.state === "error") return <XCircle className="h-4 w-4 text-severity-critical" />;
  if (item.state === "optional") return <Circle className="h-4 w-4 text-mute" />;
  return <AlertTriangle className="h-4 w-4 text-severity-medium" />;
}

function formatUsageDetail(usage: UsageSummary | null): string {
  if (!usage) return "DATABASE_URL is required for usage accounting.";
  const remaining = usage.limit === null ? "unlimited analyses" : `${Math.max(0, usage.limit - usage.analysesUsed)} of ${usage.limit} analyses remaining`;
  return `${usage.analysesUsed} analyses and ${usage.tokensUsed.toLocaleString()} tokens used this month; ${remaining}.`;
}
