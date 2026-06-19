import Link from "next/link";

// DESIGN.md footer: surface-deep (black) canvas, on-dark text, quick-links grid
// above a divider-dark copyright row.
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-on-dark-mute">{title}</div>
      <ul className="mt-4 space-y-3 text-sm">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="text-on-dark/90 transition-colors hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-surface-deep text-on-dark">
      <div className="mx-auto max-w-content px-6 py-16">
        <div className="flex flex-col gap-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="font-display text-2xl font-bold">Codebrief</div>
            <p className="mt-3 text-sm leading-6 text-on-dark-mute">
              AI technical due diligence for inherited codebases — sourced briefs, landmines, and rewrite assessments.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-14 gap-y-10">
            <FooterCol
              title="Product"
              links={[
                ["Demo briefs", "/demo"],
                ["Analyze a repo", "/projects/new"],
                ["Dashboard", "/dashboard"],
              ]}
            />
            <FooterCol
              title="Account"
              links={[
                ["Sign in", "/sign-in"],
                ["Sign up", "/sign-up"],
                ["Settings", "/settings"],
              ]}
            />
          </div>
        </div>
        <div className="mt-14 border-t border-white/15 pt-6 text-xs text-on-dark-mute" suppressHydrationWarning>
          © {new Date().getFullYear()} Codebrief. Free and open.
        </div>
      </div>
    </footer>
  );
}
