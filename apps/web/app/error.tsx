"use client";

import { AlertTriangle, Home, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-2xl rounded border border-danger/60 bg-panel p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-danger/50 bg-background">
            <AlertTriangle className="h-5 w-5 text-danger" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase text-danger">application error</p>
            <h1 className="mt-3 font-mono text-2xl font-semibold leading-tight md:text-3xl">Codebrief hit an unrecovered state.</h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted">
              Retry the view. If it fails again, keep the digest with the failed analysis or route so the underlying stage can be traced.
            </p>
            {error.digest ? (
              <div className="mt-4 rounded border border-border bg-background px-3 py-2 font-mono text-xs text-muted">
                digest: {error.digest}
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={reset}>
            <RefreshCcw className="h-4 w-4" />
            Retry
          </Button>
          <ButtonLink href="/" variant="secondary">
            <Home className="h-4 w-4" />
            Home
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
