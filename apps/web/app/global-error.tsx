"use client";

import { AlertTriangle, Home, RefreshCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-[#0d0d0d] px-4 py-12 text-[#f4f4f5]">
          <section className="w-full max-w-2xl rounded border border-[#7f1d1d] bg-[#141414] p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[#7f1d1d] bg-[#0d0d0d]">
                <AlertTriangle className="h-5 w-5 text-[#ef4444]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase text-[#ef4444]">root application error</p>
                <h1 className="mt-3 font-mono text-2xl font-semibold leading-tight md:text-3xl">Codebrief could not render this shell.</h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#a1a1aa]">
                  Retry the route. If the root shell fails again, use the digest to trace the deployment or runtime fault.
                </p>
                {error.digest ? (
                  <div className="mt-4 rounded border border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2 font-mono text-xs text-[#a1a1aa]">
                    digest: {error.digest}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded border border-[#3b82f6] bg-[#3b82f6] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#2563eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d]"
              >
                <RefreshCcw className="h-4 w-4" />
                Retry
              </button>
              <a
                href="/"
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded border border-[#2a2a2a] bg-[#1b1b1b] px-4 text-sm font-semibold text-[#f4f4f5] transition-colors hover:bg-[#141414] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d]"
              >
                <Home className="h-4 w-4" />
                Home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
