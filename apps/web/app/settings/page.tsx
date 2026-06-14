import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { AccountDataControls } from "@/components/settings/AccountDataControls";
import { getUsageForUser, ServiceConfigurationError, type UsageSummary } from "@/lib/analysis/repository";
import { getGitHubOAuthToken } from "@/lib/github/oauth";
import { getHealthReport, type HealthItem } from "@/lib/health";

export default async function SettingsPage() {
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email = user?.primaryEmailAddress?.emailAddress || (userId ? `${userId}@codebrief.local` : null);
  const report = await getHealthReport();
  let usage: UsageSummary | null = null;
  let accountError: string | null = null;
  let githubConnected = false;
  let githubDetail = userId ? "GitHub OAuth is not connected." : "Sign in to check GitHub OAuth.";

  if (userId) {
    try {
      usage = await getUsageForUser(userId, email || undefined);
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
        <h1 className="font-mono text-2xl font-semibold">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Deployment preflight, account usage, repository connection state, exports, and deletion controls.
        </p>

        <div className="mt-8 grid max-w-5xl gap-4 md:grid-cols-3">
          <StatusTile label="Live analysis" value={report.liveAnalysisReady ? "Ready" : "Not ready"} ok={report.liveAnalysisReady} />
          <StatusTile label="Private repos" value={report.privateRepoReady ? "Ready" : "Not ready"} ok={report.privateRepoReady} />
        </div>

        <div className="mt-8">
          <h2 className="font-mono text-lg font-semibold">Account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Current plan, monthly usage, GitHub connection state, and data lifecycle controls for this signed-in user.
          </p>
        </div>

        <div className="mt-4 grid max-w-5xl gap-4 md:grid-cols-3">
          <StatusTile label="Signed in as" value={email || "Not signed in"} ok={Boolean(userId)} />
          <StatusTile label="GitHub" value={githubConnected ? "Connected" : "Not connected"} ok={githubConnected} detail={githubDetail} />
          <StatusTile label="Plan" value={usage ? usage.plan : "Unavailable"} ok={Boolean(usage)} detail={formatUsageDetail(usage)} />
        </div>

        {accountError ? (
          <div className="mt-4 flex max-w-5xl gap-3 rounded border border-border bg-panel p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber" />
            <div>
              <div className="font-semibold">Account usage unavailable</div>
              <p className="mt-2 text-sm leading-6 text-muted">{accountError}. Data export and deletion APIs will report the same configuration issue.</p>
            </div>
          </div>
        ) : null}

        <AccountDataControls isSignedIn={Boolean(userId)} />

        <div className="mt-8">
          <h2 className="font-mono text-lg font-semibold">Deployment Preflight</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Service readiness for live analysis, private repositories, storage, and generated exports.
          </p>
        </div>

        <div className="mt-6 max-w-5xl overflow-hidden rounded border border-border">
          {report.items.map((item) => (
            <div key={item.id} className="grid gap-3 border-b border-border bg-panel px-4 py-4 last:border-b-0 md:grid-cols-[220px_1fr]">
              <div className="flex items-center gap-3">
                <HealthIcon item={item} />
                <div className="font-semibold">{item.label}</div>
              </div>
              <div className="min-w-0 break-words text-sm text-muted">{item.detail}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusTile({ label, value, ok, detail }: { label: string; value: string; ok: boolean; detail?: string }) {
  return (
    <div className="rounded border border-border bg-panel p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={ok ? "mt-2 break-words font-mono text-sm text-blue" : "mt-2 break-words font-mono text-sm text-danger"}>{value}</div>
      {detail ? <p className="mt-2 text-xs leading-5 text-muted">{detail}</p> : null}
    </div>
  );
}

function HealthIcon({ item }: { item: HealthItem }) {
  if (item.state === "ok") return <CheckCircle2 className="h-4 w-4 text-blue" />;
  if (item.state === "error") return <XCircle className="h-4 w-4 text-danger" />;
  if (item.state === "optional") return <Circle className="h-4 w-4 text-muted" />;
  return <AlertTriangle className="h-4 w-4 text-amber" />;
}

function formatUsageDetail(usage: UsageSummary | null): string {
  if (!usage) return "DATABASE_URL is required for usage accounting.";
  const remaining = usage.limit === null ? "unlimited analyses" : `${Math.max(0, usage.limit - usage.analysesUsed)} of ${usage.limit} analyses remaining`;
  return `${usage.analysesUsed} analyses and ${usage.tokensUsed.toLocaleString()} tokens used this month; ${remaining}.`;
}
