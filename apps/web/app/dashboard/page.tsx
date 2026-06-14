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
            <h1 className="font-mono text-2xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-muted">Recent analyses and usage.</p>
          </div>
          <ButtonLink href="/projects/new">
            <Plus className="h-4 w-4" />
            New analysis
          </ButtonLink>
        </div>
        {configurationError ? (
          <div className="mt-8 flex max-w-2xl gap-3 rounded border border-border bg-panel p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-danger" />
            <div>
              <div className="font-semibold">Database is not configured</div>
              <p className="mt-2 text-sm leading-6 text-muted">{configurationError}. Add `DATABASE_URL` and run `npm run db:migrate` before using live analyses.</p>
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="mt-8 rounded border border-border bg-panel p-6">
            <div className="font-semibold">No analyses yet</div>
            <p className="mt-2 text-sm text-muted">Start with a GitHub repository URL. The pipeline will create a progress record before the worker runs.</p>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded border border-border">
            {projects.map((project) => (
              <a
                key={project.id}
                href={project.latestAnalysisId ? projectHref(project) : "/projects/new"}
                className="focus-ring flex flex-wrap items-center justify-between gap-3 border-b border-border bg-panel p-4 transition hover:bg-panel2 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <FileSearch className="h-5 w-5 text-blue" />
                  <div>
                    <div className="font-mono text-sm">{project.repoFullName}</div>
                    <div className="text-xs text-muted">{project.lastAnalyzedAt ? new Date(project.lastAnalyzedAt).toLocaleString() : "Not analyzed yet"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded border border-border px-2 py-1 text-xs text-muted">{project.latestStatus}</span>
                  <span className="rounded border border-border px-2 py-1 text-xs">{project.latestVerdict || "No verdict"}</span>
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
