import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { Footer } from "@/components/layout/Footer";
import { demoBriefs } from "@/lib/sample-data";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <MarketingNav />
      <main className="mx-auto max-w-content px-4 py-16 sm:px-6">
        <h1 className="font-display text-4xl font-bold tracking-tightest text-ink sm:text-5xl">Public demo briefs</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-charcoal">
          Real, credentialed analyses of well-known open-source repositories — inspect the full brief format before
          running your own.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {demoBriefs.map((brief) => (
            <div
              key={brief.slug}
              className="flex flex-col rounded-lg border border-border bg-card p-6 transition-shadow hover:shadow-soft"
            >
              <div className="font-mono text-sm font-semibold text-ink">{brief.repoFullName}</div>
              <p className="mt-3 flex-1 text-sm leading-6 text-charcoal">{brief.summary}</p>
              <ButtonLink href={`/demo/${brief.slug}`} variant="secondary" className="mt-6 self-start">
                Open brief
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
