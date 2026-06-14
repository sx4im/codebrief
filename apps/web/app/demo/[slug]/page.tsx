import { notFound } from "next/navigation";
import { ArchitectureDiagram } from "@/components/diagram/ArchitectureDiagram";
import { DecisionArchaeology } from "@/components/brief/DecisionArchaeology";
import { LandmineMap } from "@/components/brief/LandmineMap";
import { RewriteAssessment } from "@/components/brief/RewriteAssessment";
import { SystemNarrative } from "@/components/brief/SystemNarrative";
import { TopFindings } from "@/components/brief/TopFindings";
import { FlaggedClaims } from "@/components/brief/FlaggedClaims";
import { ButtonLink } from "@/components/ui/Button";
import { demoBriefs, getDemoBrief } from "@/lib/sample-data";

export function generateStaticParams() {
  return demoBriefs.map((brief) => ({ slug: brief.slug }));
}

export default async function PublicDemoBriefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brief = getDemoBrief(slug);
  if (!brief) notFound();

  return (
    <main className="min-h-screen px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase text-muted">public demo brief</div>
            <h1 className="mt-2 font-mono text-3xl font-semibold">{brief.repoFullName}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{brief.assessment.uncertainty}</p>
          </div>
          <ButtonLink href="/demo" variant="secondary">All demos</ButtonLink>
        </div>
        <div className="mt-10 space-y-12">
          <TopFindings findings={brief.topFindings} />
          <FlaggedClaims claims={brief.flaggedClaims} />
          <SystemNarrative narrative={brief.systemNarrative} />
          <DecisionArchaeology decisions={brief.decisions} />
          <LandmineMap landmines={brief.landmines} />
          <RewriteAssessment assessment={brief.assessment} />
          <ArchitectureDiagram diagram={brief.architectureDiagram} landmines={brief.landmines} />
        </div>
      </div>
    </main>
  );
}
