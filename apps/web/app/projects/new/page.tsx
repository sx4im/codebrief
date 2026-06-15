import { Sidebar } from "@/components/layout/Sidebar";
import { NewAnalysisFlow } from "@/components/analysis/NewAnalysisFlow";

export default function NewAnalysisPage() {
  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <section className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">New analysis</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-charcoal">
          Select a repository, choose analysis depth, and enqueue the pipeline.
        </p>
        <div className="mt-8">
          <NewAnalysisFlow />
        </div>
      </section>
    </main>
  );
}
