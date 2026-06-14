import { AlertTriangle } from "lucide-react";
import type { SourcedClaim } from "@codebrief/shared";
import { SourceList } from "./SourceList";

export function FlaggedClaims({ claims }: { claims: SourcedClaim[] }) {
  if (claims.length === 0) return null;
  return (
    <section id="flagged-claims" className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber" />
        <h2 className="font-mono text-xl font-semibold">Flagged Claims</h2>
      </div>
      <div className="space-y-3">
        {claims.map((claim, index) => (
          <article key={`${claim.claim}-${index}`} className="rounded border border-amber/50 bg-amber/10 p-4">
            <div className="font-mono text-xs uppercase text-amber">confidence {claim.confidence}</div>
            <p className="mt-2 text-sm leading-6 text-zinc-200">{claim.claim}</p>
            <SourceList sources={claim.sources} />
          </article>
        ))}
      </div>
    </section>
  );
}
