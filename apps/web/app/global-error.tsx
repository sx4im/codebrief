"use client";

import { AlertTriangle, Home, RefreshCcw } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-[#f9f7f3] px-4 py-12 text-[#202020]">
          <section className="w-full max-w-2xl rounded-2xl border border-[rgba(192,31,0,0.3)] bg-white p-6 shadow-[0_8px_24px_rgba(32,32,32,0.08)] md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[rgba(192,31,0,0.3)] bg-[#f9f7f3]">
                <AlertTriangle className="h-5 w-5 text-[#c01f00]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase tracking-wide text-[#c01f00]">root application error</p>
                <h1 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">Codebrief could not render this shell.</h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-[#646464]">
                  Retry the route. If the root shell fails again, use the digest to trace the deployment or runtime fault.
                </p>
                {error.digest ? (
                  <div className="mt-4 rounded-md border border-[rgba(32,32,32,0.12)] bg-[#f3f0e8] px-3 py-2 font-mono text-xs text-[#646464]">
                    digest: {error.digest}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#ea2804] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#c01f00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f7f3]"
              >
                <RefreshCcw className="h-4 w-4" />
                Retry
              </button>
              <a
                href="/"
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-[rgba(32,32,32,0.2)] bg-white px-6 text-sm font-semibold text-[#202020] transition-colors hover:bg-[#f3f0e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f7f3]"
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
