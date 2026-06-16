import { notFound } from "next/navigation";
import { ArchitectureDiagram } from "@/components/diagram/ArchitectureDiagram";
import { DecisionArchaeology } from "@/components/brief/DecisionArchaeology";
import { LandmineMap } from "@/components/brief/LandmineMap";
import { RewriteAssessment } from "@/components/brief/RewriteAssessment";
import { SystemNarrative } from "@/components/brief/SystemNarrative";
import { TopFindings } from "@/components/brief/TopFindings";
import { FlaggedClaims } from "@/components/brief/FlaggedClaims";
import { ButtonLink } from "@/components/ui/Button";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import {
  ScrollProgress,
  StoryHero,
  Chapter,
  MotionProvider,
} from "@/components/brief/StoryScroll";
import { demoBriefs, getDemoBrief } from "@/lib/sample-data";

export function generateStaticParams() {
  return demoBriefs.map((brief) => ({ slug: brief.slug }));
}

export default async function PublicDemoBriefPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brief = getDemoBrief(slug);
  if (!brief) notFound();

  // Skip sections with no content so empty chapters don't leave blank numbered slots.
  const chapters = [
    brief.topFindings.length > 0 ? <TopFindings key="findings" findings={brief.topFindings} /> : null,
    brief.flaggedClaims.length > 0 ? <FlaggedClaims key="claims" claims={brief.flaggedClaims} /> : null,
    <SystemNarrative key="narrative" narrative={brief.systemNarrative} />,
    brief.decisions.length > 0 ? <DecisionArchaeology key="decisions" decisions={brief.decisions} /> : null,
    brief.landmines.length > 0 ? <LandmineMap key="landmines" landmines={brief.landmines} /> : null,
    <RewriteAssessment key="assessment" assessment={brief.assessment} />,
    brief.architectureDiagram.nodes.length > 0 ? (
      <ArchitectureDiagram key="diagram" diagram={brief.architectureDiagram} landmines={brief.landmines} />
    ) : null,
  ].filter((section) => section !== null);

  return (
    <div className="min-h-screen bg-canvas">
      <MotionProvider>
        <ScrollProgress />
        <MarketingNav />
        <main className="mx-auto max-w-content px-4 py-16 sm:px-6 lg:px-8">
          <StoryHero
            eyebrow="Public demo brief"
            title={brief.repoFullName}
            subtitle={brief.assessment.uncertainty}
            action={
              <ButtonLink href="/demo" variant="secondary">
                All demos
              </ButtonLink>
            }
          />
          <div className="mt-24 space-y-28">
            {chapters.map((section, i) => (
              <Chapter key={i} index={i + 1} total={chapters.length}>
                {section}
              </Chapter>
            ))}
          </div>
        </main>
        <Footer />
      </MotionProvider>
    </div>
  );
}
