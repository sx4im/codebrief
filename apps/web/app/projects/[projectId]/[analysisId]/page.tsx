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
import { ScrollProgress, StoryHero, Chapter, MotionProvider } from "@/components/brief/StoryScroll";
import { getBriefForUser, ServiceConfigurationError } from "@/lib/analysis/repository";

export default async function BriefPage({ params }: { params: Promise<{ projectId: string; analysisId: string }> }) {
  const [{ projectId, analysisId }, { userId }] = await Promise.all([params, auth()]);
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
            <BriefStory analysisId={analysisId} brief={brief} />
          )}
        </div>
      </section>
    </main>
  );
}

type Brief = NonNullable<Awaited<ReturnType<typeof getBriefForUser>>>;

function BriefStory({ analysisId, brief }: { analysisId: string; brief: Brief }) {
  // Only render chapters that produce content, so empty sections (e.g. no
  // flagged claims) don't leave a blank numbered slot and the NN/total count
  // stays contiguous.
  const chapters = [
    brief.topFindings.length > 0 ? <TopFindings key="findings" findings={brief.topFindings} /> : null,
    brief.flaggedClaims.length > 0 ? <FlaggedClaims key="claims" claims={brief.flaggedClaims} /> : null,
    <SystemNarrative key="narrative" narrative={brief.systemNarrative} />,
    brief.decisions.length > 0 ? <DecisionArchaeology key="decisions" decisions={brief.decisions} /> : null,
    brief.landmines.length > 0 ? <LandmineMap key="landmines" landmines={brief.landmines} /> : null,
    <RewriteAssessment key="assessment" assessment={brief.assessment} />,
    <QAChat key="qa" analysisId={analysisId} />,
    brief.architectureDiagram.nodes.length > 0 ? (
      <ArchitectureDiagram key="diagram" diagram={brief.architectureDiagram} landmines={brief.landmines} />
    ) : null,
  ].filter((section) => section !== null);

  return (
    <MotionProvider>
      <ScrollProgress />
      <StoryHero
        eyebrow="Technical brief"
        title={brief.repoFullName}
        subtitle={brief.assessment.uncertainty}
        action={
          <div className="flex gap-2">
            <ButtonLink href={`/api/analysis/${analysisId}/export/md`} variant="secondary">Markdown</ButtonLink>
            <ButtonLink href={`/api/analysis/${analysisId}/export/pdf`} variant="secondary">PDF</ButtonLink>
          </div>
        }
      />
      <div className="mt-20 space-y-24">
        {chapters.map((section, i) => (
          <Chapter key={section.key} index={i + 1} total={chapters.length}>
            {section}
          </Chapter>
        ))}
      </div>
    </MotionProvider>
  );
}

function StatePanel({ icon, title, body, actionHref }: { icon: "pending" | "error"; title: string; body: string; actionHref: string }) {
  const Icon = icon === "error" ? AlertTriangle : Clock;
  return (
    <div className="flex max-w-2xl gap-3 rounded-lg border border-border bg-card p-5 shadow-card">
      <Icon className={icon === "error" ? "mt-0.5 h-5 w-5 text-severity-critical" : "mt-0.5 h-5 w-5 text-primary"} />
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <p className="mt-2 text-sm leading-6 text-charcoal">{body}</p>
        <ButtonLink href={actionHref} variant="secondary" className="mt-4">View progress</ButtonLink>
      </div>
    </div>
  );
}
