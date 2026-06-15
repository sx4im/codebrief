import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

// DESIGN.md nav-bar: cream canvas, single hairline bottom border, 60px tall,
// wordmark left, nav centre, sign-in + primary CTA right.
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur">
      <nav className="mx-auto flex h-[60px] max-w-content items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="" width={26} height={26} className="rounded-[7px]" />
          <span className="font-display text-xl font-bold tracking-tightest">Codebrief</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-charcoal md:flex">
          <Link href="/demo" className="transition-colors hover:text-ink">
            Demo
          </Link>
          <Link href="/projects/new" className="transition-colors hover:text-ink">
            Analyze
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ButtonLink href="/sign-in" variant="ghost" className="hidden sm:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/projects/new">Analyze a repo</ButtonLink>
        </div>
      </nav>
    </header>
  );
}
