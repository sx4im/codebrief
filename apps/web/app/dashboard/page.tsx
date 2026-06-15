import { AlertTriangle, FileSearch, Plus } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { ButtonLink } from "@/components/ui/Button";
import { getProjectsForUser, ServiceConfigurationError, type ProjectSummary } from "@/lib/analysis/repository";

export default async function DashboardPage() {
  const { userId } = await auth();
  let projects: ProjectSummary[] = [];
  let configurationError: string | null = null;
  if (userId) {
    try {
      projects = await getProjectsForUser(userId);
    } catch (error) {
      configurationError = error instanceof ServiceConfigurationError ? error.message : error instanceof Error ? error.message : "Dashboard unavailable";
    }
  }

  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <section className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
            <p className="mt-2 text-sm text-charcoal">Recent analyses and usage.</p>
          </div>
          <ButtonLink href="/projects/new">
            <Plus className="h-4 w-4" />
            New analysis
          </ButtonLink>
        </div>
        {configurationError ? (
          <div className="mt-8 flex max-w-2xl gap-3 rounded-lg border border-severity-critical/30 bg-severity-critical/5 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-severity-critical" />
            <div>
              <div className="font-semibold text-ink">Database is not configured</div>
              <p className="mt-2 text-sm leading-6 text-charcoal">{configurationError}. Add `DATABASE_URL` and run `npm run db:migrate` before using live analyses.</p>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
            <div className="font-semibold text-ink">No analyses yet</div>
            <p className="mt-2 text-sm text-charcoal">Start with a GitHub repository URL. The pipeline will create a progress record before the worker runs.</p>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-lg border border-border bg-card shadow-card">
            {projects.map((project) => (
              <a
                key={project.id}
                href={project.latestAnalysisId ? projectHref(project) : "/projects/new"}
                className="focus-ring flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card p-4 transition hover:bg-bone last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <FileSearch className="h-5 w-5 text-ink" />
                  <div>
                    <div className="font-mono text-sm text-ink">{project.repoFullName}</div>
                    <div className="text-xs text-mute">{project.lastAnalyzedAt ? new Date(project.lastAnalyzedAt).toLocaleString() : "Not analyzed yet"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-charcoal">{project.latestStatus}</span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-ink">{project.latestVerdict || "No verdict"}</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function projectHref(project: ProjectSummary) {
  if (!project.latestAnalysisId) return "/projects/new";
  if (project.latestStatus === "complete") return `/projects/${project.id}/${project.latestAnalysisId}`;
  return `/projects/${project.id}/${project.latestAnalysisId}/progress`;
}
