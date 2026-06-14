import { FileQuestion, Home, Search } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-2xl rounded border border-border bg-panel p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border bg-background">
            <FileQuestion className="h-5 w-5 text-amber" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase text-muted">404 / route not found</p>
            <h1 className="mt-3 font-mono text-2xl font-semibold leading-tight md:text-3xl">This brief surface does not exist.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
              The requested page may have moved, the analysis may belong to another workspace, or the URL may be incomplete.
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/">
            <Home className="h-4 w-4" />
            Home
          </ButtonLink>
          <ButtonLink href="/demo" variant="secondary">
            <Search className="h-4 w-4" />
            Demo briefs
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
