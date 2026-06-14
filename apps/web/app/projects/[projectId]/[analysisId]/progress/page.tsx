import { Sidebar } from "@/components/layout/Sidebar";
import { ProgressTracker } from "@/components/pipeline/ProgressTracker";

export default async function ProgressPage({ params }: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await params;
  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <section className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <h1 className="font-mono text-2xl font-semibold">Analysis Progress</h1>
        <p className="mt-2 text-sm text-muted">Analysis ID: {analysisId}</p>
        <div className="mt-8 max-w-3xl">
          <ProgressTracker analysisId={analysisId} />
        </div>
      </section>
    </main>
  );
}
