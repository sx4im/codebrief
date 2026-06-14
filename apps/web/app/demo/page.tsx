import { ButtonLink } from "@/components/ui/Button";
import { demoBriefs } from "@/lib/sample-data";

export default function DemoPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10">
      <h1 className="font-mono text-3xl font-semibold">Public Demo Briefs</h1>
      <p className="mt-2 text-sm text-muted">Static public briefs for inspecting the viewer format before running a credentialed analysis.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {demoBriefs.map((brief) => (
          <div key={brief.slug} className="rounded border border-border bg-panel p-5">
            <div className="font-mono text-sm text-blue">{brief.repoFullName}</div>
            <p className="mt-3 text-sm leading-6 text-muted">{brief.summary}</p>
            <ButtonLink href={`/demo/${brief.slug}`} variant="secondary" className="mt-5">Open brief</ButtonLink>
          </div>
        ))}
      </div>
    </main>
  );
}
