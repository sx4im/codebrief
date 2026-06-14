import { AlertTriangle, Clock } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { BriefNav } from "@/components/layout/BriefNav";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopFindings } from "@/components/brief/TopFindings";
import { SystemNarrative } from "@/components/brief/SystemNarrative";
import { DecisionArchaeology } from "@/components/brief/DecisionArchaeology";
import { LandmineMap } from "@/components/brief/LandmineMap";
import { RewriteAssessment } from "@/components/brief/RewriteAssessment";
import { QAChat } from "@/components/brief/QAChat";
import { ArchitectureDiagram } from "@/components/diagram/ArchitectureDiagram";
import { ButtonLink } from "@/components/ui/Button";
import { FlaggedClaims } from "@/components/brief/FlaggedClaims";
import { getBriefForUser, ServiceConfigurationError } from "@/lib/analysis/repository";

export default async function BriefPage({ params }: { params: Promise<{ projectId: string; analysisId: string }> }) {
  const { projectId, analysisId } = await params;
  const { userId } = await auth();
  let brief = null;
  let error: string | null = null;
  if (userId) {
    try {
      brief = await getBriefForUser(userId, analysisId);
    } catch (caught) {
      error = caught instanceof ServiceConfigurationError ? caught.message : caught instanceof Error ? caught.message : "Brief unavailable";
    }
  }

  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <section className="min-w-0 flex-1">
        <BriefNav />
        <div className="px-4 py-8 lg:px-8">
          {error ? (
            <StatePanel
              icon="error"
              title="Brief unavailable"
              body={`${error}. Add the required infrastructure variables before opening live analysis output.`}
              actionHref={`/projects/${projectId}/${analysisId}/progress`}
            />
          ) : !brief ? (
            <StatePanel
              icon="pending"
              title="Brief is not ready"
              body="The analysis has not produced a completed brief yet. Track stage progress and retry failed runs from the progress page."
              actionHref={`/projects/${projectId}/${analysisId}/progress`}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-mono text-xs uppercase text-muted">technical brief</div>
                  <h1 className="mt-2 font-mono text-3xl font-semibold">{brief.repoFullName}</h1>
                  <p className="mt-2 text-sm text-muted">Models: {Object.values(brief.modelVersions).join(", ")}</p>
                </div>
                <div className="flex gap-2">
                  <ButtonLink href={`/api/analysis/${analysisId}/export/md`} variant="secondary">Markdown</ButtonLink>
                  <ButtonLink href={`/api/analysis/${analysisId}/export/pdf`} variant="secondary">PDF</ButtonLink>
                </div>
              </div>
              <div className="mt-10 space-y-12">
                <TopFindings findings={brief.topFindings} />
                <FlaggedClaims claims={brief.flaggedClaims} />
                <SystemNarrative narrative={brief.systemNarrative} />
                <DecisionArchaeology decisions={brief.decisions} />
                <LandmineMap landmines={brief.landmines} />
                <RewriteAssessment assessment={brief.assessment} />
                <QAChat analysisId={analysisId} />
                <ArchitectureDiagram diagram={brief.architectureDiagram} landmines={brief.landmines} />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function StatePanel({ icon, title, body, actionHref }: { icon: "pending" | "error"; title: string; body: string; actionHref: string }) {
  const Icon = icon === "error" ? AlertTriangle : Clock;
  return (
    <div className="flex max-w-2xl gap-3 rounded border border-border bg-panel p-5">
      <Icon className={icon === "error" ? "mt-0.5 h-5 w-5 text-danger" : "mt-0.5 h-5 w-5 text-blue"} />
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
        <ButtonLink href={actionHref} variant="secondary" className="mt-4">View progress</ButtonLink>
      </div>
    </div>
  );
}
